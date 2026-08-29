"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transactionRouter = void 0;
const express_1 = require("express");
const auth_ts_1 = require("../middleware/auth.ts");
const requirePermission_ts_1 = require("../middleware/requirePermission.ts");
const transaction_controller_ts_1 = require("../controllers/transaction.controller.ts");
const transactionRouter = (0, express_1.Router)();
exports.transactionRouter = transactionRouter;
transactionRouter.post("/", auth_ts_1.requireAuth, (0, requirePermission_ts_1.requirePermission)("tx:create"), transaction_controller_ts_1.createTransaction);
transactionRouter.get("/", auth_ts_1.requireAuth, (0, requirePermission_ts_1.requirePermission)("tx:read"), transaction_controller_ts_1.getTransactions);
transactionRouter.get("/:id", auth_ts_1.requireAuth, (0, requirePermission_ts_1.requirePermission)("tx:read"), transaction_controller_ts_1.getTransaction);
transactionRouter.patch("/:id", auth_ts_1.requireAuth, (0, requirePermission_ts_1.requirePermission)("tx:update"), transaction_controller_ts_1.updateTransaction);
transactionRouter.delete("/:id", auth_ts_1.requireAuth, (0, requirePermission_ts_1.requirePermission)("tx:delete"), transaction_controller_ts_1.deleteTransaction);
//# sourceMappingURL=transaction.routes.js.map