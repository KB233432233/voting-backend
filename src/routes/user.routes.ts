import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/requirePermission";
import { createUser, getUsers, getUser, updateUser, updateSelf, deleteUser, updateUserRole, onboardWallet } from "../controllers/user.controller";

const userRouter = Router();

userRouter.post("/onboard-wallet", requireAuth, requirePermission("user:create"), onboardWallet);
userRouter.post("/", requireAuth, requirePermission("user:create"), createUser);
userRouter.get("/", requireAuth, requirePermission("user:read"), getUsers);
userRouter.get("/:id", requireAuth, requirePermission("user:read"), getUser);
userRouter.patch("/me", requireAuth, updateSelf);
userRouter.patch("/:id", requireAuth, requirePermission("user:update"), updateUser);
userRouter.delete("/:id", requireAuth, requirePermission("user:delete"), deleteUser);

// Role management is the most sensitive user operation
userRouter.patch("/:id/role", requireAuth, requirePermission("user:manage:roles"), updateUserRole);

export { userRouter };