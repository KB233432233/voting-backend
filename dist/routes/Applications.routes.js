"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applicationRouter = void 0;
const express_1 = require("express");
const auth_ts_1 = require("../middleware/auth.ts");
const applicationRouter = (0, express_1.Router)();
exports.applicationRouter = applicationRouter;
const orgApplication_controller_ts_1 = require("../controllers/orgApplication.controller.ts");
applicationRouter.post("/", orgApplication_controller_ts_1.createApplication);
applicationRouter.get("/", orgApplication_controller_ts_1.getApplications);
applicationRouter.delete("/:id", auth_ts_1.requireAuth, orgApplication_controller_ts_1.deleteApplication);
//# sourceMappingURL=Applications.routes.js.map