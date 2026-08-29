import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/requirePermission";
import { requestToken } from "../controllers/token.controller";
import { blindSign } from "../controllers/blindSign.controller";
import { tokenRequestLimiter, blindSignLimiter } from "../middleware/rateLimit";
import { getVotingPublicKey } from "../controllers/publicKey.controller";

const votingRouter = Router();

votingRouter.get("/public-key", getVotingPublicKey);
votingRouter.post("/tokens/request", requireAuth, requirePermission("token:request"), tokenRequestLimiter, requestToken);
votingRouter.post("/blind-sign", requireAuth, requirePermission("vote:cast"), blindSignLimiter, blindSign);

export { votingRouter };