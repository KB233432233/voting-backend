import type { Response } from "express";
import type { AuthenticatedRequest } from "../types/auth";
import prisma from "../config/db";
import { z } from "zod";
import { generateSnowflakeIdBigInt } from "../utils/snowflake";
import { hasPermission } from "../types/auth";
import {PERMISSIONS, ROLE_PERMISSIONS} from "../types/auth";
import type { UserRole } from "../types/auth";
import { tryCatch } from "bullmq";
// Validation Schemas
const createUserSchema = z.object({
  email: z.string().email("Invalid email format"),
  fullName: z.string().min(2).max(255).optional(),
  passwordHash: z.string().min(8).optional(), // Optional for wallet-first flow
  isEligible: z.boolean().default(true),
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  fullName: z.string().min(2).max(255).optional(),
  passwordHash: z.string().min(8).optional(),
  isEligible: z.boolean().optional(),
  photoUrl: z.string().max(2_000_000).optional(),
});

const onboardWalletSchema = z.object({
  walletAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid wallet address"),
  role: z.enum(["user", "organization", "auditor", "admin"]),
  email: z.string().email().optional(),
});

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  isEligible: z.coerce.boolean().optional(),
});

/**
 * POST /users
 * Create a new user
 */
export async function createUser(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const parse = createUserSchema.safeParse(req.body);
    if (!parse.success) {
      res
        .status(400)
        .json({ error: "Invalid input", details: parse.error.issues });
      return;
    }

    const { email, fullName, passwordHash, isEligible } = parse.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    const user = await prisma.user.create({
      data: {
        id: generateSnowflakeIdBigInt(),
        email,
        fullName: fullName || null,
        passwordHash: passwordHash || null,
        isEligible,
      },
    });

    res.status(201).json({
      success: true,
      userId: user.id.toString(),
      email: user.email,
      isEligible: user.isEligible,
    });
  } catch (error) {
    console.error("Create user error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * POST /users/onboard-wallet
 * Provision (or update) a backend User + Wallet for an on-chain role grant
 * (admin added org/auditor/admin on chain — mirror it in the DB so the
 * org/auditor/admin dashboards and whitelist UI have a user to work with).
 */
export async function onboardWallet(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const parse = onboardWalletSchema.safeParse(req.body);
    if (!parse.success) {
      res
        .status(400)
        .json({ error: "Invalid input", details: parse.error.issues });
      return;
    }

    const { walletAddress, role, email } = parse.data;
    const normalizedAddress = walletAddress.toLowerCase();

    const existingWallet = await prisma.wallet.findUnique({
      where: { address: normalizedAddress },
      include: { user: { select: { id: true, email: true } } },
    });

    // Wallet already registered → just sync the role
    if (existingWallet) {
      const updated = await prisma.user.update({
        where: { id: existingWallet.user.id },
        data: { role },
        select: { id: true, email: true, role: true },
      });
      res.status(200).json({
        success: true,
        created: false,
        user: {
          id: updated.id.toString(),
          email: updated.email,
          role: updated.role,
          walletAddress: normalizedAddress,
        },
      });
      return;
    }

    const userId = generateSnowflakeIdBigInt();
    const [user, wallet] = await prisma.$transaction([
      prisma.user.create({
        data: {
          id: userId,
          email: email || `wallet-${normalizedAddress}@temp.com`,
          role,
          isEligible: true,
        },
      }),
      prisma.wallet.create({
        data: {
          id: generateSnowflakeIdBigInt(),
          userId,
          address: normalizedAddress,
          chain: "sepolia",
        },
      }),
    ]);

    res.status(201).json({
      success: true,
      created: true,
      user: {
        id: user.id.toString(),
        email: user.email,
        role: user.role,
        walletAddress: wallet.address,
      },
    });
  } catch (error: any) {
    if (error?.code === "P2002") {
      res.status(409).json({ error: "Wallet address already registered" });
      return;
    }
    console.error("Onboard wallet error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /users
 * List users with pagination & eligibility filter
 */
export async function getUsers(
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

    const { page, limit, isEligible } = parse.data;
    const skip = (page - 1) * limit;
    const where = isEligible !== undefined ? { isEligible } : {};

    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          fullName: true,
          isEligible: true,
          role: true,
          createdAt: true,
          photoUrl: true,
          wallet: { select: { address: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      users: users.map((u) => ({
        ...u,
        id: u.id.toString(),
        walletAddress: u.wallet?.address ?? null,
        wallet: undefined,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /users/:id
 * Get single user
 */
export async function getUser(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const idParam = req.params.id;
    if (!idParam) {
      res.status(400).json({ error: "Candidate ID is required" });
      return;
    }
    const id = BigInt(idParam.toString());
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        fullName: true,
        isEligible: true,
        role: true,
        createdAt: true,
        photoUrl: true,
        wallet: { select: { address: true } },
      },
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res
      .status(200)
      .json({
        success: true,
        user: {
          ...user,
          id: user.id.toString(),
          walletAddress: user.wallet?.address ?? null,
          wallet: undefined,
        },
      });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * PATCH /users/:id
 * Update user fields
 */
export async function updateUser(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const idParam = req.params.id;
    if (!idParam) {
      res.status(400).json({ error: "Candidate ID is required" });
      return;
    }
    const id = BigInt(idParam.toString());
    const parse = updateUserSchema.safeParse(req.body);
    if (!parse.success) {
      res
        .status(400)
        .json({ error: "Invalid input", details: parse.error.issues });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Prevent duplicate email on update
    if (parse.data.email && parse.data.email !== user.email) {
      const existing = await prisma.user.findUnique({
        where: { email: parse.data.email },
      });
      if (existing) {
        res.status(409).json({ error: "Email already registered" });
        return;
      }
    }
    const updateData: {
      email?: string;
      fullName?: string;
      passwordHash?: string;
      isEligible?: boolean;
      photoUrl?: string;
    } = {};

    if (parse.data.email !== undefined) updateData.email = parse.data.email;
    if (parse.data.fullName !== undefined)
      updateData.fullName = parse.data.fullName;
    if (parse.data.passwordHash !== undefined)
      updateData.passwordHash = parse.data.passwordHash;
    if (parse.data.isEligible !== undefined)
      updateData.isEligible = parse.data.isEligible;
    if (parse.data.photoUrl !== undefined)
      updateData.photoUrl = parse.data.photoUrl;
    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    res.status(200).json({
      success: true,
      user: { ...updated, id: updated.id.toString() },
    });
  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * PATCH /users/me
 * Update own profile (no special permission needed, just auth)
 */
export async function updateSelf(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  req.params.id = userId;
  return updateUser(req, res);
}

/**
 * DELETE /users/:id
 * Delete user (blocked if user has cast votes)
 */
/**
 * DELETE /users/:id
 * Delete user (blocked if user has already voted)
 * Note: votes table has NO userId for anonymity. We check votingTokens instead.
 */
export async function deleteUser(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const idParam = req.params.id;
    if (!idParam) {
      res.status(400).json({ error: "User ID is required" });   
      return;
    }
    const id = BigInt(idParam.toString());
    const user = await prisma.user.findUnique({ where: { id } });
    
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Check if user has consumed voting tokens (indicates they participated)
    const usedTokens = await prisma.votingToken.count({
      where: { userId: id, status: 'used' }
    });

    if (usedTokens > 0) {
      res.status(400).json({
        error: "Cannot delete user who has already voted. Consider deactivating (isEligible=false) instead."
      });
      return;
    }

    await prisma.user.delete({ where: { id } });
    res.status(200).json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function updateUserRole(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const idParam = req.params.id;
    if (!idParam) {
      res.status(400).json({ error: "User ID is required" });
      return;
    }
    const userId = BigInt(idParam.toString());
    const parse = z.object({
      role: z.enum(["user", "admin", "organization", "auditor", "owner"]),
      permission: z.enum(PERMISSIONS),
    }).safeParse(req.body);

    if (!parse.success) {
      res.status(400).json({ error: "Invalid role", details: parse.error.issues });
      return;
    }

    const targetRole = parse.data.role; 
    const targetPermission = parse.data.permission;
    if (!targetPermission) {
      res.status(404).json({ error: "Permission required unsend" });
      return;
    }
    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    
    if (targetUser.id.toString() === req.user!.userId) {
      res.status(403).json({ error: "Cannot modify your own role" });
      return;
    }

    //Permission mapping based on your exact matrix
    // const roleToPermission: Record<string, Permission | null> = {
    //   admin: "manage_admins",
    //   owner: "manage_admins",
    //   auditor: "manage_auditors",
    //   organization: "manage_organizations",
    //   user: null, // Downgrading to 'user' requires any management permission
    // };

    const requiredPermission = ROLE_PERMISSIONS[targetRole as UserRole];
    if (requiredPermission && !hasPermission(req.user!.role, targetPermission)) {
      res.status(403).json({ 
        error: `Insufficient permissions to assign '${targetRole}' role. Requires: ${requiredPermission}` 
      });
      return;
    }

    // If downgrading to 'user', ensure caller has at least one management permission
    if (targetRole === "user" && req.user!.role === "user") {
      res.status(403).json({ error: "Regular users cannot modify roles" });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { role: targetRole },
    });

    res.status(200).json({
      success: true,
      user: {
        id: updated.id.toString(),
        email: updated.email,
        role: updated.role,
      },
    });
  } catch (error) {
    console.error("Update user role error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}