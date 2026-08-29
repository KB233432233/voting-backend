
import { ethers } from "ethers";
import prisma from "../config/db";

const RPC_URL = process.env.RPC_URL!;
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY!;
const VOTING_CONTRACT_ADDRESS = process.env.VOTING_CONTRACT_ADDRESS!;


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
] as const;

const provider = new ethers.JsonRpcProvider(RPC_URL);
const relayerWallet = new ethers.Wallet(RELAYER_PRIVATE_KEY, provider);
const votingContract = new ethers.Contract(VOTING_CONTRACT_ADDRESS, VOTE_ABI, relayerWallet);

export const relayerWorker = async(data: any) => {
    const { txId, voteId, serial, rankings, gasLimit } = data as {
      txId: string;
      voteId: string;
      serial: string;
      rankings: number[];
      gasLimit?: string;
      pollId: number;
    };
    // Mark as broadcasting
    await prisma.transaction.update({
      where: { id: BigInt(txId) },
      data: { status: 'broadcast' },
    });

    try {
      if (typeof votingContract.vote !== 'function') {
        throw new Error('votingContract.vote is unavailable');
      }

      const tx = await votingContract.vote(
        data.pollId,
        rankings.map(id => BigInt(id)),
        { gasLimit: gasLimit ? BigInt(gasLimit) : undefined }
      );

      console.info(`[relayer] Broadcasted tx ${tx.hash} for vote ${voteId} (nonce: ${tx.nonce})`);

      await prisma.transaction.update({
        where: { id: BigInt(txId) },
        data: { txHash: tx.hash.toLowerCase(), nonce: tx.nonce },
      });

      // Wait for 1 block confirmation
      const receipt = await tx.wait(1);

      if (receipt?.status === 1) {
        await prisma.transaction.update({
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
      } else {
        await prisma.transaction.update({
          where: { id: BigInt(txId) },
          data: { status: 'failed', errorMessage: 'Transaction reverted on-chain' },
        });
        throw new Error('Transaction reverted on-chain');
      }

      return { success: true, txHash: tx.hash };

    } catch (error: any) {
      console.error(`[relayer] Failed vote ${voteId}: ${error.message}`);
      try {
        await prisma.transaction.update({
          where: { id: BigInt(txId) },
          data: { status: 'failed', errorMessage: error.message || 'Unknown relayer error' },
        });
      } catch (dbError) {
        console.error('[relayer] DB update failed:', dbError);
      }
      // BullMQ will retry automatically
      throw error;
    }
  }