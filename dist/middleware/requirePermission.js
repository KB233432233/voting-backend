"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requirePermission = requirePermission;
const auth_ts_1 = require("../types/auth.ts");
function requirePermission(required) {
    return async (req, res, next) => {
        if (!req.user) {
            res.status(401).json({ error: "Authentication required" });
            return;
        }
        if (!req.user.role) {
            res.status(403).json({ error: "User role not assigned" });
            return;
        }
        if (!(0, auth_ts_1.hasPermission)(req.user.role, required)) {
            res
                .status(403)
                .json({ error: `Insufficient permissions. Requires: ${required}` });
            return;
        }
        next();
    };
}
//# sourceMappingURL=requirePermission.js.map