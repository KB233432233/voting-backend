import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/requirePermission";
import {
  createTallyResult,
  getTallyResults,
  getTallyResult,
  updateTallyResult,
  deleteTallyResult,
} from "../controllers/tallyResult.controller";

const tallyResultRouter = Router();

tallyResultRouter.post("/", requireAuth, requirePermission("tally:compute"), createTallyResult);
tallyResultRouter.get("/", getTallyResults);
tallyResultRouter.get("/:id", getTallyResult);
tallyResultRouter.patch("/:id", requireAuth, requirePermission("tally:finalize"), updateTallyResult);
tallyResultRouter.delete("/:id", requireAuth, requirePermission("tally:recompute"), deleteTallyResult);

export { tallyResultRouter };