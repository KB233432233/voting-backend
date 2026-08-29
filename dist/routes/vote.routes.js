"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.voteRouter = void 0;
const express_1 = require("express");
const auth_ts_1 = require("../middleware/auth.ts");
const requirePermission_ts_1 = require("../middleware/requirePermission.ts");
const vote_controller_ts_1 = require("../controllers/vote.controller.ts");
const voteRouter = (0, express_1.Router)();
exports.voteRouter = voteRouter;
voteRouter.post("/", auth_ts_1.requireAuth, (0, requirePermission_ts_1.requirePermission)("vote:cast"), vote_controller_ts_1.createVote);
// WARNING: getVotes is highly sensitive. Restrict to auditors/admins only.
voteRouter.get("/", auth_ts_1.requireAuth, (0, requirePermission_ts_1.requirePermission)("vote:read:raw"), vote_controller_ts_1.getVotes);
voteRouter.get("/:id", auth_ts_1.requireAuth, (0, requirePermission_ts_1.requirePermission)("vote:read:raw"), vote_controller_ts_1.getVote);
voteRouter.delete("/:id", auth_ts_1.requireAuth, (0, requirePermission_ts_1.requirePermission)("vote:revoke"), vote_controller_ts_1.deleteVote);
//# sourceMappingURL=vote.routes.js.map