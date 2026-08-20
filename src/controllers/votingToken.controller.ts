import type { Response } from "express";
import type { AuthenticatedRequest } from "../types/auth.ts";
import prisma from "../config/db.ts";
import { z } from "zod";
import { generateSnowflakeIdBigInt } from "../utils/snowflake.ts";
import crypto from "crypto";

// Validation Schemas
const createTokenSchema = z.object({
  userId: z.string().regex(/^\d+$/, "User ID must be numeric"),
  pollId: z.string().regex(/^\d+$/, "Poll ID must be numeric"),
});

const updateTokenSchema = z.object({
  status: z.enum(["active", "used", "expired"]),
});

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(["active", "used", "expired"]).optional(),
  userId: z.string().regex(/^\d+$/).optional(),
  pollId: z.string().regex(/^\d+$/).optional(),
});

// Helper: Mask token hash for secure logging/display
const maskHash = (hash: string) => `${hash.slice(0, 8)}...${hash.slice(-4)}`;

/**
 * POST /voting-tokens
 * Issue a new voting token (admin/issuance endpoint)
 */
export async function createVotingToken(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const parse = createTokenSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "Invalid input", details: parse.error.issues });
      return;
    }

    const userId = BigInt(parse.data.userId);
    const pollId = BigInt(parse.data.pollId);

    const [user, poll] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.poll.findUnique({ where: { id: pollId } }),
    ]);

    if (!user || !poll) {
      res.status(404).json({ error: "User or Poll not found" });
      return;
    }
    if (!user.isEligible) {
      res.status(403).json({ error: "User is not eligible to vote" });
      return;
    }
    if (poll.status !== "draft" && poll.status !== "active") {
      res.status(403).json({ error: "Can only issue tokens for draft or active polls" });
      return;
    }

    // Prevent duplicate active tokens
    const existing = await prisma.votingToken.findFirst({
      where: { userId, pollId, status: "active", usedAt: null },
    });
    if (existing) {
      res.status(409).json({ error: "Active token already exists for this user/poll" });
      return;
    }

    // Generate & hash token
    const tokenBuffer = crypto.randomBytes(32);
    const plaintext = tokenBuffer.toString("hex");
    const tokenHash = crypto.createHash("sha256").update(tokenBuffer).digest("hex");

    const token = await prisma.votingToken.create({
       data: {
        id: generateSnowflakeIdBigInt(),
        userId,
        pollId,
        tokenHash,
        status: "active",
      },
    });

    res.status(201).json({
      success: true,
      token: plaintext, // 🔴 ONLY returned here
      tokenId: token.id.toString(),
      userId: token.userId.toString(),
      pollId: token.pollId.toString(),
      status: token.status,
      issuedAt: token.issuedAt,
    });
  } catch (error) {
    console.error("Create voting token error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /voting-tokens
 * List tokens with pagination & filters
 */
export async function getVotingTokens(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const parse = querySchema.safeParse(req.query);
    if (!parse.success) {
      res.status(400).json({ error: "Invalid query params", details: parse.error.issues });
      return;
    }

    const { page, limit, status, userId, pollId } = parse.data;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (status) where.status = status;
    if (userId) where.userId = BigInt(userId);
    if (pollId) where.pollId = BigInt(pollId);

    const [tokens, total] = await prisma.$transaction([
      prisma.votingToken.findMany({ where, orderBy: { issuedAt: "desc" }, skip, take: limit }),
      prisma.votingToken.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      tokens: tokens.map((t:any) => ({
        ...t,
        id: t.id.toString(),
        userId: t.userId.toString(),
        pollId: t.pollId.toString(),
        tokenHash: maskHash(t.tokenHash), // 🔒 Masked
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Get voting tokens error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /voting-tokens/:id
 * Get single token
 */
export async function getVotingToken(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const idParam = req.params.id;
    if (!idParam) {
      res.status(400).json({ error: "Invalid token ID" });
      return;
    }
    const id = BigInt(idParam.toString());
    const token = await prisma.votingToken.findUnique({ where: { id } });
    if (!token) {
      res.status(404).json({ error: "Voting token not found" });
      return;
    }

    res.status(200).json({
      success: true,
      token: { ...token, id: token.id.toString(), userId: token.userId.toString(), pollId: token.pollId.toString(), tokenHash: maskHash(token.tokenHash) },
    });
  } catch (error) {
    console.error("Get voting token error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * PATCH /voting-tokens/:id
 * Update token status (admin override/revocation)
 */
export async function updateVotingToken(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const idParam = req.params.id;
    if (!idParam) {
      res.status(400).json({ error: "Invalid token ID" });
      return;
    }
    const id = BigInt(idParam.toString());
    const parse = updateTokenSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "Invalid input", details: parse.error.issues });
      return;
    }

    const { status } = parse.data;
    const token = await prisma.votingToken.findUnique({ where: { id } });
    if (!token) {
      res.status(404).json({ error: "Voting token not found" });
      return;
    }

    // 🔒 Audit protection: Never allow modification of consumed tokens
    if (token.status === "used") {
      res.status(400).json({ error: "Cannot modify a consumed/used token" });
      return;
    }

    const updated = await prisma.votingToken.update({
      where: { id },
       data:{
        status,
        usedAt: status === "used" ? new Date() : token.usedAt,
      },
    });

    res.status(200).json({
      success: true,
      token: { ...updated, id: updated.id.toString(), userId: updated.userId.toString(), pollId: updated.pollId.toString() },
    });
  } catch (error) {
    console.error("Update voting token error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * DELETE /voting-tokens/:id
 * Revoke/delete token
 */
export async function deleteVotingToken(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const idParam = req.params.id;
    if (!idParam) {
      res.status(400).json({ error: "Invalid token ID" });
      return;
    }
    const id = BigInt(idParam.toString());
    const token = await prisma.votingToken.findUnique({ where: { id } });
    if (!token) {
      res.status(404).json({ error: "Voting token not found" });
      return;
    }
    if (token.status === "used") {
      res.status(403).json({ error: "Cannot delete a used token. Audit trail must be preserved." });
      return;
    }

    await prisma.votingToken.delete({ where: { id } });
    res.status(200).json({ success: true, message: "Voting token revoked successfully" });
  } catch (error) {
    console.error("Delete voting token error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}