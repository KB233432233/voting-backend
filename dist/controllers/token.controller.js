"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestToken = requestToken;
const db_ts_1 = __importDefault(require("../config/db.ts"));
const crypto_1 = __importDefault(require("crypto"));
const zod_1 = require("zod");
const snowflake_ts_1 = require("../utils/snowflake.ts");
const chainVoting_ts_1 = require("../utils/chainVoting.ts");
const requestTokenSchema = zod_1.z.object({
    pollId: zod_1.z.string().transform((val) => BigInt(val)),
});
/**
 * POST /voting/tokens/request
 * Request a new voting token for an active poll
 */
async function requestToken(req, res) {
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
        const userId = BigInt(req.user.userId);
        const user = await db_ts_1.default.user.findUnique({
            where: { id: userId },
            select: { isEligible: true },
        });
        if (!user || !user.isEligible) {
            res.status(403).json({ error: "User is not eligible to vote" });
            return;
        }
        const poll = await db_ts_1.default.poll.findUnique({
            where: { id: pollId },
            select: { status: true, chainPollId: true },
        });
        if (!poll) {
            res.status(400).json({ error: "Poll not found" });
            return;
        }
        let status = poll.status;
        if (poll.chainPollId != null) {
            const chainState = await (0, chainVoting_ts_1.getPollChainState)(poll.chainPollId);
            if (chainState !== null) {
                status = (0, chainVoting_ts_1.chainStateToStatus)(chainState);
            }
            else {
                console.warn(`[token] Chain state unavailable for poll ${pollId}, falling back to DB status '${poll.status}'`);
            }
        }
        if (status !== "active") {
            res.status(403).json({ error: "Poll is not active", status });
            return;
        }
        const existingToken = await db_ts_1.default.votingToken.findFirst({
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
            await db_ts_1.default.votingToken.update({
                where: { id: existingToken.id },
                data: { status: "expired", usedAt: new Date() },
            });
        }
        const tokenBuffer = crypto_1.default.randomBytes(32);
        const plaintextToken = tokenBuffer.toString("hex");
        const tokenHash = crypto_1.default
            .createHash("sha256")
            .update(tokenBuffer)
            .digest("hex");
        const pollIdBigInt = BigInt(pollId);
        const userIdBigInt = BigInt(req.user.userId);
        const isWhitelisted = await db_ts_1.default.pollWhitelist.findUnique({
            where: { pollId_userId: { pollId: pollIdBigInt, userId: userIdBigInt } },
        });
        if (!isWhitelisted) {
            // Open voting: a poll with no whitelist entries at all lets any
            // eligible user vote. Once even one voter is whitelisted, the
            // whitelist is enforced strictly.
            const whitelistCount = await db_ts_1.default.pollWhitelist.count({
                where: { pollId: pollIdBigInt },
            });
            if (whitelistCount > 0) {
                res.status(403).json({
                    error: "You are not whitelisted to vote in this poll. Contact the poll organizer.",
                });
                return;
            }
        }
        const votingToken = await db_ts_1.default.votingToken.create({
            data: {
                id: (0, snowflake_ts_1.generateSnowflakeIdBigInt)(),
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
    }
    catch (error) {
        console.error("Error in requestToken:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
//# sourceMappingURL=token.controller.js.map