import { Router } from "express";
import { requireAuth } from "../middleware/auth.ts";
import { requirePermission } from "../middleware/requirePermission.ts";
import {
  createTransaction,
  getTransactions,
  getTransaction,
  updateTransaction,
  deleteTransaction,
} from "../controllers/transaction.controller.ts";

const transactionRouter = Router();

transactionRouter.post("/", requireAuth, requirePermission("tx:create"), createTransaction);
transactionRouter.get("/", requireAuth, requirePermission("tx:read"), getTransactions);
transactionRouter.get("/:id", requireAuth, requirePermission("tx:read"), getTransaction);
transactionRouter.patch("/:id", requireAuth, requirePermission("tx:update"), updateTransaction);
transactionRouter.delete("/:id", requireAuth, requirePermission("tx:delete"), deleteTransaction);

export { transactionRouter };