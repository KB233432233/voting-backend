"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.challenge = challenge;
exports.verify = verify;
exports.refresh = refresh;
exports.syncRole = syncRole;
exports.getMe = getMe;
exports.logout = logout;
const ethers_1 = require("ethers");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const zod_1 = require("zod");
const db_ts_1 = __importDefault(require("../config/db.ts"));
const auth_ts_1 = require("../middleware/auth.ts");
const ioredis_1 = __importDefault(require("ioredis"));
const crypto_1 = __importDefault(require("crypto"));
const redis = new ioredis_1.default(process.env.REDIS_URL || "redis://localhost:6379");
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "15m";
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;
if (!JWT_SECRET) {
    throw new Error("JWT_SECRET environment variable is required");
}
if (!REFRESH_TOKEN_SECRET) {
    throw new Error("REFRESH_TOKEN_SECRET environment variable is required");
}
const ethAddressSchema = zod_1.z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address");
const challengeSchema = zod_1.z.object({
    address: ethAddressSchema,
});
const verifySchema = zod_1.z.object({
    address: ethAddressSchema,
    signature: zod_1.z.string().min(1, "Signature is required"),
    nonce: zod_1.z.string().min(1, "Nonce is required"),
});
/**
 * POST /challenge
 * Returns a nonce for the client to sign
 */
async function challenge(req, res) {
    try {
        const result = challengeSchema.safeParse(req.body);
        if (!result.success) {
            res
                .status(400)
                .json({ error: "Invalid input", details: result.error.issues });
            return;
        }
        const { address } = result.data;
        const { nonce, expiresAt } = await (0, auth_ts_1.createNonce)(address);
        res.status(200).json({
            nonce,
            domain: process.env.APP_DOMAIN || "localhost",
            expiresAt: new Date(expiresAt).toISOString(),
        });
    }
    catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
}
/**
 * POST /auth/verify
 * Validates ECDSA signature and returns session token
 */
/**
 * POST /auth/verify
 * Validates ECDSA signature and returns session token
 */
async function verify(req, res) {
    try {
        // 1. Validate request body
        const result = verifySchema.safeParse(req.body);
        if (!result.success) {
            res
                .status(400)
                .json({ error: "Invalid input", details: result.error.issues });
            return;
        }
        const { address, signature, nonce } = result.data;
        const normalizedAddress = address.toLowerCase();
        // 2. Recover signer from signature
        const message = `Sign this message to authenticate with ${process.env.APP_DOMAIN || "localhost"}\n\nNonce: ${nonce}`;
        let recoveredAddress;
        try {
            recoveredAddress = (0, ethers_1.verifyMessage)(message, signature);
        }
        catch {
            res.status(401).json({ error: "Invalid signature" });
            return;
        }
        const normalizedRecovered = recoveredAddress.toLowerCase();
        if (normalizedRecovered !== normalizedAddress) {
            res
                .status(401)
                .json({ error: "Signature does not match provided address" });
            return;
        }
        // 3. Validate nonce
        const nonceValid = await (0, auth_ts_1.validateNonce)(nonce, normalizedAddress);
        if (!nonceValid) {
            res.status(401).json({ error: "Invalid or expired nonce" });
            return;
        }
        // 4. Find or create wallet
        let wallet = await db_ts_1.default.wallet.findUnique({
            where: { address: normalizedAddress },
            include: { user: { select: { id: true, role: true } } },
        });
        if (!wallet) {
            console.log(`🔐 New wallet login, creating user for ${normalizedAddress}`);
            const placeholderEmail = `wallet-${normalizedAddress}@temp.com`;
            // Create user with nested wallet (singular relation)
            const newUser = await db_ts_1.default.user.create({
                data: {
                    email: placeholderEmail,
                    role: "user", // matches your Role enum
                    wallet: {
                        create: {
                            address: normalizedAddress,
                        },
                    },
                },
                include: { wallet: true }, // ✅ singular
            });
            // Re‑fetch the wallet to get the user relation (needed for role)
            wallet = await db_ts_1.default.wallet.findUnique({
                where: { address: normalizedAddress },
                include: { user: { select: { id: true, role: true } } },
            });
            if (!wallet) {
                throw new Error("Failed to create wallet");
            }
        }
        // 5. Issue JWT tokens
        const { accessToken, refreshToken } = await issueTokens(wallet.userId.toString(), normalizedAddress, wallet.user.role);
        // 6. Validate JWT secrets are configured
        if (!JWT_SECRET) {
            console.error("JWT_SECRET is not set");
            res.status(500).json({ error: "Server configuration error" });
            return;
        }
        // 7. Set cookies
        const accessExpiresInMs = typeof JWT_EXPIRES_IN === "string"
            ? parseExpiresIn(JWT_EXPIRES_IN) * 1000
            : 15 * 60 * 1000;
        res.cookie("accessToken", accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: accessExpiresInMs,
            path: "/",
        });
        const refreshMaxAge = 7 * 24 * 60 * 60 * 1000;
        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: refreshMaxAge,
            path: "/auth/refresh",
        });
        // 8. Send success response
        res.status(200).json({
            message: "Authentication successful",
            expiresIn: Math.floor(accessExpiresInMs / 1000),
        });
    }
    catch (error) {
        console.error("VERIFY CONTROLLER ERROR:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
/**
 * Parse JWT expires_in string to milliseconds
 */
function parseExpiresIn(expiresIn) {
    // Allow decimal numbers: "1.5h", "0.5d"
    const match = expiresIn.match(/^(\d+(?:\.\d+)?)([smhd])$/);
    if (!match) {
        // If no unit, assume seconds (e.g., "3600")
        const seconds = Number(expiresIn);
        return isNaN(seconds) ? 24 * 60 * 60 : seconds; // default 24h in seconds
    }
    const value = parseFloat(match[1]);
    const unit = match[2];
    switch (unit) {
        case "s":
            return value;
        case "m":
            return value * 60;
        case "h":
            return value * 60 * 60;
        case "d":
            return value * 24 * 60 * 60;
        default:
            return 24 * 60 * 60; // 24h in seconds
    }
}
/*
This helper signs both tokens and stores the refresh token server-side.
Storing a hash rather than the raw refresh token is a common hardening step.
*/
function hashToken(token) {
    return crypto_1.default.createHash("sha256").update(token).digest("hex");
}
async function issueTokens(userId, walletAddress, role) {
    const accessToken = jsonwebtoken_1.default.sign({ userId, walletAddress, role }, JWT_SECRET, {
        expiresIn: "15m",
    });
    const refreshToken = jsonwebtoken_1.default.sign({ userId, walletAddress, role }, REFRESH_TOKEN_SECRET, { expiresIn: "7d" });
    const refreshHash = hashToken(refreshToken);
    await redis.set(`refresh:${refreshHash}`, JSON.stringify({ userId, walletAddress }), "EX", 7 * 24 * 60 * 60);
    return { accessToken, refreshToken };
}
async function refresh(req, res) {
    try {
        const refreshToken = req.cookies?.refreshToken;
        if (!refreshToken) {
            res.status(401).json({ error: "Missing refresh token" });
            return;
        }
        let payload;
        try {
            payload = jsonwebtoken_1.default.verify(refreshToken, REFRESH_TOKEN_SECRET);
        }
        catch {
            res.status(401).json({ error: "Invalid or expired refresh token" });
            return;
        }
        const refreshHash = hashToken(refreshToken);
        const stored = await redis.get(`refresh:${refreshHash}`);
        if (!stored) {
            res.status(401).json({ error: "Refresh token revoked or reused" });
            return;
        }
        await redis.del(`refresh:${refreshHash}`);
        const newAccessToken = jsonwebtoken_1.default.sign({
            userId: payload.userId,
            walletAddress: payload.walletAddress,
            role: payload.role,
        }, JWT_SECRET, { expiresIn: "15m" });
        const newRefreshToken = jsonwebtoken_1.default.sign({
            userId: payload.userId,
            walletAddress: payload.walletAddress,
            role: payload.role,
        }, REFRESH_TOKEN_SECRET, { expiresIn: "7d" });
        const newRefreshHash = hashToken(newRefreshToken);
        await redis.set(`refresh:${newRefreshHash}`, JSON.stringify({
            userId: payload.userId,
            walletAddress: payload.walletAddress,
            role: payload.role,
        }), "EX", 7 * 24 * 60 * 60);
        res.cookie("accessToken", newAccessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 15 * 60 * 1000,
            path: "/",
        });
        res.cookie("refreshToken", newRefreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: "/auth/refresh",
        });
        res.status(200).json({ message: "Session refreshed" });
    }
    catch {
        res.status(500).json({ error: "Internal server error" });
    }
}
async function syncRole(req, res) {
    try {
        const walletAddress = req.user?.walletAddress;
        const bodyRole = zod_1.z.enum(["user", "admin", "organization", "auditor", "owner"]).safeParse(req.body?.role);
        if (!bodyRole.success) {
            res.status(400).json({ error: "Invalid role" });
            return;
        }
        const normalizedAddress = walletAddress?.toLowerCase();
        if (!normalizedAddress) {
            res.status(400).json({ error: "Invalid wallet address" });
            return;
        }
        const wallet = await db_ts_1.default.wallet.findUnique({
            where: { address: normalizedAddress },
            include: { user: { select: { id: true, role: true } } },
        });
        if (!wallet) {
            res.status(404).json({ error: "Wallet not found" });
            return;
        }
        const newRole = bodyRole.data;
        // Update user role in DB
        await db_ts_1.default.user.update({
            where: { id: wallet.user.id },
            data: { role: newRole },
        });
        // Issue new tokens with the updated role
        const { accessToken, refreshToken } = await issueTokens(wallet.user.id.toString(), normalizedAddress, newRole);
        res.cookie("accessToken", accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 15 * 60 * 1000,
            path: "/",
        });
        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: "/auth/refresh",
        });
        res.status(200).json({ message: "Role synced", role: newRole });
    }
    catch (error) {
        console.error("Sync role error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
async function getMe(req, res) {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ error: "Not authenticated" });
            return;
        }
        const user = await db_ts_1.default.user.findUnique({
            where: { id: BigInt(userId) },
            include: { wallet: { select: { address: true } } },
        });
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }
        res.status(200).json({
            success: true,
            user: {
                id: user.id.toString(),
                email: user.email,
                fullName: user.fullName,
                role: user.role,
                isEligible: user.isEligible,
                authType: user.authType,
                photoUrl: user.photoUrl,
                walletAddress: user.wallet?.address ?? null,
                createdAt: user.createdAt.toISOString(),
            },
        });
    }
    catch (error) {
        console.error("Get me error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
async function logout(req, res) {
    try {
        const refreshToken = req.cookies?.refreshToken;
        if (refreshToken) {
            const refreshHash = hashToken(refreshToken);
            await redis.del(`refresh:${refreshHash}`);
        }
        res.clearCookie("accessToken", { path: "/" });
        res.clearCookie("refreshToken", { path: "/auth/refresh" });
        res.status(200).json({ message: "Logged out successfully" });
    }
    catch {
        res.status(500).json({ error: "Internal server error" });
    }
}
//# sourceMappingURL=auth.controller.js.map