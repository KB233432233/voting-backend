"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startPollCloser = startPollCloser;
exports.stopPollCloser = stopPollCloser;
const node_cron_1 = __importDefault(require("node-cron"));
const db_ts_1 = __importDefault(require("../config/db.ts"));
const ethers_1 = require("ethers");
const RPC_URL = process.env.RPC_URL;
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY;
const VOTING_CONTRACT_ADDRESS = process.env.VOTING_CONTRACT_ADDRESS;
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
];
const provider = new ethers_1.ethers.JsonRpcProvider(RPC_URL);
const relayerWallet = new ethers_1.ethers.Wallet(RELAYER_PRIVATE_KEY, provider);
const votingContract = new ethers_1.ethers.Contract(VOTING_CONTRACT_ADDRESS, FINALIZE_ABI, relayerWallet);
const CRON_SCHEDULE = process.env.POLL_CLOSER_CRON || '*/5 * * * *';
let pollCloserTask = null;
function startPollCloser() {
    console.info(`[pollCloser] Starting cron job with schedule: ${CRON_SCHEDULE}`);
    pollCloserTask = node_cron_1.default.schedule(CRON_SCHEDULE, async () => {
        try {
            console.info('[pollCloser] Checking for polls to close...');
            const now = new Date();
            // 1. Activate drafts whose start time has arrived (created as upcoming
            //    polls, or left in 'draft' before the lifecycle fix).
            const toActivate = await db_ts_1.default.poll.findMany({
                where: { status: 'draft', startDate: { lte: now } },
                select: { id: true, name: true },
            });
            if (toActivate.length > 0) {
                console.info(`[pollCloser] Activating ${toActivate.length} poll(s)`);
                for (const poll of toActivate) {
                    await db_ts_1.default.poll.update({
                        where: { id: poll.id },
                        data: { status: 'active' },
                    });
                }
            }
            // 2. Close polls whose voting window has ended.
            const pollsToClose = await db_ts_1.default.poll.findMany({
                where: { status: 'active', endDate: { lte: now } },
                select: { id: true, name: true },
            });
            if (pollsToClose.length === 0)
                return;
            console.info(`[pollCloser] Closing ${pollsToClose.length} poll(s)`);
            for (const poll of pollsToClose) {
                await db_ts_1.default.$transaction(async (tx) => {
                    await tx.poll.update({
                        where: { id: poll.id },
                        data: { status: 'closed' },
                    });
                });
                console.info(`[pollCloser] Poll "${poll.name}" closed`);
            }
            const pollsToFinalize = await db_ts_1.default.poll.findMany({
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
                await db_ts_1.default.poll.update({
                    where: { id: poll.id },
                    data: { status: 'tallied' },
                });
                console.info(`[pollCloser] Poll "${poll.name}" finalized on-chain with chainPollId: ${chainId}`);
            }
        }
        catch (error) {
            console.error('[pollCloser] Error during poll closing:', error);
        }
    });
}
function stopPollCloser() {
    console.info('[pollCloser] Stopping cron job...');
    if (pollCloserTask) {
        pollCloserTask.stop(); // ✅ Correct method
        pollCloserTask = null;
    }
}
//# sourceMappingURL=pollCloser.js.map