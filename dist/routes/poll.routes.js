"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pollRouter = void 0;
const express_1 = require("express");
const auth_ts_1 = require("../middleware/auth.ts");
const requirePermission_ts_1 = require("../middleware/requirePermission.ts");
const poll_controller_ts_1 = require("../controllers/poll.controller.ts");
const pollWhitelist_controller_ts_1 = require("../controllers/pollWhitelist.controller.ts");
const pollRouter = (0, express_1.Router)();
exports.pollRouter = pollRouter;
pollRouter.post("/", auth_ts_1.requireAuth, (0, requirePermission_ts_1.requirePermission)("poll:create"), poll_controller_ts_1.createPoll);
pollRouter.get("/", poll_controller_ts_1.getPolls);
pollRouter.get('/search', poll_controller_ts_1.searchPolls); // Assuming you have a searchPolls function in your controller
pollRouter.get("/:id", poll_controller_ts_1.getPoll);
pollRouter.patch("/:id", auth_ts_1.requireAuth, (0, requirePermission_ts_1.requirePermission)("poll:update"), poll_controller_ts_1.updatePoll);
pollRouter.delete("/:id", auth_ts_1.requireAuth, (0, requirePermission_ts_1.requirePermission)("poll:delete"), poll_controller_ts_1.deletePoll);
pollRouter.post("/:pollId/whitelist", auth_ts_1.requireAuth, (0, requirePermission_ts_1.requirePermission)("poll:update"), pollWhitelist_controller_ts_1.addToWhitelist);
pollRouter.get("/:pollId/whitelist", auth_ts_1.requireAuth, (0, requirePermission_ts_1.requirePermission)("poll:read"), pollWhitelist_controller_ts_1.getWhitelist);
pollRouter.delete("/:pollId/whitelist/:userId", auth_ts_1.requireAuth, (0, requirePermission_ts_1.requirePermission)("poll:update"), pollWhitelist_controller_ts_1.removeFromWhitelist);
//# sourceMappingURL=poll.routes.js.map