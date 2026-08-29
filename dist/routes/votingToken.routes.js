"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.votingTokenRouter = void 0;
const express_1 = require("express");
const auth_ts_1 = require("../middleware/auth.ts");
const requirePermission_ts_1 = require("../middleware/requirePermission.ts");
const votingToken_controller_ts_1 = require("../controllers/votingToken.controller.ts");
const votingTokenRouter = (0, express_1.Router)();
exports.votingTokenRouter = votingTokenRouter;
votingTokenRouter.post("/", auth_ts_1.requireAuth, (0, requirePermission_ts_1.requirePermission)("token:issue"), votingToken_controller_ts_1.createVotingToken);
votingTokenRouter.get("/", auth_ts_1.requireAuth, (0, requirePermission_ts_1.requirePermission)("token:read"), votingToken_controller_ts_1.getVotingTokens);
votingTokenRouter.get("/:id", auth_ts_1.requireAuth, (0, requirePermission_ts_1.requirePermission)("token:read"), votingToken_controller_ts_1.getVotingToken);
votingTokenRouter.patch("/:id", auth_ts_1.requireAuth, (0, requirePermission_ts_1.requirePermission)("token:revoke"), votingToken_controller_ts_1.updateVotingToken);
votingTokenRouter.delete("/:id", auth_ts_1.requireAuth, (0, requirePermission_ts_1.requirePermission)("token:delete"), votingToken_controller_ts_1.deleteVotingToken);
//# sourceMappingURL=votingToken.routes.js.map