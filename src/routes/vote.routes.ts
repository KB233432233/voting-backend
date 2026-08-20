import { Router } from "express";
import { requireAuth } from "../middleware/auth.ts";
import { requirePermission } from "../middleware/requirePermission.ts";
import { createVote, getVotes, getVote, deleteVote } from "../controllers/vote.controller.ts";

const voteRouter = Router();

voteRouter.post("/", requireAuth, requirePermission("vote:cast"), createVote);
// WARNING: getVotes is highly sensitive. Restrict to auditors/admins only.
voteRouter.get("/", requireAuth, requirePermission("vote:read:raw"), getVotes);
voteRouter.get("/:id", requireAuth, requirePermission("vote:read:raw"), getVote);
voteRouter.delete("/:id", requireAuth, requirePermission("vote:revoke"), deleteVote);

export { voteRouter };