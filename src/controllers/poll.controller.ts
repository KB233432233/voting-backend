import type { Response } from "express";
import type { AuthenticatedRequest } from "../types/auth";
import prisma from "../config/db";
import { z } from "zod";
import { generateSnowflakeIdBigInt } from "../utils/snowflake";
import { getPollChainState } from "../utils/chainVoting";

import { Prisma } from "@prisma/client"; 

// Validation schemas
const createPollSchema = z.object({
  name: z.string().min(3).max(255),
  description: z.string().max(1000).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date(),
  voteType: z.number().int().min(0).max(1).optional(),
  maxChoices: z.number().int().positive().optional(),
  chainPollId: z.string().regex(/^\d+$/).optional(),
  photoUrl: z.url("Invalid photo URL").max(500).optional(),
});

const updatePollSchema = z.object({
  name: z.string().min(3).max(255).optional(),
  description: z.string().max(1000).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  status: z.enum(["draft", "active", "closed", "tallied"]).optional(),
  voteType: z.number().int().min(0).max(1).optional(),
  maxChoices: z.number().int().positive().optional(),
  photoUrl: z.url("Invalid photo URL").max(500).nullable().optional(),
});

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(["draft", "active", "closed", "tallied"]).optional(),
  createdById: z.string().optional(),
});

const searchQuerySchema = z.object({
  q: z.string().min(1, "Search query cannot be empty"),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
/**
 * POST /polls
 * Create a new poll (starts in 'draft' status)
 */
export async function createPoll(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const parse = createPollSchema.safeParse(req.body);
    if (!parse.success) {
      res
        .status(400)
        .json({ error: "Invalid input", details: parse.error.issues });
      return;
    }

    const { name, description, startDate, endDate, voteType, maxChoices, chainPollId, photoUrl } = parse.data;
    const now = new Date();
    const poll = await prisma.poll.create({
      data: {
        id: generateSnowflakeIdBigInt(),
        name,
        description: description || null,
        startDate: startDate || new Date(),
        endDate,
        // Upcoming polls start as draft; polls whose start time has already
        // arrived start as active (otherwise the token-request gate at
        // "Poll is not active" would block voting forever).
        status: startDate && startDate > now ? "draft" : "active",
        voteType: voteType ?? 0,
        maxChoices: maxChoices ?? 1,
        photoUrl: photoUrl || null,
        ...(chainPollId ? { chainPollId: BigInt(chainPollId) } : {}),
        ...(req.user?.userId ? { createdById: BigInt(req.user.userId) } : {}),
      },
    });

    res.status(201).json({
      success: true,
      pollId: poll.id.toString(),
      createdById: poll.createdById?.toString() ?? null,
      status: poll.status,
      photoUrl: poll.photoUrl,
      message: `Poll created in ${poll.status} status.`,
    });
  } catch (error) {
    console.error("Create poll error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /polls
 * List polls with pagination & optional status filter
 */
export async function getPolls(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const parse = querySchema.safeParse(req.query);
    if (!parse.success) {
      res
        .status(400)
        .json({ error: "Invalid query params", details: parse.error.issues });
      return;
    }

    const { page, limit, status, createdById } = parse.data;
    const skip = (page - 1) * limit;

    const where = {
      ...(status ? { status } : {}),
      ...(createdById ? { createdById: BigInt(createdById) } : {}),
    };

    const [polls, total] = await prisma.$transaction([
      prisma.poll.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: { _count: { select: { candidates: true } } },
      }),
      prisma.poll.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      data: polls.map((p) => ({
        id: p.id.toString(),
        chainPollId: p.chainPollId?.toString() ?? null,
        name: p.name,
        description: p.description,
        photoUrl: p.photoUrl,
        startDate: p.startDate,
        endDate: p.endDate,
        status: p.status,
        voteType: p.voteType,
        maxChoices: p.maxChoices,
        candidateCount: p._count.candidates,
        createdById: p.createdById?.toString() ?? null,
        createdAt: p.createdAt,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Get polls error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /polls/:id
 * Get a single poll by ID
 */
export async function getPoll(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const idParam = req.params.id;
    if (!idParam || isNaN(Number(idParam))) {
      res.status(400).json({ error: "Invalid poll ID" });
      return;
    }
    const id = BigInt(idParam.toString());
    const poll = await prisma.poll.findUnique({
      where: { id },
      include: { _count: { select: { candidates: true } } },
    });

    if (!poll) {
      res.status(404).json({ error: "Poll not found" });
      return;
    }

    const chainState =
      poll.chainPollId != null
        ? await getPollChainState(poll.chainPollId)
        : null;

    res
      .status(200)
      .json({
        success: true,
        poll: {
          id: poll.id.toString(),
          chainPollId: poll.chainPollId?.toString() ?? null,
          name: poll.name,
          description: poll.description,
          photoUrl: poll.photoUrl,
          startDate: poll.startDate,
          endDate: poll.endDate,
          status: poll.status,
          chainState,
          voteType: poll.voteType,
          maxChoices: poll.maxChoices,
          candidateCount: poll._count.candidates,
          createdById: poll.createdById?.toString() ?? null,
          createdAt: poll.createdAt,
        },
      });
  } catch (error) {
    console.error("Get poll error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * PATCH /polls/:id
 * Update poll fields or transition status
 */
export async function updatePoll(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const idParam = req.params.id;
    if (!idParam || isNaN(Number(idParam))) {
      res.status(400).json({ error: "Invalid poll ID" });
      return;
    }
    const id = BigInt(idParam.toString());
    const parse = updatePollSchema.safeParse(req.body);
    if (!parse.success) {
      res
        .status(400)
        .json({ error: "Invalid input", details: parse.error.issues });
      return;
    }

    const poll = await prisma.poll.findUnique({ where: { id } });
    if (!poll) {
      res.status(404).json({ error: "Poll not found" });
      return;
    }

    // Prevent editing active/closed/tallied polls (except status transitions)
    const { status, ...updatableFields } = parse.data;
    if (poll.status !== "draft" && Object.keys(updatableFields).length > 0) {
      res
        .status(403)
        .json({ error: "Cannot modify details of non-draft polls" });
      return;
    }

    // Validate status transitions
    // 'tallied' is reachable from draft/active too: the admin Finalize flow
    // finalizes on-chain first, then marks the poll tallied — the cron may
    // not have flipped active → closed yet.
    const allowedTransitions: Record<string, string[]> = {
      draft: ["draft", "active", "tallied"],
      active: ["active", "closed", "tallied"],
      closed: ["closed", "tallied"],
      tallied: ["tallied"],
    };
    if (status && !allowedTransitions[poll.status]?.includes(status)) {
      if (!allowedTransitions) {
        res.status(500).json({ error: "Invalid poll status in database" });
        return;
      }
      res.status(400).json({
        error: `Invalid status transition. From '${poll.status}' you can only move to: ${allowedTransitions?.[poll.status]?.join(", ")}`,
      });
      return;
    }
    const updateData: any = { status: status || poll.status };
    if (updatableFields.name !== undefined)
      updateData.name = updatableFields.name;
    if (updatableFields.description !== undefined)
      updateData.description = updatableFields.description;
    if (updatableFields.startDate !== undefined)
      updateData.startDate = updatableFields.startDate;
    if (updatableFields.endDate !== undefined)
      updateData.endDate = updatableFields.endDate;
    if (updatableFields.voteType !== undefined)
      updateData.voteType = updatableFields.voteType;
    if (updatableFields.maxChoices !== undefined)
      updateData.maxChoices = updatableFields.maxChoices;
    if (updatableFields.photoUrl !== undefined)
      updateData.photoUrl = updatableFields.photoUrl;

    const updated = await prisma.poll.update({
      where: { id },
      data: updateData,
    });

    res.status(200).json({
      success: true,
      poll: {
        id: updated.id.toString(),
        chainPollId: updated.chainPollId?.toString() ?? null,
        name: updated.name,
        description: updated.description,
        photoUrl: updated.photoUrl,
        startDate: updated.startDate,
        endDate: updated.endDate,
        status: updated.status,
        voteType: updated.voteType,
        maxChoices: updated.maxChoices,
        createdById: updated.createdById?.toString() ?? null,
        createdAt: updated.createdAt,
      },
    });
  } catch (error) {
    console.error("Update poll error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * DELETE /polls/:id
 * Delete a poll (only allowed if status is 'draft' and no votes/tokens exist)
 */
export async function deletePoll(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const idParam = req.params.id;
    if (!idParam || isNaN(Number(idParam))) {
      res.status(400).json({ error: "Invalid poll ID" });
      return;
    }
    const id = BigInt(idParam.toString());
    const poll = await prisma.poll.findUnique({ where: { id } });

    if (!poll) {
      res.status(404).json({ error: "Poll not found" });
      return;
    }
    if (poll.status !== "draft") {
      res.status(403).json({ error: "Can only delete draft polls" });
      return;
    }

    const voteCount = await prisma.vote.count({ where: { pollId: id } });
    if (voteCount > 0) {
      res.status(400).json({ error: "Cannot delete poll with existing votes" });
      return;
    }

    await prisma.poll.delete({ where: { id } });
    res
      .status(200)
      .json({ success: true, message: "Poll deleted successfully" });
  } catch (error) {
    console.error("Delete poll error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}


export async function searchPolls(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const parse = searchQuerySchema.safeParse(req.query);
    if (!parse.success) {
      res
        .status(400)
        .json({ error: "Invalid search params", details: parse.error.issues });
      return;
    }

    const { q, page, limit } = parse.data;
    const skip = (page - 1) * limit;
    const searchTerm = q.trim();

    const where: Prisma.PollWhereInput = {
      name: {
        contains: searchTerm,
        mode: Prisma.QueryMode.insensitive,   // ✅ correct enum value
      },
    };

    const [polls, total] = await prisma.$transaction([
      prisma.poll.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: { _count: { select: { candidates: true } } },
      }),
      prisma.poll.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      data: polls.map((p) => ({
        id: p.id.toString(),
        chainPollId: p.chainPollId?.toString() ?? null,
        name: p.name,
        description: p.description,
        photoUrl: p.photoUrl,
        startDate: p.startDate,
        endDate: p.endDate,
        status: p.status,
        voteType: p.voteType,
        maxChoices: p.maxChoices,
        candidateCount: p._count.candidates,
        createdById: p.createdById?.toString() ?? null,
        createdAt: p.createdAt,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Search polls error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}