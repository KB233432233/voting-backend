"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTransaction = createTransaction;
exports.getTransactions = getTransactions;
exports.getTransaction = getTransaction;
exports.updateTransaction = updateTransaction;
exports.deleteTransaction = deleteTransaction;
const db_ts_1 = __importDefault(require("../config/db.ts"));
const zod_1 = require("zod");
const snowflake_ts_1 = require("../utils/snowflake.ts");
const client_1 = require("@prisma/client");
const txStatusEnum = zod_1.z.enum([
    "pending",
    "broadcast",
    "confirmed",
    "failed",
    "dropped",
]);
// Validation Schemas
const createTxSchema = zod_1.z.object({
    pollId: zod_1.z.string().regex(/^\d+$/, "Poll ID must be numeric"),
    voteId: zod_1.z.string().regex(/^\d+$/, "Vote ID must be numeric").optional(),
    txHash: zod_1.z
        .string()
        .regex(/^0x[a-fA-F0-9]{64}$/, "Invalid txHash (0x + 64 hex)"),
    chain: zod_1.z.string().default("polygon"),
    status: txStatusEnum.default("pending"),
    payload: zod_1.z.record(zod_1.z.string(), zod_1.z.any()).optional(),
});
const updateTxSchema = zod_1.z.object({
    status: txStatusEnum.optional(),
    blockNumber: zod_1.z.string().regex(/^\d+$/).optional(),
    confirmations: zod_1.z.coerce.number().int().nonnegative().optional(),
    nonce: zod_1.z.coerce.number().int().optional(),
    retries: zod_1.z.coerce.number().int().nonnegative().optional(),
    gasUsed: zod_1.z.string().regex(/^\d+$/).optional(),
    gasPrice: zod_1.z.string().regex(/^\d+$/).optional(),
    errorMessage: zod_1.z.string().max(500).optional(),
    confirmedAt: zod_1.z.coerce.date().optional(),
});
const querySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().positive().default(1),
    limit: zod_1.z.coerce.number().int().positive().max(100).default(50),
    status: txStatusEnum.optional(),
    pollId: zod_1.z.string().regex(/^\d+$/).optional(),
    chain: zod_1.z.string().optional(),
});
/**
 * POST /transactions
 * Record a new blockchain transaction (usually created alongside vote submission)
 */
async function createTransaction(req, res) {
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
        const poll = await db_ts_1.default.poll.findUnique({ where: { id: pollIdBigInt } });
        if (!poll) {
            res.status(404).json({ error: "Poll not found" });
            return;
        }
        // Verify vote exists if provided
        if (voteIdBigInt) {
            const voteExists = await db_ts_1.default.vote.findUnique({
                where: { id: voteIdBigInt },
            });
            if (!voteExists) {
                res.status(404).json({ error: "Vote not found" });
                return;
            }
        }
        const tx = await db_ts_1.default.transaction.create({
            data: {
                id: (0, snowflake_ts_1.generateSnowflakeIdBigInt)(),
                pollId: pollIdBigInt,
                voteId: voteIdBigInt || null,
                txHash: txHash.toLowerCase(),
                chain,
                status,
                payload: payload ? payload : client_1.Prisma.JsonNull,
            },
        });
        res.status(201).json({
            success: true,
            transactionId: tx.id.toString(),
            txHash: tx.txHash,
            status: tx.status,
        });
    }
    catch (error) {
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
async function getTransactions(req, res) {
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
        const where = {};
        if (status)
            where.status = status;
        if (pollId)
            where.pollId = BigInt(pollId);
        if (chain)
            where.chain = chain;
        const [txs, total] = await db_ts_1.default.$transaction([
            db_ts_1.default.transaction.findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip,
                take: limit,
            }),
            db_ts_1.default.transaction.count({ where }),
        ]);
        res.status(200).json({
            success: true,
            transactions: txs.map((t) => ({
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
    }
    catch (error) {
        console.error("Get transactions error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
/**
 * GET /transactions/:id
 * Get single transaction by ID
 */
async function getTransaction(req, res) {
    try {
        const idParam = req.params.id;
        if (!idParam) {
            res.status(400).json({ error: "Transaction ID is required" });
            return;
        }
        const id = BigInt(idParam.toString());
        const tx = await db_ts_1.default.transaction.findUnique({ where: { id } });
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
    }
    catch (error) {
        console.error("Get transaction error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
/**
 * PATCH /transactions/:id
 * Update transaction lifecycle (used by chain polling worker or admin)
 */
async function updateTransaction(req, res) {
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
        const tx = await db_ts_1.default.transaction.findUnique({ where: { id } });
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
        const updateData = { updatedAt: new Date() };
        if (rest.status !== undefined)
            updateData.status = rest.status;
        if (rest.confirmations !== undefined)
            updateData.confirmations = rest.confirmations;
        if (rest.nonce !== undefined)
            updateData.nonce = rest.nonce;
        if (rest.retries !== undefined)
            updateData.retries = rest.retries;
        if (rest.errorMessage !== undefined)
            updateData.errorMessage = rest.errorMessage;
        if (rest.confirmedAt !== undefined)
            updateData.confirmedAt = rest.confirmedAt;
        if (blockNumber)
            updateData.blockNumber = BigInt(blockNumber);
        if (gasUsed)
            updateData.gasUsed = BigInt(gasUsed);
        if (gasPrice)
            updateData.gasPrice = BigInt(gasPrice);
        const updated = await db_ts_1.default.transaction.update({
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
    }
    catch (error) {
        console.error("Update transaction error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
/**
 * DELETE /transactions/:id
 * Remove stuck/failed transaction records (audit-safe)
 */
async function deleteTransaction(req, res) {
    try {
        const idParam = req.params.id;
        if (!idParam) {
            res.status(400).json({ error: "Transaction ID is required" });
            return;
        }
        const id = BigInt(idParam.toString());
        const tx = await db_ts_1.default.transaction.findUnique({ where: { id } });
        if (!tx) {
            res.status(404).json({ error: "Transaction not found" });
            return;
        }
        if (tx.status === "confirmed") {
            res.status(403).json({
                error: "Cannot delete confirmed transactions. Audit trail must be preserved.",
            });
            return;
        }
        await db_ts_1.default.transaction.delete({ where: { id } });
        res
            .status(200)
            .json({ success: true, message: "Transaction record removed" });
    }
    catch (error) {
        console.error("Delete transaction error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
//# sourceMappingURL=transaction.controller.js.map