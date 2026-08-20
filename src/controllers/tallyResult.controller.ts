import type { Response } from "express";
import type { AuthenticatedRequest } from "../types/auth.ts";
import prisma from "../config/db.ts";
import { z } from "zod";
import { generateSnowflakeIdBigInt } from "../utils/snowflake.ts";
import { Prisma } from "@prisma/client";

const tallyStatusEnum = z.enum(["pending", "final", "disputed"]);

const createTallySchema = z.object({
  pollId: z.string().regex(/^\d+$/, "Poll ID must be numeric"),
  winnerCandidateId: z.string().regex(/^\d+$/, "Winner Candidate ID must be numeric").optional(),
  resultsData: z.record(z.string(), z.any()),
  status: tallyStatusEnum.default("pending"),
});

const updateTallySchema = z.object({
  winnerCandidateId: z.string().regex(/^\d+$/).optional(),
  resultsData: z.record(z.string(), z.any()).optional(),
  status: tallyStatusEnum.optional(),
});

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(10),
  status: tallyStatusEnum.optional(),
});

/**
 * POST /tally-results
 * Create initial tally record for a poll
 */
export async function createTallyResult(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const parse = createTallySchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "Invalid input", details: parse.error.issues });
      return;
    }

    const { pollId, winnerCandidateId, resultsData, status } = parse.data;
    const pollIdBigInt = BigInt(pollId);
    const winnerIdBigInt = winnerCandidateId ? BigInt(winnerCandidateId) : undefined;

    const poll = await prisma.poll.findUnique({ where: { id: pollIdBigInt } });
    if (!poll) {
      res.status(404).json({ error: "Poll not found" });
      return;
    }

    const existing = await prisma.tallyResult.findUnique({ where: { pollId: pollIdBigInt } });
    if (existing) {
      res.status(409).json({ error: "Tally result already exists for this poll. Use PATCH to update." });
      return;
    }

    if (winnerIdBigInt) {
      const candidate = await prisma.candidate.findFirst({ where: { id: winnerIdBigInt, pollId: pollIdBigInt } });
      if (!candidate) {
        res.status(404).json({ error: "Winner candidate not found in this poll" });
        return;
      }
    }

    const result = await prisma.tallyResult.create({
       data: {
        id: generateSnowflakeIdBigInt(),
        pollId: pollIdBigInt,
        winnerCandidateId: winnerIdBigInt || null,
        resultsData: resultsData ? (resultsData as Prisma.InputJsonValue) : Prisma.JsonNull,
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
  } catch (error) {
    console.error("Create tally result error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /tally-results
 * List all tally results with pagination
 */
export async function getTallyResults(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const parse = querySchema.safeParse(req.query);
    if (!parse.success) {
      res.status(400).json({ error: "Invalid query params", details: parse.error.issues });
      return;
    }

    const { page, limit, status } = parse.data;
    const skip = (page - 1) * limit;
    const where = status ? { status } : {};

    const [results, total] = await prisma.$transaction([
      prisma.tallyResult.findMany({
        where,
        include: { poll: { select: { name: true, status: true } }, winnerCandidate: { select: { name: true } } },
        orderBy: { computedAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.tallyResult.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      tallyResults: results.map((r:any) => ({
        ...r,
        id: r.id.toString(),
        pollId: r.pollId.toString(),
        winnerCandidateId: r.winnerCandidateId?.toString() || null,
        resultsData: r.resultsData,
        computedAt: r.computedAt,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Get tally results error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /tally-results/:id
 * Get tally by ID or by Poll ID
 */
export async function getTallyResult(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const idParam = req.params.id;
    if(!idParam) {
      res.status(400).json({ error: "ID parameter is required" });
      return;
    }
    const lookupId = idParam.toString().trim();
    const isPollId = /^\d+$/.test(lookupId);

    const result = await prisma.tallyResult.findUnique({
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
  } catch (error) {
    console.error("Get tally result error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * PATCH /tally-results/:id
 * Update tally (audit-safe)
 */
export async function updateTallyResult(req: AuthenticatedRequest, res: Response): Promise<void> {
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

    const existing = await prisma.tallyResult.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Tally result not found" });
      return;
    }

    if (existing.status === "final" && !parse.data.status) {
      res.status(403).json({ error: "Final tallies cannot be modified. Mark as disputed to edit." });
      return;
    }

    // ✅ Explicit payload construction (avoids exactOptionalPropertyTypes errors)
    const updateData: any = { computedAt: new Date() };
    if (parse.data.status) updateData.status = parse.data.status;
    if (parse.data.winnerCandidateId) updateData.winnerCandidateId = BigInt(parse.data.winnerCandidateId);
    if (parse.data.resultsData) updateData.resultsData = parse.data.resultsData as Prisma.InputJsonValue;

    const updated = await prisma.tallyResult.update({ where: { id },  data: updateData });

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
  } catch (error) {
    console.error("Update tally result error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * DELETE /tally-results/:id
 * Remove pending tally only
 */
export async function deleteTallyResult(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const idParam = req.params.id;
    if (!idParam) {
      res.status(400).json({ error: "ID parameter is required" });
      return;
    }
    const id = BigInt(idParam.toString());
    const result = await prisma.tallyResult.findUnique({ where: { id } });
    if (!result) {
      res.status(404).json({ error: "Tally result not found" });
      return;
    }
    if (result.status !== "pending") {
      res.status(403).json({ error: "Cannot delete finalized or disputed tallies. Audit trail required." });
      return;
    }

    await prisma.tallyResult.delete({ where: { id } });
    res.status(200).json({ success: true, message: "Pending tally result deleted" });
  } catch (error) {
    console.error("Delete tally result error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}