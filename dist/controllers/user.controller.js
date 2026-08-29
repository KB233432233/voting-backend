"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createUser = createUser;
exports.onboardWallet = onboardWallet;
exports.getUsers = getUsers;
exports.getUser = getUser;
exports.updateUser = updateUser;
exports.updateSelf = updateSelf;
exports.deleteUser = deleteUser;
exports.updateUserRole = updateUserRole;
const db_ts_1 = __importDefault(require("../config/db.ts"));
const zod_1 = require("zod");
const snowflake_ts_1 = require("../utils/snowflake.ts");
const auth_ts_1 = require("../types/auth.ts");
const auth_ts_2 = require("../types/auth.ts");
// Validation Schemas
const createUserSchema = zod_1.z.object({
    email: zod_1.z.string().email("Invalid email format"),
    fullName: zod_1.z.string().min(2).max(255).optional(),
    passwordHash: zod_1.z.string().min(8).optional(), // Optional for wallet-first flow
    isEligible: zod_1.z.boolean().default(true),
});
const updateUserSchema = zod_1.z.object({
    email: zod_1.z.string().email().optional(),
    fullName: zod_1.z.string().min(2).max(255).optional(),
    passwordHash: zod_1.z.string().min(8).optional(),
    isEligible: zod_1.z.boolean().optional(),
    photoUrl: zod_1.z.string().max(2000000).optional(),
});
const onboardWalletSchema = zod_1.z.object({
    walletAddress: zod_1.z
        .string()
        .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid wallet address"),
    role: zod_1.z.enum(["user", "organization", "auditor", "admin"]),
    email: zod_1.z.string().email().optional(),
});
const querySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().positive().default(1),
    limit: zod_1.z.coerce.number().int().positive().max(100).default(20),
    isEligible: zod_1.z.coerce.boolean().optional(),
});
/**
 * POST /users
 * Create a new user
 */
async function createUser(req, res) {
    try {
        const parse = createUserSchema.safeParse(req.body);
        if (!parse.success) {
            res
                .status(400)
                .json({ error: "Invalid input", details: parse.error.issues });
            return;
        }
        const { email, fullName, passwordHash, isEligible } = parse.data;
        const existing = await db_ts_1.default.user.findUnique({ where: { email } });
        if (existing) {
            res.status(409).json({ error: "Email already registered" });
            return;
        }
        const user = await db_ts_1.default.user.create({
            data: {
                id: (0, snowflake_ts_1.generateSnowflakeIdBigInt)(),
                email,
                fullName: fullName || null,
                passwordHash: passwordHash || null,
                isEligible,
            },
        });
        res.status(201).json({
            success: true,
            userId: user.id.toString(),
            email: user.email,
            isEligible: user.isEligible,
        });
    }
    catch (error) {
        console.error("Create user error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
/**
 * POST /users/onboard-wallet
 * Provision (or update) a backend User + Wallet for an on-chain role grant
 * (admin added org/auditor/admin on chain — mirror it in the DB so the
 * org/auditor/admin dashboards and whitelist UI have a user to work with).
 */
async function onboardWallet(req, res) {
    try {
        const parse = onboardWalletSchema.safeParse(req.body);
        if (!parse.success) {
            res
                .status(400)
                .json({ error: "Invalid input", details: parse.error.issues });
            return;
        }
        const { walletAddress, role, email } = parse.data;
        const normalizedAddress = walletAddress.toLowerCase();
        const existingWallet = await db_ts_1.default.wallet.findUnique({
            where: { address: normalizedAddress },
            include: { user: { select: { id: true, email: true } } },
        });
        // Wallet already registered → just sync the role
        if (existingWallet) {
            const updated = await db_ts_1.default.user.update({
                where: { id: existingWallet.user.id },
                data: { role },
                select: { id: true, email: true, role: true },
            });
            res.status(200).json({
                success: true,
                created: false,
                user: {
                    id: updated.id.toString(),
                    email: updated.email,
                    role: updated.role,
                    walletAddress: normalizedAddress,
                },
            });
            return;
        }
        const userId = (0, snowflake_ts_1.generateSnowflakeIdBigInt)();
        const [user, wallet] = await db_ts_1.default.$transaction([
            db_ts_1.default.user.create({
                data: {
                    id: userId,
                    email: email || `wallet-${normalizedAddress}@temp.com`,
                    role,
                    isEligible: true,
                },
            }),
            db_ts_1.default.wallet.create({
                data: {
                    id: (0, snowflake_ts_1.generateSnowflakeIdBigInt)(),
                    userId,
                    address: normalizedAddress,
                    chain: "sepolia",
                },
            }),
        ]);
        res.status(201).json({
            success: true,
            created: true,
            user: {
                id: user.id.toString(),
                email: user.email,
                role: user.role,
                walletAddress: wallet.address,
            },
        });
    }
    catch (error) {
        if (error?.code === "P2002") {
            res.status(409).json({ error: "Wallet address already registered" });
            return;
        }
        console.error("Onboard wallet error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
/**
 * GET /users
 * List users with pagination & eligibility filter
 */
async function getUsers(req, res) {
    try {
        const parse = querySchema.safeParse(req.query);
        if (!parse.success) {
            res
                .status(400)
                .json({ error: "Invalid query params", details: parse.error.issues });
            return;
        }
        const { page, limit, isEligible } = parse.data;
        const skip = (page - 1) * limit;
        const where = isEligible !== undefined ? { isEligible } : {};
        const [users, total] = await db_ts_1.default.$transaction([
            db_ts_1.default.user.findMany({
                where,
                select: {
                    id: true,
                    email: true,
                    fullName: true,
                    isEligible: true,
                    role: true,
                    createdAt: true,
                    photoUrl: true,
                    wallet: { select: { address: true } },
                },
                orderBy: { createdAt: "desc" },
                skip,
                take: limit,
            }),
            db_ts_1.default.user.count({ where }),
        ]);
        res.status(200).json({
            success: true,
            users: users.map((u) => ({
                ...u,
                id: u.id.toString(),
                walletAddress: u.wallet?.address ?? null,
                wallet: undefined,
            })),
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (error) {
        console.error("Get users error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
/**
 * GET /users/:id
 * Get single user
 */
async function getUser(req, res) {
    try {
        const idParam = req.params.id;
        if (!idParam) {
            res.status(400).json({ error: "Candidate ID is required" });
            return;
        }
        const id = BigInt(idParam.toString());
        const user = await db_ts_1.default.user.findUnique({
            where: { id },
            select: {
                id: true,
                email: true,
                fullName: true,
                isEligible: true,
                role: true,
                createdAt: true,
                photoUrl: true,
                wallet: { select: { address: true } },
            },
        });
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }
        res
            .status(200)
            .json({
            success: true,
            user: {
                ...user,
                id: user.id.toString(),
                walletAddress: user.wallet?.address ?? null,
                wallet: undefined,
            },
        });
    }
    catch (error) {
        console.error("Get user error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
/**
 * PATCH /users/:id
 * Update user fields
 */
async function updateUser(req, res) {
    try {
        const idParam = req.params.id;
        if (!idParam) {
            res.status(400).json({ error: "Candidate ID is required" });
            return;
        }
        const id = BigInt(idParam.toString());
        const parse = updateUserSchema.safeParse(req.body);
        if (!parse.success) {
            res
                .status(400)
                .json({ error: "Invalid input", details: parse.error.issues });
            return;
        }
        const user = await db_ts_1.default.user.findUnique({ where: { id } });
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }
        // Prevent duplicate email on update
        if (parse.data.email && parse.data.email !== user.email) {
            const existing = await db_ts_1.default.user.findUnique({
                where: { email: parse.data.email },
            });
            if (existing) {
                res.status(409).json({ error: "Email already registered" });
                return;
            }
        }
        const updateData = {};
        if (parse.data.email !== undefined)
            updateData.email = parse.data.email;
        if (parse.data.fullName !== undefined)
            updateData.fullName = parse.data.fullName;
        if (parse.data.passwordHash !== undefined)
            updateData.passwordHash = parse.data.passwordHash;
        if (parse.data.isEligible !== undefined)
            updateData.isEligible = parse.data.isEligible;
        if (parse.data.photoUrl !== undefined)
            updateData.photoUrl = parse.data.photoUrl;
        const updated = await db_ts_1.default.user.update({
            where: { id },
            data: updateData,
        });
        res.status(200).json({
            success: true,
            user: { ...updated, id: updated.id.toString() },
        });
    }
    catch (error) {
        console.error("Update user error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
/**
 * PATCH /users/me
 * Update own profile (no special permission needed, just auth)
 */
async function updateSelf(req, res) {
    const userId = req.user?.userId;
    if (!userId) {
        res.status(401).json({ error: "Not authenticated" });
        return;
    }
    req.params.id = userId;
    return updateUser(req, res);
}
/**
 * DELETE /users/:id
 * Delete user (blocked if user has cast votes)
 */
/**
 * DELETE /users/:id
 * Delete user (blocked if user has already voted)
 * Note: votes table has NO userId for anonymity. We check votingTokens instead.
 */
async function deleteUser(req, res) {
    try {
        const idParam = req.params.id;
        if (!idParam) {
            res.status(400).json({ error: "User ID is required" });
            return;
        }
        const id = BigInt(idParam.toString());
        const user = await db_ts_1.default.user.findUnique({ where: { id } });
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }
        // Check if user has consumed voting tokens (indicates they participated)
        const usedTokens = await db_ts_1.default.votingToken.count({
            where: { userId: id, status: 'used' }
        });
        if (usedTokens > 0) {
            res.status(400).json({
                error: "Cannot delete user who has already voted. Consider deactivating (isEligible=false) instead."
            });
            return;
        }
        await db_ts_1.default.user.delete({ where: { id } });
        res.status(200).json({ success: true, message: "User deleted successfully" });
    }
    catch (error) {
        console.error("Delete user error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
async function updateUserRole(req, res) {
    try {
        const idParam = req.params.id;
        if (!idParam) {
            res.status(400).json({ error: "User ID is required" });
            return;
        }
        const userId = BigInt(idParam.toString());
        const parse = zod_1.z.object({
            role: zod_1.z.enum(["user", "admin", "organization", "auditor", "owner"]),
            permission: zod_1.z.enum(auth_ts_2.PERMISSIONS),
        }).safeParse(req.body);
        if (!parse.success) {
            res.status(400).json({ error: "Invalid role", details: parse.error.issues });
            return;
        }
        const targetRole = parse.data.role;
        const targetPermission = parse.data.permission;
        if (!targetPermission) {
            res.status(404).json({ error: "Permission required unsend" });
            return;
        }
        const targetUser = await db_ts_1.default.user.findUnique({ where: { id: userId } });
        if (!targetUser) {
            res.status(404).json({ error: "User not found" });
            return;
        }
        if (targetUser.id.toString() === req.user.userId) {
            res.status(403).json({ error: "Cannot modify your own role" });
            return;
        }
        //Permission mapping based on your exact matrix
        // const roleToPermission: Record<string, Permission | null> = {
        //   admin: "manage_admins",
        //   owner: "manage_admins",
        //   auditor: "manage_auditors",
        //   organization: "manage_organizations",
        //   user: null, // Downgrading to 'user' requires any management permission
        // };
        const requiredPermission = auth_ts_2.ROLE_PERMISSIONS[targetRole];
        if (requiredPermission && !(0, auth_ts_1.hasPermission)(req.user.role, targetPermission)) {
            res.status(403).json({
                error: `Insufficient permissions to assign '${targetRole}' role. Requires: ${requiredPermission}`
            });
            return;
        }
        // If downgrading to 'user', ensure caller has at least one management permission
        if (targetRole === "user" && req.user.role === "user") {
            res.status(403).json({ error: "Regular users cannot modify roles" });
            return;
        }
        const updated = await db_ts_1.default.user.update({
            where: { id: userId },
            data: { role: targetRole },
        });
        res.status(200).json({
            success: true,
            user: {
                id: updated.id.toString(),
                email: updated.email,
                role: updated.role,
            },
        });
    }
    catch (error) {
        console.error("Update user role error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
//# sourceMappingURL=user.controller.js.map