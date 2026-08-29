import { Router } from "express";
import { challenge, verify, refresh, getMe, syncRole, logout } from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth";
import { authLimiter } from "../middleware/rateLimit"; // Create this (see Step 3)

const authRouter = Router();

// Public endpoints: heavily rate-limited
authRouter.post("/challenge", authLimiter, challenge);
authRouter.post("/verify", authLimiter, verify);

// Protected endpoints
authRouter.post("/refresh", refresh);   // no requireAuth – uses refreshToken cookie, not accessToken
authRouter.get("/me", requireAuth, getMe);
authRouter.post("/me/role", requireAuth, syncRole);
authRouter.post("/logout", requireAuth, logout);

export { authRouter };