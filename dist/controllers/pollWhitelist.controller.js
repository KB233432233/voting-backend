"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addToWhitelist = addToWhitelist;
exports.removeFromWhitelist = removeFromWhitelist;
exports.getWhitelist = getWhitelist;
const db_ts_1 = __importDefault(require("../config/db.ts"));
const zod_1 = require("zod");
const snowflake_ts_1 = require("../utils/snowflake.ts");
// --- Validation Schemas ---
const addSchema = zod_1.z.object({
    userId: zod_1.z.string().regex(/^\d+$/, "userId must be a numeric string"),
});
const querySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().positive().default(1),
    limit: zod_1.z.coerce.number().int().positive().max(100).default(50),
});
const idParamSchema = zod_1.z.string().regex(/^\d+$/, "ID must be a numeric string");
// --- Controllers ---
async function addToWhitelist(req, res) {
    // 1. Validate pollId param
    const pollIdValid = idParamSchema.safeParse(req.params.pollId);
    if (!pollIdValid.success) {
        res.status(400).json({ error: "Invalid pollId format" });
        return;
    }
    const pollId = BigInt(pollIdValid.data);
    // 2. Validate request body
    const bodyParse = addSchema.safeParse(req.body);
    if (!bodyParse.success) {
        res.status(400).json({ error: "Invalid userId", details: bodyParse.error.issues });
        return;
    }
    const userId = BigInt(bodyParse.data.userId);
    // 3. Check if poll exists
    const poll = await db_ts_1.default.poll.findUnique({
        where: { id: pollId },
        select: { id: true }, // only need existence
    });
    if (!poll) {
        res.status(404).json({ error: "Poll not found" });
        return;
    }
    // 4. Check if the target user exists
    const userExists = await db_ts_1.default.user.findUnique({
        where: { id: userId },
        select: { id: true },
    });
    if (!userExists) {
        res.status(404).json({ error: "User not found" });
        return;
    }
    // 5. Upsert whitelist entry
    try {
        await db_ts_1.default.pollWhitelist.upsert({
            where: { pollId_userId: { pollId, userId } },
            create: { id: (0, snowflake_ts_1.generateSnowflakeIdBigInt)(), pollId, userId },
            update: {}, // no-op if already exists
        });
        res.json({ success: true, message: "User added to whitelist" });
    }
    catch (error) {
        console.error("Error adding to whitelist:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
async function removeFromWhitelist(req, res) {
    // 1. Validate pollId param
    const pollIdValid = idParamSchema.safeParse(req.params.pollId);
    if (!pollIdValid.success) {
        res.status(400).json({ error: "Invalid pollId format" });
        return;
    }
    const pollId = BigInt(pollIdValid.data);
    // 2. Validate userId param
    const userIdValid = idParamSchema.safeParse(req.params.userId);
    if (!userIdValid.success) {
        res.status(400).json({ error: "Invalid userId format" });
        return;
    }
    const userId = BigInt(userIdValid.data);
    // 3. Check if poll exists (optional but good practice)
    const poll = await db_ts_1.default.poll.findUnique({
        where: { id: pollId },
        select: { id: true },
    });
    if (!poll) {
        res.status(404).json({ error: "Poll not found" });
        return;
    }
    // 4. Delete the whitelist entry
    try {
        const deleted = await db_ts_1.default.pollWhitelist.deleteMany({
            where: { pollId, userId },
        });
        if (deleted.count === 0) {
            res.status(404).json({ error: "User not in whitelist" });
            return;
        }
        res.json({ success: true, message: "User removed from whitelist" });
    }
    catch (error) {
        console.error("Error removing from whitelist:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
async function getWhitelist(req, res) {
    // 1. Validate pollId param
    const pollIdValid = idParamSchema.safeParse(req.params.pollId);
    if (!pollIdValid.success) {
        res.status(400).json({ error: "Invalid pollId format" });
        return;
    }
    const pollId = BigInt(pollIdValid.data);
    // 2. Validate query params (page, limit)
    const queryParse = querySchema.safeParse(req.query);
    if (!queryParse.success) {
        res.status(400).json({ error: "Invalid query parameters", details: queryParse.error.issues });
        return;
    }
    const { page, limit } = queryParse.data;
    const skip = (page - 1) * limit;
    // 3. Check if poll exists
    const poll = await db_ts_1.default.poll.findUnique({
        where: { id: pollId },
        select: { id: true },
    });
    if (!poll) {
        res.status(404).json({ error: "Poll not found" });
        return;
    }
    // 4. Fetch whitelist entries with pagination
    try {
        const [entries, total] = await db_ts_1.default.$transaction([
            db_ts_1.default.pollWhitelist.findMany({
                where: { pollId },
                select: {
                    userId: true,
                    user: {
                        select: { email: true, fullName: true },
                    },
                },
                skip,
                take: limit,
            }),
            db_ts_1.default.pollWhitelist.count({ where: { pollId } }),
        ]);
        res.json({
            success: true,
            whitelist: entries.map((e) => ({
                userId: e.userId.toString(),
                email: e.user.email,
                fullName: e.user.fullName,
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    }
    catch (error) {
        console.error("Error fetching whitelist:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
//# sourceMappingURL=pollWhitelist.controller.js.map