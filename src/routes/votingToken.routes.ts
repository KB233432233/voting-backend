import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/requirePermission";
import {
  createVotingToken,
  getVotingTokens,
  getVotingToken,
  updateVotingToken,
  deleteVotingToken,
} from "../controllers/votingToken.controller";

const votingTokenRouter = Router();

votingTokenRouter.post("/", requireAuth, requirePermission("token:issue"), createVotingToken);
votingTokenRouter.get("/", requireAuth, requirePermission("token:read"), getVotingTokens);
votingTokenRouter.get("/:id", requireAuth, requirePermission("token:read"), getVotingToken);
votingTokenRouter.patch("/:id", requireAuth, requirePermission("token:revoke"), updateVotingToken);
votingTokenRouter.delete("/:id", requireAuth, requirePermission("token:delete"), deleteVotingToken);

export { votingTokenRouter };