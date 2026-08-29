"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.votingRouter = void 0;
const express_1 = require("express");
const auth_ts_1 = require("../middleware/auth.ts");
const requirePermission_ts_1 = require("../middleware/requirePermission.ts");
const token_controller_ts_1 = require("../controllers/token.controller.ts");
const blindSign_controller_ts_1 = require("../controllers/blindSign.controller.ts");
const rateLimit_ts_1 = require("../middleware/rateLimit.ts");
const publicKey_controller_ts_1 = require("../controllers/publicKey.controller.ts");
const votingRouter = (0, express_1.Router)();
exports.votingRouter = votingRouter;
votingRouter.get("/public-key", publicKey_controller_ts_1.getVotingPublicKey);
votingRouter.post("/tokens/request", auth_ts_1.requireAuth, (0, requirePermission_ts_1.requirePermission)("token:request"), rateLimit_ts_1.tokenRequestLimiter, token_controller_ts_1.requestToken);
votingRouter.post("/blind-sign", auth_ts_1.requireAuth, (0, requirePermission_ts_1.requirePermission)("vote:cast"), rateLimit_ts_1.blindSignLimiter, blindSign_controller_ts_1.blindSign);
//# sourceMappingURL=voting.routes.js.map