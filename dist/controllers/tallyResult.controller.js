"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTallyResult = createTallyResult;
exports.getTallyResults = getTallyResults;
exports.getTallyResult = getTallyResult;
exports.updateTallyResult = updateTallyResult;
exports.deleteTallyResult = deleteTallyResult;
const db_ts_1 = __importDefault(require("../config/db.ts"));
const zod_1 = require("zod");
const snowflake_ts_1 = require("../utils/snowflake.ts");
const client_1 = require("@prisma/client");
const tallyStatusEnum = zod_1.z.enum(["pending", "final", "disputed"]);
const createTallySchema = zod_1.z.object({
    pollId: zod_1.z.string().regex(/^\d+$/, "Poll ID must be numeric"),
    winnerCandidateId: zod_1.z.string().regex(/^\d+$/, "Winner Candidate ID must be numeric").optional(),
    resultsData: zod_1.z.record(zod_1.z.string(), zod_1.z.any()),
    status: tallyStatusEnum.default("pending"),
});
const updateTallySchema = zod_1.z.object({
    winnerCandidateId: zod_1.z.string().regex(/^\d+$/).optional(),
    resultsData: zod_1.z.record(zod_1.z.string(), zod_1.z.any()).optional(),
    status: tallyStatusEnum.optional(),
});
const querySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().positive().default(1),
    limit: zod_1.z.coerce.number().int().positive().max(50).default(10),
    status: tallyStatusEnum.optional(),
});
/**
 * POST /tally-results
 * Create initial tally record for a poll
 */
async function createTallyResult(req, res) {
    try {
        const parse = createTallySchema.safeParse(req.body);
        if (!parse.success) {
            res.status(400).json({ error: "Invalid input", details: parse.error.issues });
            return;
        }
        const { pollId, winnerCandidateId, resultsData, status } = parse.data;
        const pollIdBigInt = BigInt(pollId);
        const winnerIdBigInt = winnerCandidateId ? BigInt(winnerCandidateId) : undefined;
        const poll = await db_ts_1.default.poll.findUnique({ where: { id: pollIdBigInt } });
        if (!poll) {
            res.status(404).json({ error: "Poll not found" });
            return;
        }
        const existing = await db_ts_1.default.tallyResult.findUnique({ where: { pollId: pollIdBigInt } });
        if (existing) {
            res.status(409).json({ error: "Tally result already exists for this poll. Use PATCH to update." });
            return;
        }
        if (winnerIdBigInt) {
            const candidate = await db_ts_1.default.candidate.findFirst({ where: { id: winnerIdBigInt, pollId: pollIdBigInt } });
            if (!candidate) {
                res.status(404).json({ error: "Winner candidate not found in this poll" });
                return;
            }
        }
        const result = await db_ts_1.default.tallyResult.create({
            data: {
                id: (0, snowflake_ts_1.generateSnowflakeIdBigInt)(),
                pollId: pollIdBigInt,
                winnerCandidateId: winnerIdBigInt || null,
                resultsData: resultsData ? resultsData : client_1.Prisma.JsonNull,
                status,
            },
        });
        res.status(201).json({
            success: true,
            tallyResultId: result.id.toString(),
            pollId: result.pollId.toString(),
            status: result.status,
            computedAt: result.computedAt,
        });
    }
    catch (error) {
        console.error("Create tally result error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
/**
 * GET /tally-results
 * List all tally results with pagination
 */
async function getTallyResults(req, res) {
    try {
        const parse = querySchema.safeParse(req.query);
        if (!parse.success) {
            res.status(400).json({ error: "Invalid query params", details: parse.error.issues });
            return;
        }
        const { page, limit, status } = parse.data;
        const skip = (page - 1) * limit;
        const where = status ? { status } : {};
        const [results, total] = await db_ts_1.default.$transaction([
            db_ts_1.default.tallyResult.findMany({
                where,
                include: { poll: { select: { name: true, status: true } }, winnerCandidate: { select: { name: true } } },
                orderBy: { computedAt: "desc" },
                skip,
                take: limit,
            }),
            db_ts_1.default.tallyResult.count({ where }),
        ]);
        res.status(200).json({
            success: true,
            tallyResults: results.map((r) => ({
                ...r,
                id: r.id.toString(),
                pollId: r.pollId.toString(),
                winnerCandidateId: r.winnerCandidateId?.toString() || null,
                resultsData: r.resultsData,
                computedAt: r.computedAt,
            })),
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    }
    catch (error) {
        console.error("Get tally results error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
/**
 * GET /tally-results/:id
 * Get tally by ID or by Poll ID
 */
async function getTallyResult(req, res) {
    try {
        const idParam = req.params.id;
        if (!idParam) {
            res.status(400).json({ error: "ID parameter is required" });
            return;
        }
        const lookupId = idParam.toString().trim();
        const isPollId = /^\d+$/.test(lookupId);
        const result = await db_ts_1.default.tallyResult.findUnique({
            where: isPollId ? { pollId: BigInt(lookupId) } : { id: BigInt(lookupId) },
            include: { poll: { select: { name: true, status: true } }, winnerCandidate: { select: { name: true, id: true } } },
        });
        if (!result) {
            res.status(404).json({ error: "Tally result not found" });
            return;
        }
        res.status(200).json({
            success: true,
            tallyResult: {
                ...result,
                id: result.id.toString(),
                pollId: result.pollId.toString(),
                winnerCandidateId: result.winnerCandidateId?.toString() || null,
                resultsData: result.resultsData,
                computedAt: result.computedAt,
            },
        });
    }
    catch (error) {
        console.error("Get tally result error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
/**
 * PATCH /tally-results/:id
 * Update tally (audit-safe)
 */
async function updateTallyResult(req, res) {
    try {
        const idParam = req.params.id;
        if (!idParam) {
            res.status(400).json({ error: "ID parameter is required" });
            return;
        }
        const id = BigInt(idParam.toString());
        const parse = updateTallySchema.safeParse(req.body);
        if (!parse.success) {
            res.status(400).json({ error: "Invalid input", details: parse.error.issues });
            return;
        }
        const existing = await db_ts_1.default.tallyResult.findUnique({ where: { id } });
        if (!existing) {
            res.status(404).json({ error: "Tally result not found" });
            return;
        }
        if (existing.status === "final" && !parse.data.status) {
            res.status(403).json({ error: "Final tallies cannot be modified. Mark as disputed to edit." });
            return;
        }
        // ✅ Explicit payload construction (avoids exactOptionalPropertyTypes errors)
        const updateData = { computedAt: new Date() };
        if (parse.data.status)
            updateData.status = parse.data.status;
        if (parse.data.winnerCandidateId)
            updateData.winnerCandidateId = BigInt(parse.data.winnerCandidateId);
        if (parse.data.resultsData)
            updateData.resultsData = parse.data.resultsData;
        const updated = await db_ts_1.default.tallyResult.update({ where: { id }, data: updateData });
        res.status(200).json({
            success: true,
            tallyResult: {
                ...updated,
                id: updated.id.toString(),
                pollId: updated.pollId.toString(),
                winnerCandidateId: updated.winnerCandidateId?.toString() || null,
                resultsData: updated.resultsData,
                computedAt: updated.computedAt,
            },
        });
    }
    catch (error) {
        console.error("Update tally result error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
/**
 * DELETE /tally-results/:id
 * Remove pending tally only
 */
async function deleteTallyResult(req, res) {
    try {
        const idParam = req.params.id;
        if (!idParam) {
            res.status(400).json({ error: "ID parameter is required" });
            return;
        }
        const id = BigInt(idParam.toString());
        const result = await db_ts_1.default.tallyResult.findUnique({ where: { id } });
        if (!result) {
            res.status(404).json({ error: "Tally result not found" });
            return;
        }
        if (result.status !== "pending") {
            res.status(403).json({ error: "Cannot delete finalized or disputed tallies. Audit trail required." });
            return;
        }
        await db_ts_1.default.tallyResult.delete({ where: { id } });
        res.status(200).json({ success: true, message: "Pending tally result deleted" });
    }
    catch (error) {
        console.error("Delete tally result error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
//# sourceMappingURL=tallyResult.controller.js.map