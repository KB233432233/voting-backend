"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletRouter = void 0;
const express_1 = require("express");
const auth_ts_1 = require("../middleware/auth.ts");
const requirePermission_ts_1 = require("../middleware/requirePermission.ts");
const wallet_controller_ts_1 = require("../controllers/wallet.controller.ts");
const walletRouter = (0, express_1.Router)();
exports.walletRouter = walletRouter;
// Users can only link their own; admins can do more (enforced in controller)
walletRouter.post("/", auth_ts_1.requireAuth, (0, requirePermission_ts_1.requirePermission)("wallet:link:self"), wallet_controller_ts_1.createWallet);
// WARNING: Listing all wallets is a massive privacy leak. Restrict to admins/auditors.
walletRouter.get("/", auth_ts_1.requireAuth, (0, requirePermission_ts_1.requirePermission)("wallet:read:all"), wallet_controller_ts_1.getWallets);
walletRouter.get("/user/:userId", auth_ts_1.requireAuth, (0, requirePermission_ts_1.requirePermission)("wallet:read:all"), wallet_controller_ts_1.getWalletByUser);
walletRouter.get("/:id", auth_ts_1.requireAuth, (0, requirePermission_ts_1.requirePermission)("wallet:read:all"), wallet_controller_ts_1.getWallet);
walletRouter.patch("/:id", auth_ts_1.requireAuth, (0, requirePermission_ts_1.requirePermission)("wallet:link:self"), wallet_controller_ts_1.updateWallet);
walletRouter.delete("/:id", auth_ts_1.requireAuth, (0, requirePermission_ts_1.requirePermission)("wallet:unlink"), wallet_controller_ts_1.deleteWallet);
//# sourceMappingURL=wallet.routes.js.map