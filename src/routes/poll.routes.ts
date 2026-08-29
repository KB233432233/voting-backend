import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/requirePermission";
import { createPoll, getPolls, getPoll, updatePoll, deletePoll, searchPolls } from "../controllers/poll.controller";
import { addToWhitelist, removeFromWhitelist, getWhitelist } from "../controllers/pollWhitelist.controller";

const pollRouter = Router();

pollRouter.post("/", requireAuth, requirePermission("poll:create"), createPoll);
pollRouter.get("/", getPolls);
pollRouter.get('/search', searchPolls); // Assuming you have a searchPolls function in your controller
pollRouter.get("/:id", getPoll);
pollRouter.patch("/:id", requireAuth, requirePermission("poll:update"), updatePoll);
pollRouter.delete("/:id", requireAuth, requirePermission("poll:delete"), deletePoll);

pollRouter.post("/:pollId/whitelist", requireAuth, requirePermission("poll:update"), addToWhitelist);
pollRouter.get("/:pollId/whitelist", requireAuth, requirePermission("poll:read"), getWhitelist);
pollRouter.delete("/:pollId/whitelist/:userId", requireAuth, requirePermission("poll:update"), removeFromWhitelist);

export { pollRouter };