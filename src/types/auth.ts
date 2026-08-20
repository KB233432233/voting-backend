import type { Request } from "express";
/**
 * JWT payload structure for authenticated users
 */
export interface JWTPayload {
  userId: string;
  walletAddress: string;
  role: UserRole;
}
/**
 * Extended Express Request with authenticated user context
 * Use this type in middleware/controllers that require auth
 */
export interface AuthenticatedRequest extends Request {
  user?: JWTPayload;
}

export type UserRole = "user" | "admin" | "organization" | "auditor" | "owner";

export function isAuthenticated(req: Request): req is AuthenticatedRequest {
  return "user" in req && req.user !== undefined;
}/**
 * Standardized Permission Type
 * Format: "resource:action" or "resource:action:scope"
 */
// Define permissions as a const array
export const PERMISSIONS = [
  // Polls & Candidates
  "poll:create", "poll:read", "poll:update", "poll:delete",
  "candidate:create", "candidate:read", "candidate:update", "candidate:delete",
  
  // Voting & Tokens
  "vote:cast", "vote:read:raw", "vote:revoke",
  "token:request", "token:issue", "token:read", "token:revoke", "token:delete",
  
  // Tally & Transactions
  "tally:compute", "tally:read", "tally:finalize", "tally:recompute",
  "tx:create", "tx:read", "tx:update", "tx:delete",
  
  // User & Wallet Management
  "user:create", "user:read", "user:update", "user:delete", "user:manage:roles",
  "wallet:link:self", "wallet:read:all", "wallet:unlink"
] as const;

// Derive the type from the array
export type Permission = typeof PERMISSIONS[number];
/**
 * Role-Based Access Control (RBAC) Matrix
 * Maps each role to the specific permissions it is granted.
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  user: [
    "vote:cast",
    "token:request",
    "poll:read",
    "candidate:read",
    "wallet:link:self",
  ],
  
  admin: [
    "poll:create", "poll:read", "poll:update", "poll:delete",
    "candidate:create", "candidate:read", "candidate:update", "candidate:delete",
    "user:create", "user:read", "user:update", "user:delete", "user:manage:roles",
    "token:issue", "token:read", "token:revoke", "token:delete",
    "tally:compute", "tally:read", "tally:finalize", "tally:recompute",
    "tx:create", "tx:read", "tx:update", "tx:delete",
    "vote:read:raw", "vote:revoke",
    "wallet:read:all", "wallet:unlink",
  ],
  
  organization: [
    "poll:create", "poll:read", "poll:update", // Controller should enforce org ownership
    "candidate:create", "candidate:read", "candidate:update", "candidate:delete",
    "user:read",
    "token:issue", "token:read",
    "tally:read",
    "tx:read",
  ],
  
  auditor: [
    "poll:read",
    "candidate:read",
    "vote:read:raw",
    "tally:read", "tally:compute",
    "tx:read",
    "token:read",
    "wallet:read:all",
  ],
  
  owner: [
    "poll:create", "poll:read", "poll:update", "poll:delete",
    "candidate:create", "candidate:read", "candidate:update", "candidate:delete",
    "user:create", "user:read", "user:update", "user:delete", "user:manage:roles",
    "token:issue", "token:read", "token:revoke", "token:delete",
    "tally:compute", "tally:read", "tally:finalize", "tally:recompute",
    "tx:create", "tx:read", "tx:update", "tx:delete",
    "vote:cast", "vote:read:raw", "vote:revoke",
    "wallet:link:self", "wallet:read:all", "wallet:unlink",
  ],
};


export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
