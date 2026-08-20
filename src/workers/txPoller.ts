import { ethers, TransactionReceipt } from "ethers";
import prisma from "../config/db.ts";
import { Prisma } from "@prisma/client";

const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || "15000", 10);
const MAX_RETRIES = 5;
const RPC_URL = process.env.SEPOLIA_RPC_URL || "http://localhost:8545";

const provider = new ethers.JsonRpcProvider(RPC_URL);

let pollIntervalId: NodeJS.Timeout | null = null;
let isShuttingDown = false;

/**
 * Process a single transaction by checking its receipt on-chain.
 */
async function processTransaction(txHash: string): Promise<void> {
  try {
    const receipt: TransactionReceipt | null =
      await provider.getTransactionReceipt(txHash);

    await prisma.$transaction(async (txPrisma: Prisma.TransactionClient) => {
      const dbTx = await txPrisma.transaction.findUnique({
        where: { txHash },
      });

      if (!dbTx) {
        console.info(
          `[txPoller] Transaction ${txHash} not found in DB, skipping.`,
        );
        return;
      }

      // If already confirmed or failed, skip processing
      if (
        dbTx.status === "confirmed" ||
        dbTx.status === "failed" ||
        dbTx.status === "dropped"
      ) {
        return;
      }

      if (receipt) {
        // Transaction found on-chain
        if (receipt.blockNumber != null) {
          const currentBlock = await provider.getBlockNumber();
          const confirmations = currentBlock - receipt.blockNumber + 1;
          const isSuccess = receipt.status === 1;

          if (isSuccess) {
            await txPrisma.transaction.update({
              where: { txHash },
              data: {
                status: "confirmed",
                blockNumber: BigInt(receipt.blockNumber),
                confirmations,
                confirmedAt: new Date(),
                gasUsed: BigInt(receipt.gasUsed),
                gasPrice: receipt.gasPrice ? BigInt(receipt.gasPrice) : null,
              },
            });
            console.info(
              `[txPoller] Transaction ${txHash} confirmed in block ${receipt.blockNumber} with ${confirmations} confirmations.`,
            );
          } else {
            await txPrisma.transaction.update({
              where: { txHash },
              data: {
                status: "failed",
                errorMessage: "Transaction reverted on-chain",
                blockNumber: BigInt(receipt.blockNumber),
                gasUsed: BigInt(receipt.gasUsed),
                gasPrice: receipt.gasPrice ? BigInt(receipt.gasPrice) : null,
              },
            });
            console.error(
              `[txPoller] Transaction ${txHash} failed (reverted).`,
            );
          }
        }
      } else {
        // Receipt not found - transaction may still be pending or dropped
        const newRetries = dbTx.retries + 1;

        if (newRetries >= MAX_RETRIES) {
          await txPrisma.transaction.update({
            where: { txHash },
            data: {
              status: "dropped",
              retries: newRetries,
            },
          });
          console.error(
            `[txPoller] Transaction ${txHash} dropped after ${newRetries} retries.`,
          );
        } else {
          await txPrisma.transaction.update({
            where: { txHash },
            data: {
              status: "broadcast",
              retries: newRetries,
            },
          });
          console.info(
            `[txPoller] Transaction ${txHash} not found, retry ${newRetries}/${MAX_RETRIES}.`,
          );
        }
      }
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(
      `[txPoller] Error processing transaction ${txHash}: ${errorMessage}`,
    );

    try {
      await prisma.$transaction(async (txPrisma: Prisma.TransactionClient) => {
        const dbTx = await txPrisma.transaction.findUnique({
          where: { txHash },
        });

        if (
          dbTx &&
          dbTx.status !== "confirmed" &&
          dbTx.status !== "failed" &&
          dbTx.status !== "dropped"
        ) {
          const newRetries = dbTx.retries + 1;
          if (newRetries >= MAX_RETRIES) {
            await txPrisma.transaction.update({
              where: { txHash },
              data: {
                status: "dropped",
                retries: newRetries,
                errorMessage,
              },
            });
          } else {
            await txPrisma.transaction.update({
              where: { txHash },
              data: {
                retries: newRetries,
                errorMessage,
              },
            });
          }
        }
      });
    } catch (updateError) {
      const updateErrorMsg =
        updateError instanceof Error ? updateError.message : "Unknown error";
      console.error(
        `[txPoller] Failed to update transaction ${txHash} after error: ${updateErrorMsg}`,
      );
    }
  }
}

/**
 * Main polling loop - fetches pending/broadcast transactions and processes them.
 */
async function pollTransactions(): Promise<void> {
  if (isShuttingDown) {
    return;
  }

  try {
    const pendingTxs = await prisma.transaction.findMany({
      where: {
        status: {
          in: ["pending", "broadcast"],
        },
        retries: {
          lt: MAX_RETRIES,
        },
      },
      select: {
        txHash: true,
      },
    });

    console.info(
      `[txPoller] Processing ${pendingTxs.length} pending transactions.`,
    );

    for (const tx of pendingTxs) {
      if (isShuttingDown) {
        break;
      }
      await processTransaction(tx.txHash);
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[txPoller] Error during polling: ${errorMessage}`);
  }
}

/**
 * Start the transaction poller worker.
 */
export function startTxPoller(): void {
  if (pollIntervalId) {
    console.warn("[txPoller] Poller already running.");
    return;
  }

  console.info(
    `[txPoller] Starting poller with interval ${POLL_INTERVAL_MS}ms.`,
  );

  // Run immediately on start
  void pollTransactions();

  pollIntervalId = setInterval(pollTransactions, POLL_INTERVAL_MS);
}

/**
 * Stop the transaction poller worker gracefully.
 */
export async function stopTxPoller(): Promise<void> {
  isShuttingDown = true;
  console.info("[txPoller] Shutting down...");

  if (pollIntervalId) {
    clearInterval(pollIntervalId);
    pollIntervalId = null;
  }

  await prisma.$disconnect();
  console.info("[txPoller] Shutdown complete.");
}

// Graceful shutdown handlers
function setupGracefulShutdown(): void {
  const shutdownHandler = async (signal: string): Promise<void> => {
    console.info(
      `[txPoller] Received ${signal}, initiating graceful shutdown...`,
    );
    await stopTxPoller();
    process.exit(0);
  };

  process.once("SIGINT", () => void shutdownHandler("SIGINT"));
  process.once("SIGTERM", () => void shutdownHandler("SIGTERM"));
}

// Auto-start if this file is run directly
if (require.main === module) {
  setupGracefulShutdown();
  startTxPoller();
}
