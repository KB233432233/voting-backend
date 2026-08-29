"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROLE_PERMISSIONS = exports.PERMISSIONS = void 0;
exports.isAuthenticated = isAuthenticated;
exports.hasPermission = hasPermission;
function isAuthenticated(req) {
    return "user" in req && req.user !== undefined;
} /**
 * Standardized Permission Type
 * Format: "resource:action" or "resource:action:scope"
 */
// Define permissions as a const array
exports.PERMISSIONS = [
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
];
/**
 * Role-Based Access Control (RBAC) Matrix
 * Maps each role to the specific permissions it is granted.
 */
exports.ROLE_PERMISSIONS = {
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
function hasPermission(role, permission) {
    return exports.ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
//# sourceMappingURL=auth.js.map