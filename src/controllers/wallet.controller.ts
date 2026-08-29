import type { Response } from "express";
import type { AuthenticatedRequest } from "../types/auth";
import prisma from "../config/db";
import { z } from "zod";
import { generateSnowflakeIdBigInt } from "../utils/snowflake";

const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;

// Validation Schemas
const createWalletSchema = z.object({
  userId: z.string().regex(/^\d+$/, "User ID must be a numeric string"),
  address: z.string().regex(ethAddressRegex, "Invalid Ethereum address format"),
  chain: z.string().default("polygon"),
});

const updateWalletSchema = z.object({
  chain: z.string().optional(),
  // Note: address & userId are immutable to preserve auth session integrity
});

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  chain: z.string().optional(),
});

/**
 * POST /wallets
 * Link a wallet to a user (1:1 relationship)
 */
export async function createWallet(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const parse = createWalletSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "Invalid input", details: parse.error.issues });
      return;
    }

    const { userId, address, chain } = parse.data;
    const userIdBigInt = BigInt(userId);
    const normalizedAddress = address.toLowerCase();

    // Verify user exists
    const user = await prisma.user.findUnique({ where: { id: userIdBigInt } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Check if user already has a wallet
    const existingUserWallet = await prisma.wallet.findUnique({ where: { userId: userIdBigInt } });
    if (existingUserWallet) {
      res.status(409).json({ error: "User already has a registered wallet" });
      return;
    }

    // Check if address is already registered to another user
    const existingAddressWallet = await prisma.wallet.findUnique({ where: { address: normalizedAddress } });
    if (existingAddressWallet) {
      res.status(409).json({ error: "Wallet address already registered" });
      return;
    }

    const wallet = await prisma.wallet.create({
       data: {
        id: generateSnowflakeIdBigInt(),
        userId: userIdBigInt,
        address: normalizedAddress,
        chain,
      },
    });

    res.status(201).json({
      success: true,
      walletId: wallet.id.toString(),
      userId: wallet.userId.toString(),
      address: wallet.address,
      chain: wallet.chain,
    });
  } catch (error) {
    console.error("Create wallet error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /wallets
 * List wallets with pagination & chain filter
 */
export async function getWallets(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const parse = querySchema.safeParse(req.query);
    if (!parse.success) {
      res.status(400).json({ error: "Invalid query params", details: parse.error.issues });
      return;
    }

    const { page, limit, chain } = parse.data;
    const skip = (page - 1) * limit;
    const where = chain ? { chain } : {};

    const [wallets, total] = await prisma.$transaction([
      prisma.wallet.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.wallet.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      wallets: wallets.map((w:any) => ({ ...w, id: w.id.toString(), userId: w.userId.toString() })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Get wallets error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /wallets/:id
 * Get wallet by ID
 */
export async function getWallet(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const idParam = req.params.id;
    if (!idParam) {
      res.status(400).json({ error: "Invalid wallet ID" });
      return;
    }
    const id = BigInt(idParam.toString());
    const wallet = await prisma.wallet.findUnique({ where: { id } });

    if (!wallet) {
      res.status(404).json({ error: "Wallet not found" });
      return;
    }

    res.status(200).json({
      success: true,
      wallet: { ...wallet, id: wallet.id.toString(), userId: wallet.userId.toString() },
    });
  } catch (error) {
    console.error("Get wallet error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /wallets/user/:userId
 * Get wallet linked to a specific user
 */
export async function getWalletByUser(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const idParam = req.params.id;
    if(!idParam)
    {
        res.status(400).json({ error: "Invalid user ID" });
        return;
    }
    const userId = BigInt(idParam.toString());
    const wallet = await prisma.wallet.findUnique({ where: { userId } });

    if (!wallet) {
      res.status(404).json({ error: "No wallet found for this user" });
      return;
    }

    res.status(200).json({
      success: true,
      wallet: { ...wallet, id: wallet.id.toString(), userId: wallet.userId.toString() },
    });
  } catch (error) {
    console.error("Get wallet by user error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * PATCH /wallets/:id
 * Update wallet (only 'chain' field is mutable)
 */
export async function updateWallet(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const idParam = req.params.id;
    if (!idParam) {
      res.status(400).json({ error: "Invalid wallet ID" });
      return;
    }
    const id = BigInt(idParam.toString());
    const parse = updateWalletSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "Invalid input", details: parse.error.issues });
      return;
    }

    const wallet = await prisma.wallet.findUnique({ where: { id } });
    if (!wallet) {
      res.status(404).json({ error: "Wallet not found" });
      return;
    }

    const updated = await prisma.wallet.update({
      where: { id },
       data: { chain: parse.data.chain ?? wallet.chain },
    });

    res.status(200).json({
      success: true,
      wallet: { ...updated, id: updated.id.toString(), userId: updated.userId.toString() },
    });
  } catch (error) {
    console.error("Update wallet error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * DELETE /wallets/:id
 * Delete wallet (WARNING: breaks authentication for this user until re-registered)
 */
export async function deleteWallet(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const idParam = req.params.id;
    if (!idParam) {
      res.status(400).json({ error: "Invalid wallet ID" });
      return;
    }
    const id = BigInt(idParam.toString());
    const wallet = await prisma.wallet.findUnique({ where: { id } });

    if (!wallet) {
      res.status(404).json({ error: "Wallet not found" });
      return;
    }

    await prisma.wallet.delete({ where: { id } });
    res.status(200).json({ success: true, message: "Wallet deleted successfully. User must re-authenticate." });
  } catch (error) {
    console.error("Delete wallet error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}