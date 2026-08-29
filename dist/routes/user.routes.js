"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRouter = void 0;
const express_1 = require("express");
const auth_ts_1 = require("../middleware/auth.ts");
const requirePermission_ts_1 = require("../middleware/requirePermission.ts");
const user_controller_ts_1 = require("../controllers/user.controller.ts");
const userRouter = (0, express_1.Router)();
exports.userRouter = userRouter;
userRouter.post("/onboard-wallet", auth_ts_1.requireAuth, (0, requirePermission_ts_1.requirePermission)("user:create"), user_controller_ts_1.onboardWallet);
userRouter.post("/", auth_ts_1.requireAuth, (0, requirePermission_ts_1.requirePermission)("user:create"), user_controller_ts_1.createUser);
userRouter.get("/", auth_ts_1.requireAuth, (0, requirePermission_ts_1.requirePermission)("user:read"), user_controller_ts_1.getUsers);
userRouter.get("/:id", auth_ts_1.requireAuth, (0, requirePermission_ts_1.requirePermission)("user:read"), user_controller_ts_1.getUser);
userRouter.patch("/me", auth_ts_1.requireAuth, user_controller_ts_1.updateSelf);
userRouter.patch("/:id", auth_ts_1.requireAuth, (0, requirePermission_ts_1.requirePermission)("user:update"), user_controller_ts_1.updateUser);
userRouter.delete("/:id", auth_ts_1.requireAuth, (0, requirePermission_ts_1.requirePermission)("user:delete"), user_controller_ts_1.deleteUser);
// Role management is the most sensitive user operation
userRouter.patch("/:id/role", auth_ts_1.requireAuth, (0, requirePermission_ts_1.requirePermission)("user:manage:roles"), user_controller_ts_1.updateUserRole);
//# sourceMappingURL=user.routes.js.map