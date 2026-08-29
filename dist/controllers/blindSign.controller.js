"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.blindSign = blindSign;
const db_ts_1 = __importDefault(require("../config/db.ts"));
const crypto_1 = __importDefault(require("crypto"));
const zod_1 = __importDefault(require("zod"));
const chainVoting_ts_1 = require("../utils/chainVoting.ts");
const blindSignSchema = zod_1.default.object({
    token: zod_1.default.string().min(1, "Token is required"),
    blindedMessage: zod_1.default.string().min(1, "Blinded message is required"),
});
/**
 * Load RSA private key from environment variable
 */
function loadPrivateKey() {
    const pemKey = process.env.RSA_PRIVATE_KEY_PEM?.replace(/\\n/g, "\n");
    if (!pemKey)
        throw new Error("RSA_PRIVATE_KEY_PEM not configured");
    return crypto_1.default.createPrivateKey(pemKey);
}
/**
 * Perform RSA blind signing: s' = (m')^d mod n
 * Using Node.js crypto and BigInt for modular exponentiation
 */
function blindSign_(blindedMessageHex, privateKey) {
    if (!privateKey) {
        throw new Error("Private key is required");
    }
    const jwk = privateKey.export({
        format: "jwk",
    });
    // Note: asymmetricKeyDetails.modulus is NOT populated for RSA private
    // keys on newer Node versions — use the JWK modulus instead.
    if (!jwk.n || !jwk.d) {
        throw new Error("Invalid JWK format: missing n or d");
    }
    const n = BigInt("0x" + Buffer.from(jwk.n, "base64url").toString("hex"));
    const d = BigInt("0x" + Buffer.from(jwk.d, "base64url").toString("hex"));
    const mPrime = BigInt("0x" + blindedMessageHex);
    // Square-and-multiply modular exponentiation
    let result = 1n;
    let base = mPrime % n;
    let exp = d;
    while (exp > 0n) {
        if (exp % 2n === 1n)
            result = (result * base) % n;
        exp = exp / 2n;
        base = (base * base) % n;
    }
    return result.toString(16).padStart(n.toString(16).length, "0");
}
/**
 * POST /voting/blind-sign
 * Validate token and return blind signature
 */
async function blindSign(req, res) {
    try {
        const parseResult = blindSignSchema.safeParse(req.body);
        if (!parseResult.success) {
            res.status(400).json({
                error: "Invalid request body",
                details: parseResult.error.issues,
            });
            return;
        }
        const { token, blindedMessage } = parseResult.data;
        const userId = BigInt(req.user.userId);
        if (!/^[a-fA-F0-9]{64}$/.test(token)) {
            res.status(400).json({ error: "Invalid token format" });
            return;
        }
        if (!/^[a-fA-F0-9]+$/.test(blindedMessage)) {
            res.status(400).json({ error: "Invalid blinded message format" });
            return;
        }
        const tokenBuffer = Buffer.from(token, "hex");
        const tokenHash = crypto_1.default
            .createHash("sha256")
            .update(tokenBuffer)
            .digest("hex");
        const signature = await db_ts_1.default.$transaction(async (tx) => {
            const votingToken = await tx.votingToken.findUnique({
                where: { tokenHash },
                include: { poll: { select: { status: true, chainPollId: true } } },
            });
            if (!votingToken) {
                throw new Error("TOKEN_NOT_FOUND");
            }
            if (votingToken.userId !== userId) {
                throw new Error("TOKEN_NOT_OWNED");
            }
            if (votingToken.status !== "active") {
                throw new Error("TOKEN_NOT_ACTIVE");
            }
            if (votingToken.usedAt !== null) {
                throw new Error("TOKEN_ALREADY_USED");
            }
            let status = votingToken.poll.status;
            if (votingToken.poll.chainPollId != null) {
                const chainState = await (0, chainVoting_ts_1.getPollChainState)(votingToken.poll.chainPollId);
                if (chainState !== null) {
                    status = (0, chainVoting_ts_1.chainStateToStatus)(chainState);
                }
                else {
                    console.warn(`[blindSign] Chain state unavailable for poll ${votingToken.pollId}, falling back to DB status '${votingToken.poll.status}'`);
                }
            }
            if (status !== "active") {
                throw new Error("POLL_NOT_ACTIVE");
            }
            const privateKey = loadPrivateKey();
            const sig = blindSign_(blindedMessage, privateKey);
            // Only mark used if signing succeeds
            await tx.votingToken.update({
                where: { id: votingToken.id },
                data: { status: "used", usedAt: new Date() },
            });
            return sig;
        });
        res.status(200).json({
            signature,
            success: true,
        });
    }
    catch (error) {
        if (error instanceof Error) {
            switch (error.message) {
                case "TOKEN_NOT_FOUND":
                    res.status(404).json({ error: "Token not found" });
                    return;
                case "TOKEN_NOT_OWNED":
                    res.status(403).json({ error: "Token does not belong to user" });
                    return;
                case "TOKEN_NOT_ACTIVE":
                case "POLL_NOT_ACTIVE":
                    res.status(403).json({ error: "Token or poll is not active" });
                    return;
                case "TOKEN_ALREADY_USED":
                    res.status(409).json({ error: "Token has already been used" });
                    return;
                default:
                    if (error.message.includes("RSA_PRIVATE_KEY_PEM")) {
                        console.error("Error in blindSign:", error);
                        res.status(500).json({ error: "Server configuration error" });
                        return;
                    }
            }
        }
        console.error("Error in blindSign:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
//# sourceMappingURL=blindSign.controller.js.map