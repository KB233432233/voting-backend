import { Router } from "express";
import { requireAuth } from "../middleware/auth.ts";
import { requirePermission } from "../middleware/requirePermission.ts";
import {
  createCandidate,
  getCandidates,
  getCandidate,
  updateCandidate,
  deleteCandidate,
} from "../controllers/candidate.controller.ts";

const candidateRouter = Router();

candidateRouter.post("/", requireAuth, requirePermission("candidate:create"), createCandidate);
candidateRouter.get("/", getCandidates);
candidateRouter.get("/:id", getCandidate);
candidateRouter.patch("/:id", requireAuth, requirePermission("candidate:update"), updateCandidate);
candidateRouter.delete("/:id", requireAuth, requirePermission("candidate:delete"), deleteCandidate);

export { candidateRouter };