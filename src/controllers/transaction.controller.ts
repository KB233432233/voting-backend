import type { Response } from "express";
import type { AuthenticatedRequest } from "../types/auth.ts";
import prisma from "../config/db.ts";
import { z } from "zod";
import { generateSnowflakeIdBigInt } from "../utils/snowflake.ts";
import { Prisma } from "@prisma/client";

const txStatusEnum = z.enum([
  "pending",
  "broadcast",
  "confirmed",
  "failed",
  "dropped",
]);

// Validation Schemas
const createTxSchema = z.object({
  pollId: z.string().regex(/^\d+$/, "Poll ID must be numeric"),
  voteId: z.string().regex(/^\d+$/, "Vote ID must be numeric").optional(),
  txHash: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/, "Invalid txHash (0x + 64 hex)"),
  chain: z.string().default("polygon"),
  status: txStatusEnum.default("pending"),
  payload: z.record(z.string(), z.any()).optional(),
});

const updateTxSchema = z.object({
  status: txStatusEnum.optional(),
  blockNumber: z.string().regex(/^\d+$/).optional(),
  confirmations: z.coerce.number().int().nonnegative().optional(),
  nonce: z.coerce.number().int().optional(),
  retries: z.coerce.number().int().nonnegative().optional(),
  gasUsed: z.string().regex(/^\d+$/).optional(),
  gasPrice: z.string().regex(/^\d+$/).optional(),
  errorMessage: z.string().max(500).optional(),
  confirmedAt: z.coerce.date().optional(),
});

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  status: txStatusEnum.optional(),
  pollId: z.string().regex(/^\d+$/).optional(),
  chain: z.string().optional(),
});

/**
 * POST /transactions
 * Record a new blockchain transaction (usually created alongside vote submission)
 */
export async function createTransaction(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const parse = createTxSchema.safeParse(req.body);
    if (!parse.success) {
      res
        .status(400)
        .json({ error: "Invalid input", details: parse.error.issues });
      return;
    }

    const { pollId, voteId, txHash, chain, status, payload } = parse.data;
    const pollIdBigInt = BigInt(pollId);
    const voteIdBigInt = voteId ? BigInt(voteId) : undefined;

    // Verify poll exists
    const poll = await prisma.poll.findUnique({ where: { id: pollIdBigInt } });
    if (!poll) {
      res.status(404).json({ error: "Poll not found" });
      return;
    }

    // Verify vote exists if provided
    if (voteIdBigInt) {
      const voteExists = await prisma.vote.findUnique({
        where: { id: voteIdBigInt },
      });
      if (!voteExists) {
        res.status(404).json({ error: "Vote not found" });
        return;
      }
    }

    const tx = await prisma.transaction.create({
      data: {
        id: generateSnowflakeIdBigInt(),
        pollId: pollIdBigInt,
        voteId: voteIdBigInt || null,
        txHash: txHash.toLowerCase(),
        chain,
        status,
        payload: payload ? (payload as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });

    res.status(201).json({
      success: true,
      transactionId: tx.id.toString(),
      txHash: tx.txHash,
      status: tx.status,
    });
  } catch (error: any) {
    if (error.code === "P2002" && error.meta?.target?.includes("txHash")) {
      res.status(409).json({ error: "Transaction hash already exists" });
      return;
    }
    console.error("Create transaction error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /transactions
 * List transactions with pagination & filters
 */
export async function getTransactions(
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

    const { page, limit, status, pollId, chain } = parse.data;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (status) where.status = status;
    if (pollId) where.pollId = BigInt(pollId);
    if (chain) where.chain = chain;

    const [txs, total] = await prisma.$transaction([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.transaction.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      transactions: txs.map((t:any) => ({
        ...t,
        id: t.id.toString(),
        pollId: t.pollId.toString(),
        voteId: t.voteId?.toString() || null,
        blockNumber: t.blockNumber?.toString() || null,
        gasUsed: t.gasUsed?.toString() || null,
        gasPrice: t.gasPrice?.toString() || null,
        payload: t.payload,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        confirmedAt: t.confirmedAt,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Get transactions error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /transactions/:id
 * Get single transaction by ID
 */
export async function getTransaction(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const idParam = req.params.id;
    if (!idParam) {
      res.status(400).json({ error: "Transaction ID is required" });
      return;
    }
    const id = BigInt(idParam.toString());
    const tx = await prisma.transaction.findUnique({ where: { id } });
    if (!tx) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }

    res.status(200).json({
      success: true,
      transaction: {
        ...tx,
        id: tx.id.toString(),
        pollId: tx.pollId.toString(),
        voteId: tx.voteId?.toString() || null,
        blockNumber: tx.blockNumber?.toString() || null,
        gasUsed: tx.gasUsed?.toString() || null,
        gasPrice: tx.gasPrice?.toString() || null,
      },
    });
  } catch (error) {
    console.error("Get transaction error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * PATCH /transactions/:id
 * Update transaction lifecycle (used by chain polling worker or admin)
 */
export async function updateTransaction(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const idParam = req.params.id;
    if (!idParam) {
      res.status(400).json({ error: "Transaction ID is required" });
      return;
    }
    const id = BigInt(idParam.toString());
    const parse = updateTxSchema.safeParse(req.body);
    if (!parse.success) {
      res
        .status(400)
        .json({ error: "Invalid input", details: parse.error.issues });
      return;
    }

    const tx = await prisma.transaction.findUnique({ where: { id } });
    if (!tx) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }

    // Prevent updating already finalized transactions
    if (tx.status === "confirmed" || tx.status === "dropped") {
      res.status(403).json({
        error: `Cannot update finalized transaction (status: ${tx.status})`,
      });
      return;
    }

    const { blockNumber, gasUsed, gasPrice, ...rest } = parse.data;

    const updateData: any = { updatedAt: new Date() };

    if (rest.status !== undefined) updateData.status = rest.status;
    if (rest.confirmations !== undefined)
      updateData.confirmations = rest.confirmations;
    if (rest.nonce !== undefined) updateData.nonce = rest.nonce;
    if (rest.retries !== undefined) updateData.retries = rest.retries;
    if (rest.errorMessage !== undefined)
      updateData.errorMessage = rest.errorMessage;
    if (rest.confirmedAt !== undefined)
      updateData.confirmedAt = rest.confirmedAt;
    if (blockNumber) updateData.blockNumber = BigInt(blockNumber);
    if (gasUsed) updateData.gasUsed = BigInt(gasUsed);
    if (gasPrice) updateData.gasPrice = BigInt(gasPrice);

    const updated = await prisma.transaction.update({
      where: { id },
      data: updateData,
    });

    res.status(200).json({
      success: true,
      transaction: {
        ...updated,
        id: updated.id.toString(),
        pollId: updated.pollId.toString(),
      },
    });
  } catch (error) {
    console.error("Update transaction error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * DELETE /transactions/:id
 * Remove stuck/failed transaction records (audit-safe)
 */
export async function deleteTransaction(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const idParam = req.params.id;
    if (!idParam) {
      res.status(400).json({ error: "Transaction ID is required" });
      return;
    }
    const id = BigInt(idParam.toString());
    const tx = await prisma.transaction.findUnique({ where: { id } });
    if (!tx) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }
    if (tx.status === "confirmed") {
      res.status(403).json({
        error:
          "Cannot delete confirmed transactions. Audit trail must be preserved.",
      });
      return;
    }

    await prisma.transaction.delete({ where: { id } });
    res
      .status(200)
      .json({ success: true, message: "Transaction record removed" });
  } catch (error) {
    console.error("Delete transaction error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
