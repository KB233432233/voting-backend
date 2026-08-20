import { Response } from "express";
import { z } from "zod";
import crypto from "crypto";
import prisma from "../config/db.ts";
import type { AuthenticatedRequest } from "../types/auth.ts";
import { generateSnowflakeIdBigInt } from "../utils/snowflake.ts";
import { encryptRankings } from "../utils/voteEncryption.ts";
import { Prisma } from "@prisma/client";
import { modPow } from "bigint-mod-arith";

const revealBodySchema = z.object({
  serial: z.string().regex(/^0x[a-fA-F0-9]+$/, "Serial must be a hex string"),
  rankings: z
    .array(z.number().int().positive())
    .min(1, "Rankings must contain at least one candidate ID"),
});
/**
 * Verify blind signature: s^e mod n == voteHash
 * Uses bigint-mod-arith for efficient modular exponentiation
 */
function verifyBlindSignature(
  signatureHex: string,
  voteHashHex: string,
  publicKeyN: string, // Hex string (no 0x)
  publicKeyE: string, // Hex string (no 0x)
): boolean {
  try {
    const n = BigInt(`0x${publicKeyN}`);
    const e = BigInt(`0x${publicKeyE}`);
    const sig = BigInt(`0x${signatureHex}`);
    const expectedHash = BigInt(`0x${voteHashHex}`);

    const result = modPow(sig, e, n);

    return result === expectedHash;
  } catch {
    return false;
  }
}

export const revealVote = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    // Validate request body
    const parseResult = revealBodySchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: "Invalid request format",
        details: parseResult.error.issues,
      });
      return;
    }

    const { serial, rankings } = parseResult.data;

    // Recompute voteHash = SHA256(serial || rankings_json)
    const rankingsJson = JSON.stringify(rankings);
    const dataToHash = serial + rankingsJson;
    const recomputedHash = crypto
      .createHash("sha256")
      .update(dataToHash)
      .digest("hex");
    const voteHashHex = recomputedHash; // No '0x' prefix

    // Fetch stored vote by serial (no userId for anonymity)
    const vote = await prisma.vote.findFirst({
      where: {
        serial: Buffer.from(serial, "hex"),
      },
    });

    if (!vote) {
      res.status(404).json({ error: "Vote not found" });
      return;
    }

    // Verify vote is in committed state
    if (vote.status !== "committed") {
      res
        .status(409)
        .json({ error: "Vote has already been revealed or is invalid" });
      return;
    }

    // Verify recomputed hash matches stored hash
    const voteHashFromDb = Buffer.from(vote.voteHash).toString("hex");
    if (voteHashFromDb !== voteHashHex) {
      res
        .status(409)
        .json({ error: "Commitment mismatch: hash verification failed" });
      return;
    }

    // Fetch poll to get RSA public key parameters
    const poll = await prisma.poll.findUnique({
      where: { id: vote.pollId },
    });

    if (!poll || !poll.rsaPublicKeyN || !poll.rsaPublicKeyE) {
      res.status(404).json({ error: "Poll configuration not found" });
      return;
    }


    // Verify RSA signature
    const isValidSignature = verifyBlindSignature(
      
    Buffer.from(vote.signature).toString("hex"),
    Buffer.from(vote.voteHash).toString("hex"),
    Buffer.from(poll.rsaPublicKeyN!).toString("hex"),
    Buffer.from(poll.rsaPublicKeyE!).toString("hex")
    );
    if (!isValidSignature) {
      res
        .status(409)
        .json({ error: "Commitment mismatch: signature verification failed" });
      return;
    }

    // Encrypt the rankings before storing
    const encryptedRankings = encryptRankings(rankings);

    // Update vote status and store encrypted rankings
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Update vote status
      await tx.vote.update({
        where: { id: vote.id },
        data: {
          status: "revealed",
        },
      });

      // Create revealed vote record with Snowflake ID
      await tx.revealedVote.create({
        data: {
          id: generateSnowflakeIdBigInt(), // Snowflake ID as BigInt
          voteId: vote.id,
          pollId: vote.pollId,
          rankings: encryptedRankings,
        },
      });
    });

    res.status(200).json({
      success: true,
      revealed: true,
      message: "Vote successfully revealed and stored encrypted",
    });
  } catch (error) {
    console.error("Error revealing vote:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
