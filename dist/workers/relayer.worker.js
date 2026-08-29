"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.relayerWorker = void 0;
const ethers_1 = require("ethers");
const db_ts_1 = __importDefault(require("../config/db.ts"));
const RPC_URL = process.env.RPC_URL;
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY;
const VOTING_CONTRACT_ADDRESS = process.env.VOTING_CONTRACT_ADDRESS;
const VOTE_ABI = [
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "pollId",
                "type": "uint256"
            },
            {
                "internalType": "uint256[]",
                "name": "ranking",
                "type": "uint256[]"
            }
        ],
        "name": "vote",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
];
const provider = new ethers_1.ethers.JsonRpcProvider(RPC_URL);
const relayerWallet = new ethers_1.ethers.Wallet(RELAYER_PRIVATE_KEY, provider);
const votingContract = new ethers_1.ethers.Contract(VOTING_CONTRACT_ADDRESS, VOTE_ABI, relayerWallet);
const relayerWorker = async (data) => {
    const { txId, voteId, serial, rankings, gasLimit } = data;
    // Mark as broadcasting
    await db_ts_1.default.transaction.update({
        where: { id: BigInt(txId) },
        data: { status: 'broadcast' },
    });
    try {
        if (typeof votingContract.vote !== 'function') {
            throw new Error('votingContract.vote is unavailable');
        }
        const tx = await votingContract.vote(data.pollId, rankings.map(id => BigInt(id)), { gasLimit: gasLimit ? BigInt(gasLimit) : undefined });
        console.info(`[relayer] Broadcasted tx ${tx.hash} for vote ${voteId} (nonce: ${tx.nonce})`);
        await db_ts_1.default.transaction.update({
            where: { id: BigInt(txId) },
            data: { txHash: tx.hash.toLowerCase(), nonce: tx.nonce },
        });
        // Wait for 1 block confirmation
        const receipt = await tx.wait(1);
        if (receipt?.status === 1) {
            await db_ts_1.default.transaction.update({
                where: { id: BigInt(txId) },
                data: {
                    status: 'confirmed',
                    blockNumber: BigInt(receipt.blockNumber),
                    confirmations: 1,
                    confirmedAt: new Date(),
                    gasUsed: receipt.gasUsed.toString(),
                },
            });
            console.info(`[relayer] Vote ${voteId} confirmed in block ${receipt.blockNumber}`);
        }
        else {
            await db_ts_1.default.transaction.update({
                where: { id: BigInt(txId) },
                data: { status: 'failed', errorMessage: 'Transaction reverted on-chain' },
            });
            throw new Error('Transaction reverted on-chain');
        }
        return { success: true, txHash: tx.hash };
    }
    catch (error) {
        console.error(`[relayer] Failed vote ${voteId}: ${error.message}`);
        try {
            await db_ts_1.default.transaction.update({
                where: { id: BigInt(txId) },
                data: { status: 'failed', errorMessage: error.message || 'Unknown relayer error' },
            });
        }
        catch (dbError) {
            console.error('[relayer] DB update failed:', dbError);
        }
        // BullMQ will retry automatically
        throw error;
    }
};
exports.relayerWorker = relayerWorker;
//# sourceMappingURL=relayer.worker.js.map