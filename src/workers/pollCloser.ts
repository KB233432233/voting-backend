import cron from 'node-cron';
import prisma from '../config/db.ts';
import { Prisma } from '@prisma/client';
import { ethers } from "ethers";

const RPC_URL = process.env.RPC_URL!;
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY!;
const VOTING_CONTRACT_ADDRESS = process.env.VOTING_CONTRACT_ADDRESS!;

const FINALIZE_ABI = [
      {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "pollId",
          "type": "uint256"
        }
      ],
      "name": "finalizePoll",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    }
]

const provider = new ethers.JsonRpcProvider(RPC_URL);
const relayerWallet = new ethers.Wallet(RELAYER_PRIVATE_KEY, provider);
const votingContract = new ethers.Contract(VOTING_CONTRACT_ADDRESS, FINALIZE_ABI, relayerWallet);

const CRON_SCHEDULE = process.env.POLL_CLOSER_CRON || '*/5 * * * *';
let pollCloserTask: ReturnType<typeof cron.schedule> | null = null;

export function startPollCloser(): void {
  console.info(`[pollCloser] Starting cron job with schedule: ${CRON_SCHEDULE}`);

  pollCloserTask = cron.schedule(CRON_SCHEDULE, async () => {
    try {
      console.info('[pollCloser] Checking for polls to close...');
      const now = new Date();

      // 1. Activate drafts whose start time has arrived (created as upcoming
      //    polls, or left in 'draft' before the lifecycle fix).
      const toActivate = await prisma.poll.findMany({
        where: { status: 'draft', startDate: { lte: now } },
        select: { id: true, name: true },
      });

      if (toActivate.length > 0) {
        console.info(`[pollCloser] Activating ${toActivate.length} poll(s)`);
        for (const poll of toActivate) {
          await prisma.poll.update({
            where: { id: poll.id },
            data: { status: 'active' },
          });
        }
      }

      // 2. Close polls whose voting window has ended.
      const pollsToClose = await prisma.poll.findMany({
        where: { status: 'active', endDate: { lte: now } },
        select: { id: true, name: true },
      });

      if (pollsToClose.length === 0) return;

      console.info(`[pollCloser] Closing ${pollsToClose.length} poll(s)`);

      for (const poll of pollsToClose) {
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          await tx.poll.update({
            where: { id: poll.id },
            data: { status: 'closed' },
          });
        });
        console.info(`[pollCloser] Poll "${poll.name}" closed`);
      }

      const pollsToFinalize = await prisma.poll.findMany({
        where: { status: 'closed' },
        select: { id: true, name: true, chainPollId: true },
      });

      for (const poll of pollsToFinalize) {
        const chainPollId = poll.chainPollId;
        const chainId = Number(chainPollId);

        if (!chainPollId || !Number.isFinite(chainId) || chainId < 0) {
          console.info(`[pollCloser] Poll "${poll.name}" has no valid chainPollId; skipping finalization`);
          continue;
        }

        if (!votingContract || typeof votingContract.finalizePoll !== 'function') {
          console.warn('[pollCloser] Voting contract finalizePoll is unavailable');
          continue;
        }

        await votingContract.finalizePoll(chainId);
        await prisma.poll.update({
          where: { id: poll.id },
          data: { status: 'tallied' },
        });
        console.info(`[pollCloser] Poll "${poll.name}" finalized on-chain with chainPollId: ${chainId}`);
      }

    } catch (error) {
      console.error('[pollCloser] Error during poll closing:', error);
    }
  });
}

export function stopPollCloser(): void {
  console.info('[pollCloser] Stopping cron job...');
  if (pollCloserTask) {
    pollCloserTask.stop(); // ✅ Correct method
    pollCloserTask = null;
  }
}
