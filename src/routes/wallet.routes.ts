import { Router } from "express";
import { requireAuth } from "../middleware/auth.ts";
import { requirePermission } from "../middleware/requirePermission.ts";
import { createWallet, getWallets, getWallet, getWalletByUser, updateWallet, deleteWallet } from "../controllers/wallet.controller.ts";

const walletRouter = Router();

// Users can only link their own; admins can do more (enforced in controller)
walletRouter.post("/", requireAuth, requirePermission("wallet:link:self"), createWallet);

// WARNING: Listing all wallets is a massive privacy leak. Restrict to admins/auditors.
walletRouter.get("/", requireAuth, requirePermission("wallet:read:all"), getWallets);
walletRouter.get("/user/:userId", requireAuth, requirePermission("wallet:read:all"), getWalletByUser);
walletRouter.get("/:id", requireAuth, requirePermission("wallet:read:all"), getWallet);
walletRouter.patch("/:id", requireAuth, requirePermission("wallet:link:self"), updateWallet);
walletRouter.delete("/:id", requireAuth, requirePermission("wallet:unlink"), deleteWallet);

export { walletRouter };