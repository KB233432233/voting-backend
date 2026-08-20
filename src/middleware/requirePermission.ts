import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../types/auth.ts";
import type {  Permission } from "../utils/permissions.ts";
import { hasPermission } from "../types/auth.ts";

export function requirePermission(required: Permission) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!req.user.role) {
      res.status(403).json({ error: "User role not assigned" });
      return;
    }

    if (!hasPermission(req.user.role, required)) {
      res
        .status(403)
        .json({ error: `Insufficient permissions. Requires: ${required}` });
      return;
    }
    next();
  };
}
