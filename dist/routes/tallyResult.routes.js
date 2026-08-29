"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tallyResultRouter = void 0;
const express_1 = require("express");
const auth_ts_1 = require("../middleware/auth.ts");
const requirePermission_ts_1 = require("../middleware/requirePermission.ts");
const tallyResult_controller_ts_1 = require("../controllers/tallyResult.controller.ts");
const tallyResultRouter = (0, express_1.Router)();
exports.tallyResultRouter = tallyResultRouter;
tallyResultRouter.post("/", auth_ts_1.requireAuth, (0, requirePermission_ts_1.requirePermission)("tally:compute"), tallyResult_controller_ts_1.createTallyResult);
tallyResultRouter.get("/", tallyResult_controller_ts_1.getTallyResults);
tallyResultRouter.get("/:id", tallyResult_controller_ts_1.getTallyResult);
tallyResultRouter.patch("/:id", auth_ts_1.requireAuth, (0, requirePermission_ts_1.requirePermission)("tally:finalize"), tallyResult_controller_ts_1.updateTallyResult);
tallyResultRouter.delete("/:id", auth_ts_1.requireAuth, (0, requirePermission_ts_1.requirePermission)("tally:recompute"), tallyResult_controller_ts_1.deleteTallyResult);
//# sourceMappingURL=tallyResult.routes.js.map