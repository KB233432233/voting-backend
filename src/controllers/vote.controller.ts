import type { Response } from "express";
import type { AuthenticatedRequest } from "../types/auth";
import prisma from "../config/db";
import { z } from "zod";
import { generateSnowflakeIdBigInt } from "../utils/snowflake";
import crypto from "crypto";
import { relayerQueue } from "../config/queue";
import { Prisma } from "@prisma/client";
import {
  getPollChainState,
  chainStateToStatus,
} from "../utils/chainVoting";
import {
  buildVoteTxData,
  getVotingContractAddress,
} from "../config/contract";
import { relayerWorker } from "../workers/relayer.worker";

// Validation Schemas
const createVoteSchema = z.object({
  pollId: z.string().regex(/^\d+$/, "Poll ID must be numeric"),
  serial: z.string().regex(/^[a-fA-F0-9]+$/, "Serial must be hex"),
  voteHash: z.string().regex(/^[a-fA-F0-9]+$/, "Vote hash must be hex"),
  signature: z.string().regex(/^[a-fA-F0-9]+$/, "Signature must be hex"),
  // 0-based candidate indices in preference order (as submitted by the client)
  rankings: z
    .array(z.number().int().min(0))
    .min(1, "Rankings must contain at least one candidate"),
});

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  pollId: z.string().regex(/^\d+$/).optional(),
});

// Helper: Load RSA Public Key
function loadPublicKey(): crypto.KeyObject {
  const pemKey = process.env.RSA_PUBLIC_KEY_PEM?.replace(/\\n/g, "\n");
  if (!pemKey) throw new Error("RSA_PUBLIC_KEY_PEM not configured");
  return crypto.createPublicKey(pemKey);
}

// Local interface to bypass @types/node limitation
interface RsaJwk {
  kty: string;
  n: string;
  e: string;
  [key: string]: any;
}

/**
 * RSA Verification (sig^e mod n == hash)
 */
function verifyVoteSignature(sigHex: string, hashHex: string): boolean {
  try {
    const pubKey = loadPublicKey();
    // ✅ Use local interface instead of crypto.JsonWebKey
    const jwk = pubKey.export({ format: "jwk" }) as RsaJwk;

    const n = BigInt("0x" + Buffer.from(jwk.n, "base64url").toString("hex"));
    const e = BigInt("0x" + Buffer.from(jwk.e, "base64url").toString("hex"));
    const sig = BigInt("0x" + sigHex);
    const expectedHash = BigInt("0x" + hashHex);

    // Modular exponentiation: sig^e mod n
    let result = 1n;
    let base = sig % n;
    let exp = e;
    while (exp > 0n) {
      if (exp % 2n === 1n) result = (result * base) % n;
      exp = exp / 2n;
      base = (base * base) % n;
    }
    return result === expectedHash;
  } catch {
    return false;
  }
}

/**
 * POST /votes
 * Submit a new anonymous vote (requires valid JWT + RSA signature verification)
 */
export async function createVote(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const parse = createVoteSchema.safeParse(req.body);
    if (!parse.success) {
      res
        .status(400)
        .json({ error: "Invalid input", details: parse.error.issues });
      return;
    }

    const { pollId, serial, voteHash, signature, rankings } = parse.data;
    const pollIdBigInt = BigInt(pollId);

    // Verify poll status
    const poll = await prisma.poll.findUnique({ where: { id: pollIdBigInt } });
    if (!poll) {
      res.status(404).json({ error: "Poll not found" });
      return;
    }
    const candidateCount = await prisma.candidate.count({
      where: { pollId: pollIdBigInt },
    });

    // Validate rankings: distinct 0-based indices within candidate count
    if (rankings.some((r) => r >= candidateCount)) {
      res.status(400).json({ error: "Invalid ranking: index out of range" });
      return;
    }
    if (new Set(rankings).size !== rankings.length) {
      res.status(400).json({ error: "Invalid ranking: duplicate choices" });
      return;
    }

    let status: string = poll.status;
    let chainChecked = false;
    if (poll.chainPollId != null) {
      const chainState = await getPollChainState(poll.chainPollId);
      if (chainState !== null) {
        status = chainStateToStatus(chainState);
        chainChecked = true;
      } else {
        console.warn(
          `[vote] Chain state unavailable for poll ${pollId}, falling back to DB status '${poll.status}'`,
        );
      }
    }
    if (
      (chainChecked && status !== "active") ||
      (!chainChecked && status !== "active" && status !== "draft")
    ) {
      res.status(403).json({ error: "Voting is closed for this poll", status });
      return;
    }

    // The relayer broadcasts contract.vote(chainPollId, ranking) — the on-chain
    // poll id, NOT the backend snowflake id.
    if (poll.chainPollId == null) {
      res
        .status(400)
        .json({ error: "Poll is not deployed on the blockchain yet" });
      return;
    }

    // Verify cryptographic signature
    if (!verifyVoteSignature(signature, voteHash)) {
      res.status(400).json({ error: "Invalid RSA signature on vote hash" });
      return;
    }

    // Verify the commitment: voteHash must equal SHA256(serial + JSON.stringify(rankings)).
    // This ties the relayed rankings to the blindly-signed commitment.
    const recomputedHash = crypto
      .createHash("sha256")
      .update(serial + JSON.stringify(rankings))
      .digest("hex");
    if (recomputedHash !== voteHash.toLowerCase()) {
      res.status(400).json({ error: "Commitment mismatch: rankings do not match vote hash" });
      return;
    }

    // Prepare transaction payload for the relayer: encode contract.vote(pollId, ranking)
    const txPayload = {
      txData: buildVoteTxData(poll.chainPollId, rankings),
      to: getVotingContractAddress(),
      value: "0",
      gasLimit: "210000",
    };

    const [vote, transaction] = await prisma.$transaction(async (tx) => {
      const newVote = await tx.vote.create({
        data: {
          id: generateSnowflakeIdBigInt(),
          pollId: pollIdBigInt,
          serial: Buffer.from(serial, "hex"),
          voteHash: Buffer.from(voteHash, "hex"),
          signature: Buffer.from(signature, "hex"),
          castedAt: new Date(),
        },
      });
      const newTx = await tx.transaction.create({
        data: {
          id: generateSnowflakeIdBigInt(),
          voteId: newVote.id,
          pollId: pollIdBigInt,
          // Unique placeholder (tx_hash is UNIQUE); the relayer overwrites
          // it with the real hash after broadcasting.
          txHash: "0x" + crypto.randomBytes(32).toString("hex"),
          status: "pending",
          chain: process.env.DEFAULT_CHAIN || "polygon",
          payload: txPayload as Prisma.InputJsonValue,
        },
      });

      return [newVote, newTx] as const;
    });

    await relayerQueue.add(
      "submit-vote",
      {
        txId: transaction.id.toString(), // String for JSON safety
        txHash: transaction.txHash,
        voteId: vote.id.toString(),
        pollId: vote.pollId.toString(),
        payload: transaction.payload, // Contains { txData: "0x...", to, value, etc. }
      },
      {
        // Optional: override job options per-vote
        jobId: `vote-${vote.id.toString()}`, // Idempotent job ID
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    console.info(
      `[vote] Relayer job queued for vote ${vote.id} (tx: ${transaction.txHash})`,
    );
    await relayerWorker( {
      txId: transaction.id.toString(),
      voteId: vote.id.toString(),
      serial: Buffer.from(vote.serial).toString("hex"),
      rankings: rankings,
      gasLimit: "210000",
      pollId: poll.chainPollId
    });

    res
      .status(201)
      .json({ success: true, message: "Vote submitted anonymously" });
  } catch (error: any) {
    // Handle unique constraint violation (duplicate serial)
    if (error.code === "P2002" && error.meta?.target?.includes("serial")) {
      res.status(409).json({ error: "Duplicate serial detected" });
      return;
    }
    console.error("Create vote error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /votes
 * List votes (admin/tally prep). Returns only commitment data.
 */
export async function getVotes(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const parse = querySchema.safeParse(req.query);
    if (!parse.success) {
      res
        .status(400)
        .json({ error: "Invalid query params", details: parse.error.issues });
      return;
    }

    const { page, limit, pollId } = parse.data;
    const skip = (page - 1) * limit;
    const where = pollId ? { pollId: BigInt(pollId) } : {};

    const [votes, total] = await prisma.$transaction([
      prisma.vote.findMany({
        where,
        orderBy: { castAt: "asc" },
        skip,
        take: limit,
      }),
      prisma.vote.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      votes: votes.map((v: any) => ({
        id: v.id.toString(),
        pollId: v.pollId.toString(),
        serial: Buffer.from(v.serial).toString("hex"),
        voteHash: Buffer.from(v.voteHash).toString("hex"),
        signature: Buffer.from(v.signature).toString("hex"),
        castAt: v.castAt,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Get votes error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /votes/:id
 * Get single vote by ID
 */
export async function getVote(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const idParam = req.params.id;
    if (!idParam) {
      res.status(400).json({ error: "Invalid vote ID" });
      return;
    }
    const id = BigInt(idParam.toString());
    const vote = await prisma.vote.findUnique({ where: { id } });
    if (!vote) {
      res.status(404).json({ error: "Vote not found" });
      return;
    }

    res.status(200).json({
      success: true,
      vote: {
        id: vote.id.toString(),
        pollId: vote.pollId.toString(),
        serial: Buffer.from(vote.serial).toString("hex"),
        voteHash: Buffer.from(vote.voteHash).toString("hex"),
        signature: Buffer.from(vote.signature).toString("hex"),
        castAt: vote.castAt,
      },
    });
  } catch (error) {
    console.error("Get vote error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * DELETE /votes/:id
 * Revoke vote (ONLY allowed if poll is draft/active & no tally exists)
 */
export async function deleteVote(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const idParam = req.params.id;
    if (!idParam) {
      res.status(400).json({ error: "Invalid vote ID" });
      return;
    }
    const id = BigInt(idParam.toString());
    const vote = await prisma.vote.findUnique({
      where: { id },
      include: { poll: { select: { status: true } } },
    });

    if (!vote) {
      res.status(404).json({ error: "Vote not found" });
      return;
    }
    if (vote.poll.status === "tallied") {
      res
        .status(403)
        .json({ error: "Cannot delete vote after tally is published" });
      return;
    }

    await prisma.vote.delete({ where: { id } });
    res.status(200).json({ success: true, message: "Vote revoked" });
  } catch (error) {
    console.error("Delete vote error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
