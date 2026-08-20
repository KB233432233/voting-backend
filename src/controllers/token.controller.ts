import type { Response } from "express";
import type { AuthenticatedRequest } from "../types/auth.ts";
import prisma from "../config/db.ts";
import crypto from "crypto";
import { z } from "zod";
import { generateSnowflakeIdBigInt } from "../utils/snowflake.ts";
import {
  getPollChainState,
  chainStateToStatus,
} from "../utils/chainVoting.ts";

const requestTokenSchema = z.object({
  pollId: z.string().transform((val) => BigInt(val)),
});

/**
 * POST /voting/tokens/request
 * Request a new voting token for an active poll
 */
export async function requestToken(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const parseResult = requestTokenSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: "Invalid request body",
        details: parseResult.error.issues,
      });
      return;
    }

    const { pollId } = parseResult.data;
    const userId = BigInt(req.user!.userId);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isEligible: true },
    });

    if (!user || !user.isEligible) {
      res.status(403).json({ error: "User is not eligible to vote" });
      return;
    }

    const poll = await prisma.poll.findUnique({
      where: { id: pollId },
      select: { status: true, chainPollId: true },
    });

    if (!poll) {
      res.status(400).json({ error: "Poll not found" });
      return;
    }

    let status: string = poll.status;
    if (poll.chainPollId != null) {
      const chainState = await getPollChainState(poll.chainPollId);
      if (chainState !== null) {
        status = chainStateToStatus(chainState);
      } else {
        console.warn(
          `[token] Chain state unavailable for poll ${pollId}, falling back to DB status '${poll.status}'`,
        );
      }
    }

    if (status !== "active") {
      res.status(403).json({ error: "Poll is not active", status });
      return;
    }

    const existingToken = await prisma.votingToken.findFirst({
      where: {
        userId,
        pollId,
        status: "active",
        usedAt: null,
      },
    });

if (existingToken) {
    // A token was already issued for this poll (e.g. pre-issued by the org
    // dashboard whitelist flow, or a previous request that never completed).
    // The plaintext is only ever shown once at issuance, so the voter cannot
    // use the old token — expire it and hand out a fresh one.
    await prisma.votingToken.update({
      where: { id: existingToken.id },
      data: { status: "expired", usedAt: new Date() },
    });
  }

    const tokenBuffer = crypto.randomBytes(32);
    const plaintextToken = tokenBuffer.toString("hex");

    const tokenHash = crypto
      .createHash("sha256")
      .update(tokenBuffer)
      .digest("hex");

    const pollIdBigInt = BigInt(pollId);
    const userIdBigInt = BigInt(req.user!.userId);

    const isWhitelisted = await prisma.pollWhitelist.findUnique({
      where: { pollId_userId: { pollId: pollIdBigInt, userId: userIdBigInt } },
    });

    if (!isWhitelisted) {
      // Open voting: a poll with no whitelist entries at all lets any
      // eligible user vote. Once even one voter is whitelisted, the
      // whitelist is enforced strictly.
      const whitelistCount = await prisma.pollWhitelist.count({
        where: { pollId: pollIdBigInt },
      });

      if (whitelistCount > 0) {
        res.status(403).json({
          error:
            "You are not whitelisted to vote in this poll. Contact the poll organizer.",
        });
        return;
      }
    }
    const votingToken = await prisma.votingToken.create({
      data: {
        id: generateSnowflakeIdBigInt(),
        userId,
        pollId,
        tokenHash,
        status: "active",
      },
    });

    res.status(201).json({
      token: plaintextToken,
      tokenId: votingToken.id.toString(),
      pollId: pollId.toString(),
    });
  } catch (error) {
    console.error("Error in requestToken:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
