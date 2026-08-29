"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const auth_controller_ts_1 = require("../controllers/auth.controller.ts");
const auth_ts_1 = require("../middleware/auth.ts");
const rateLimit_ts_1 = require("../middleware/rateLimit.ts"); // Create this (see Step 3)
const authRouter = (0, express_1.Router)();
exports.authRouter = authRouter;
// Public endpoints: heavily rate-limited
authRouter.post("/challenge", rateLimit_ts_1.authLimiter, auth_controller_ts_1.challenge);
authRouter.post("/verify", rateLimit_ts_1.authLimiter, auth_controller_ts_1.verify);
// Protected endpoints
authRouter.post("/refresh", auth_controller_ts_1.refresh); // no requireAuth – uses refreshToken cookie, not accessToken
authRouter.get("/me", auth_ts_1.requireAuth, auth_controller_ts_1.getMe);
authRouter.post("/me/role", auth_ts_1.requireAuth, auth_controller_ts_1.syncRole);
authRouter.post("/logout", auth_ts_1.requireAuth, auth_controller_ts_1.logout);
//# sourceMappingURL=auth.routes.js.map