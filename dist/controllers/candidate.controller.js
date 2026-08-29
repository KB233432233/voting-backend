"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCandidate = createCandidate;
exports.getCandidates = getCandidates;
exports.getCandidate = getCandidate;
exports.updateCandidate = updateCandidate;
exports.deleteCandidate = deleteCandidate;
const db_ts_1 = __importDefault(require("../config/db.ts"));
const zod_1 = require("zod");
const snowflake_ts_1 = require("../utils/snowflake.ts");
// --- Validation Schemas ---
const createCandidateSchema = zod_1.z.object({
    pollId: zod_1.z.string().regex(/^\d+$/, "Poll ID must be a numeric string"),
    name: zod_1.z.string().min(2).max(255),
    description: zod_1.z.string().max(1000).optional(),
    photoUrl: zod_1.z.url("Invalid photo URL").max(500).optional(),
});
const updateCandidateSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).max(255).optional(),
    description: zod_1.z.string().max(1000).optional(),
    photoUrl: zod_1.z.url("Invalid photo URL").max(500).optional(),
});
const querySchema = zod_1.z.object({
    pollId: zod_1.z
        .string()
        .regex(/^\d+$/, "Poll ID must be a numeric string")
        .optional(),
});
// --- Controllers ---
/**
 * POST /candidates
 * Create a new candidate for a specific poll
 * ⚠️ Only allowed if poll status is 'draft'
 */
async function createCandidate(req, res) {
    try {
        const parse = createCandidateSchema.safeParse(req.body);
        if (!parse.success) {
            res
                .status(400)
                .json({ error: "Invalid input", details: parse.error.issues });
            return;
        }
        const { pollId, name, description, photoUrl } = parse.data;
        const pollIdBigInt = BigInt(pollId);
        // Verify poll exists and is draft
        const poll = await db_ts_1.default.poll.findUnique({ where: { id: pollIdBigInt } });
        if (!poll) {
            res.status(404).json({ error: "Poll not found" });
            return;
        }
        if (poll.status !== "draft") {
            res.status(403).json({ error: "Can only add candidates to draft polls" });
            return;
        }
        const candidate = await db_ts_1.default.candidate.create({
            data: {
                id: (0, snowflake_ts_1.generateSnowflakeIdBigInt)(),
                pollId: pollIdBigInt,
                name,
                description: description || null,
                photoUrl: photoUrl || null,
            },
        });
        res.status(201).json({
            success: true,
            candidateId: candidate.id.toString(),
            pollId: candidate.pollId.toString(),
            name: candidate.name,
            photoUrl: candidate.photoUrl,
        });
    }
    catch (error) {
        console.error("Create candidate error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
/**
 * GET /candidates
 * List candidates, optionally filtered by pollId
 */
async function getCandidates(req, res) {
    try {
        const parse = querySchema.safeParse(req.query);
        if (!parse.success) {
            res
                .status(400)
                .json({ error: "Invalid query params", details: parse.error.issues });
            return;
        }
        const { pollId } = parse.data;
        const candidates = await db_ts_1.default.candidate.findMany({
            where: pollId ? { pollId: BigInt(pollId) } : {},
            orderBy: { id: "asc" }, // Deterministic order
        });
        res.status(200).json({
            success: true,
            candidates: candidates.map((c) => ({
                ...c,
                id: c.id.toString(),
                pollId: c.pollId.toString(),
            })),
        });
    }
    catch (error) {
        console.error("Get candidates error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
/**
 * GET /candidates/:id
 * Get a single candidate by ID
 */
async function getCandidate(req, res) {
    try {
        const idParam = req.params.id;
        if (!idParam) {
            res.status(400).json({ error: "Candidate ID is required" });
            return;
        }
        const id = BigInt(idParam.toString());
        const candidate = await db_ts_1.default.candidate.findUnique({ where: { id } });
        if (!candidate) {
            res.status(404).json({ error: "Candidate not found" });
            return;
        }
        res.status(200).json({
            success: true,
            candidate: {
                ...candidate,
                id: candidate.id.toString(),
                pollId: candidate.pollId.toString(),
            },
        });
    }
    catch (error) {
        console.error("Get candidate error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
/**
 * PATCH /candidates/:id
 * Update candidate details
 * ⚠️ Only allowed if poll status is 'draft'
 */
async function updateCandidate(req, res) {
    try {
        const idParam = req.params.id;
        if (!idParam) {
            res.status(400).json({ error: "Candidate ID is required" });
            return;
        }
        const id = BigInt(idParam.toString());
        const parse = updateCandidateSchema.safeParse(req.body);
        if (!parse.success) {
            res
                .status(400)
                .json({ error: "Invalid input", details: parse.error.issues });
            return;
        }
        // Fetch candidate to check poll status
        const candidate = await db_ts_1.default.candidate.findUnique({
            where: { id },
            include: { poll: { select: { status: true } } },
        });
        if (!candidate) {
            res.status(404).json({ error: "Candidate not found" });
            return;
        }
        if (candidate.poll.status !== "draft") {
            res
                .status(403)
                .json({ error: "Can only update candidates in draft polls" });
            return;
        }
        const updateData = {};
        if (parse.data.name !== undefined)
            updateData.name = parse.data.name;
        if (parse.data.description !== undefined)
            updateData.description = parse.data.description;
        if (parse.data.photoUrl !== undefined)
            updateData.photoUrl = parse.data.photoUrl;
        const updated = await db_ts_1.default.candidate.update({
            where: { id },
            data: updateData,
        });
        res.status(200).json({
            success: true,
            candidate: {
                ...updated,
                id: updated.id.toString(),
                pollId: updated.pollId.toString(),
            },
        });
    }
    catch (error) {
        console.error("Update candidate error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
/**
 * DELETE /candidates/:id
 * Delete a candidate
 * ⚠️ Only allowed if poll status is 'draft'
 */
async function deleteCandidate(req, res) {
    try {
        const idParam = req.params.id;
        if (!idParam) {
            res.status(400).json({ error: "Candidate ID is required" });
            return;
        }
        const id = BigInt(idParam.toString());
        // Fetch candidate to check poll status
        const candidate = await db_ts_1.default.candidate.findUnique({
            where: { id },
            include: { poll: { select: { status: true } } },
        });
        if (!candidate) {
            res.status(404).json({ error: "Candidate not found" });
            return;
        }
        if (candidate.poll.status !== "draft") {
            res
                .status(403)
                .json({ error: "Can only delete candidates in draft polls" });
            return;
        }
        await db_ts_1.default.candidate.delete({ where: { id } });
        res
            .status(200)
            .json({ success: true, message: "Candidate deleted successfully" });
    }
    catch (error) {
        console.error("Delete candidate error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
//# sourceMappingURL=candidate.controller.js.map