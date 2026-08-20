import { Router } from "express";
import { requireAuth } from "../middleware/auth.ts";
import { requirePermission } from "../middleware/requirePermission.ts";
import {
  createVotingToken,
  getVotingTokens,
  getVotingToken,
  updateVotingToken,
  deleteVotingToken,
} from "../controllers/votingToken.controller.ts";

const votingTokenRouter = Router();

votingTokenRouter.post("/", requireAuth, requirePermission("token:issue"), createVotingToken);
votingTokenRouter.get("/", requireAuth, requirePermission("token:read"), getVotingTokens);
votingTokenRouter.get("/:id", requireAuth, requirePermission("token:read"), getVotingToken);
votingTokenRouter.patch("/:id", requireAuth, requirePermission("token:revoke"), updateVotingToken);
votingTokenRouter.delete("/:id", requireAuth, requirePermission("token:delete"), deleteVotingToken);

export { votingTokenRouter };