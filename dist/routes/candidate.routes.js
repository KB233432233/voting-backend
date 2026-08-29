"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.candidateRouter = void 0;
const express_1 = require("express");
const auth_ts_1 = require("../middleware/auth.ts");
const requirePermission_ts_1 = require("../middleware/requirePermission.ts");
const candidate_controller_ts_1 = require("../controllers/candidate.controller.ts");
const candidateRouter = (0, express_1.Router)();
exports.candidateRouter = candidateRouter;
candidateRouter.post("/", auth_ts_1.requireAuth, (0, requirePermission_ts_1.requirePermission)("candidate:create"), candidate_controller_ts_1.createCandidate);
candidateRouter.get("/", candidate_controller_ts_1.getCandidates);
candidateRouter.get("/:id", candidate_controller_ts_1.getCandidate);
candidateRouter.patch("/:id", auth_ts_1.requireAuth, (0, requirePermission_ts_1.requirePermission)("candidate:update"), candidate_controller_ts_1.updateCandidate);
candidateRouter.delete("/:id", auth_ts_1.requireAuth, (0, requirePermission_ts_1.requirePermission)("candidate:delete"), candidate_controller_ts_1.deleteCandidate);
//# sourceMappingURL=candidate.routes.js.map