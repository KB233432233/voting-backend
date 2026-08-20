import { Router } from "express";
import { requireAuth } from "../middleware/auth.ts";
import { requirePermission } from "../middleware/requirePermission.ts";
import { requestToken } from "../controllers/token.controller.ts";
import { blindSign } from "../controllers/blindSign.controller.ts";
import { tokenRequestLimiter, blindSignLimiter } from "../middleware/rateLimit.ts";
import { getVotingPublicKey } from "../controllers/publicKey.controller.ts";

const votingRouter = Router();

votingRouter.get("/public-key", getVotingPublicKey);
votingRouter.post("/tokens/request", requireAuth, requirePermission("token:request"), tokenRequestLimiter, requestToken);
votingRouter.post("/blind-sign", requireAuth, requirePermission("vote:cast"), blindSignLimiter, blindSign);

export { votingRouter };