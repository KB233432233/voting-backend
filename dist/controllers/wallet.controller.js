"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWallet = createWallet;
exports.getWallets = getWallets;
exports.getWallet = getWallet;
exports.getWalletByUser = getWalletByUser;
exports.updateWallet = updateWallet;
exports.deleteWallet = deleteWallet;
const db_ts_1 = __importDefault(require("../config/db.ts"));
const zod_1 = require("zod");
const snowflake_ts_1 = require("../utils/snowflake.ts");
const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
// Validation Schemas
const createWalletSchema = zod_1.z.object({
    userId: zod_1.z.string().regex(/^\d+$/, "User ID must be a numeric string"),
    address: zod_1.z.string().regex(ethAddressRegex, "Invalid Ethereum address format"),
    chain: zod_1.z.string().default("polygon"),
});
const updateWalletSchema = zod_1.z.object({
    chain: zod_1.z.string().optional(),
    // Note: address & userId are immutable to preserve auth session integrity
});
const querySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().positive().default(1),
    limit: zod_1.z.coerce.number().int().positive().max(100).default(20),
    chain: zod_1.z.string().optional(),
});
/**
 * POST /wallets
 * Link a wallet to a user (1:1 relationship)
 */
async function createWallet(req, res) {
    try {
        const parse = createWalletSchema.safeParse(req.body);
        if (!parse.success) {
            res.status(400).json({ error: "Invalid input", details: parse.error.issues });
            return;
        }
        const { userId, address, chain } = parse.data;
        const userIdBigInt = BigInt(userId);
        const normalizedAddress = address.toLowerCase();
        // Verify user exists
        const user = await db_ts_1.default.user.findUnique({ where: { id: userIdBigInt } });
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }
        // Check if user already has a wallet
        const existingUserWallet = await db_ts_1.default.wallet.findUnique({ where: { userId: userIdBigInt } });
        if (existingUserWallet) {
            res.status(409).json({ error: "User already has a registered wallet" });
            return;
        }
        // Check if address is already registered to another user
        const existingAddressWallet = await db_ts_1.default.wallet.findUnique({ where: { address: normalizedAddress } });
        if (existingAddressWallet) {
            res.status(409).json({ error: "Wallet address already registered" });
            return;
        }
        const wallet = await db_ts_1.default.wallet.create({
            data: {
                id: (0, snowflake_ts_1.generateSnowflakeIdBigInt)(),
                userId: userIdBigInt,
                address: normalizedAddress,
                chain,
            },
        });
        res.status(201).json({
            success: true,
            walletId: wallet.id.toString(),
            userId: wallet.userId.toString(),
            address: wallet.address,
            chain: wallet.chain,
        });
    }
    catch (error) {
        console.error("Create wallet error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
/**
 * GET /wallets
 * List wallets with pagination & chain filter
 */
async function getWallets(req, res) {
    try {
        const parse = querySchema.safeParse(req.query);
        if (!parse.success) {
            res.status(400).json({ error: "Invalid query params", details: parse.error.issues });
            return;
        }
        const { page, limit, chain } = parse.data;
        const skip = (page - 1) * limit;
        const where = chain ? { chain } : {};
        const [wallets, total] = await db_ts_1.default.$transaction([
            db_ts_1.default.wallet.findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip,
                take: limit,
            }),
            db_ts_1.default.wallet.count({ where }),
        ]);
        res.status(200).json({
            success: true,
            wallets: wallets.map((w) => ({ ...w, id: w.id.toString(), userId: w.userId.toString() })),
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (error) {
        console.error("Get wallets error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
/**
 * GET /wallets/:id
 * Get wallet by ID
 */
async function getWallet(req, res) {
    try {
        const idParam = req.params.id;
        if (!idParam) {
            res.status(400).json({ error: "Invalid wallet ID" });
            return;
        }
        const id = BigInt(idParam.toString());
        const wallet = await db_ts_1.default.wallet.findUnique({ where: { id } });
        if (!wallet) {
            res.status(404).json({ error: "Wallet not found" });
            return;
        }
        res.status(200).json({
            success: true,
            wallet: { ...wallet, id: wallet.id.toString(), userId: wallet.userId.toString() },
        });
    }
    catch (error) {
        console.error("Get wallet error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
/**
 * GET /wallets/user/:userId
 * Get wallet linked to a specific user
 */
async function getWalletByUser(req, res) {
    try {
        const idParam = req.params.id;
        if (!idParam) {
            res.status(400).json({ error: "Invalid user ID" });
            return;
        }
        const userId = BigInt(idParam.toString());
        const wallet = await db_ts_1.default.wallet.findUnique({ where: { userId } });
        if (!wallet) {
            res.status(404).json({ error: "No wallet found for this user" });
            return;
        }
        res.status(200).json({
            success: true,
            wallet: { ...wallet, id: wallet.id.toString(), userId: wallet.userId.toString() },
        });
    }
    catch (error) {
        console.error("Get wallet by user error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
/**
 * PATCH /wallets/:id
 * Update wallet (only 'chain' field is mutable)
 */
async function updateWallet(req, res) {
    try {
        const idParam = req.params.id;
        if (!idParam) {
            res.status(400).json({ error: "Invalid wallet ID" });
            return;
        }
        const id = BigInt(idParam.toString());
        const parse = updateWalletSchema.safeParse(req.body);
        if (!parse.success) {
            res.status(400).json({ error: "Invalid input", details: parse.error.issues });
            return;
        }
        const wallet = await db_ts_1.default.wallet.findUnique({ where: { id } });
        if (!wallet) {
            res.status(404).json({ error: "Wallet not found" });
            return;
        }
        const updated = await db_ts_1.default.wallet.update({
            where: { id },
            data: { chain: parse.data.chain ?? wallet.chain },
        });
        res.status(200).json({
            success: true,
            wallet: { ...updated, id: updated.id.toString(), userId: updated.userId.toString() },
        });
    }
    catch (error) {
        console.error("Update wallet error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
/**
 * DELETE /wallets/:id
 * Delete wallet (WARNING: breaks authentication for this user until re-registered)
 */
async function deleteWallet(req, res) {
    try {
        const idParam = req.params.id;
        if (!idParam) {
            res.status(400).json({ error: "Invalid wallet ID" });
            return;
        }
        const id = BigInt(idParam.toString());
        const wallet = await db_ts_1.default.wallet.findUnique({ where: { id } });
        if (!wallet) {
            res.status(404).json({ error: "Wallet not found" });
            return;
        }
        await db_ts_1.default.wallet.delete({ where: { id } });
        res.status(200).json({ success: true, message: "Wallet deleted successfully. User must re-authenticate." });
    }
    catch (error) {
        console.error("Delete wallet error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
//# sourceMappingURL=wallet.controller.js.map