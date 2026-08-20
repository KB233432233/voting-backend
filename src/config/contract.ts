import { Interface } from "ethers";

/**
 * Minimal ABI for the IRVVoting contract's vote submission.
 * Matches _con.txt: vote(uint256 pollId, uint256[] ranking)
 */
export const VOTING_CONTRACT_ABI = [
  {
    type: "function",
    name: "vote",
    stateMutability: "nonpayable",
    inputs: [
      { name: "pollId", type: "uint256" },
      { name: "ranking", type: "uint256[]" },
    ],
    outputs: [],
  },
] as const;

export const DEFAULT_VOTING_CONTRACT_ADDRESS =
  "0x782B32957085B8F4f24D0F2f36DF0FF0705dbf68";

export function getVotingContractAddress(): string {
  return (
    process.env.VOTING_CONTRACT_ADDRESS || DEFAULT_VOTING_CONTRACT_ADDRESS
  );
}

/**
 * Encode calldata for IRVVoting.vote(pollId, ranking).
 * @param pollId on-chain poll id (BigInt)
 * @param ranking 0-based candidate indices in preference order
 */
export function buildVoteTxData(pollId: bigint, ranking: number[]): string {
  const iface = new Interface(VOTING_CONTRACT_ABI);
  return iface.encodeFunctionData("vote", [
    pollId,
    ranking.map((r) => BigInt(r)),
  ]);
}