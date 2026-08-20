import type{ Response } from "express";
import type { AuthenticatedRequest } from "../types/auth.ts";
import prisma from "../config/db.ts";
import { z } from "zod";
import { generateSnowflakeIdBigInt } from "../utils/snowflake.ts";

// --- Validation Schemas ---
const addSchema = z.object({
  userId: z.string().regex(/^\d+$/, "userId must be a numeric string"),
});

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

const idParamSchema = z.string().regex(/^\d+$/, "ID must be a numeric string");

// --- Controllers ---

export async function addToWhitelist(req: AuthenticatedRequest, res: Response): Promise<void> {
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
  const poll = await prisma.poll.findUnique({
    where: { id: pollId },
    select: { id: true }, // only need existence
  });
  if (!poll) {
    res.status(404).json({ error: "Poll not found" });
    return;
  }

  // 4. Check if the target user exists
  const userExists = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!userExists) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // 5. Upsert whitelist entry
  try {
    await prisma.pollWhitelist.upsert({
      where: { pollId_userId: { pollId, userId } },
      create: { id: generateSnowflakeIdBigInt(), pollId, userId },
      update: {}, // no-op if already exists
    });
    res.json({ success: true, message: "User added to whitelist" });
  } catch (error) {
    console.error("Error adding to whitelist:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function removeFromWhitelist(req: AuthenticatedRequest, res: Response): Promise<void> {
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
  const poll = await prisma.poll.findUnique({
    where: { id: pollId },
    select: { id: true },
  });
  if (!poll) {
    res.status(404).json({ error: "Poll not found" });
    return;
  }

  // 4. Delete the whitelist entry
  try {
    const deleted = await prisma.pollWhitelist.deleteMany({
      where: { pollId, userId },
    });
    if (deleted.count === 0) {
      res.status(404).json({ error: "User not in whitelist" });
      return;
    }
    res.json({ success: true, message: "User removed from whitelist" });
  } catch (error) {
    console.error("Error removing from whitelist:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function getWhitelist(req: AuthenticatedRequest, res: Response): Promise<void> {
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
  const poll = await prisma.poll.findUnique({
    where: { id: pollId },
    select: { id: true },
  });
  if (!poll) {
    res.status(404).json({ error: "Poll not found" });
    return;
  }

  // 4. Fetch whitelist entries with pagination
  try {
    const [entries, total] = await prisma.$transaction([
      prisma.pollWhitelist.findMany({
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
      prisma.pollWhitelist.count({ where: { pollId } }),
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
  } catch (error) {
    console.error("Error fetching whitelist:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}