import { ethers } from "ethers";

export const CHAIN_POLL_STATE = {
  CREATED: 0,
  ACTIVE: 1,
  ENDED: 2,
  FINALIZED: 3,
} as const;

export type ChainPollState =
  (typeof CHAIN_POLL_STATE)[keyof typeof CHAIN_POLL_STATE];

const GET_POLL_DETAILS_ABI = [
  {
    type: "function",
    name: "getPollDetails",
    stateMutability: "view",
    inputs: [{ name: "pollId", type: "uint256" }],
    outputs: [
      { name: "title", type: "string" },
      { name: "startTime", type: "uint256" },
      { name: "endTime", type: "uint256" },
      { name: "candidateCount", type: "uint256" },
      { name: "maxChoices", type: "uint256" },
      { name: "candidateNames", type: "string[]" },
      { name: "auditors", type: "address[]" },
      { name: "creator", type: "address" },
      { name: "voteType", type: "uint8" },
      { name: "currentState", type: "uint8" },
      { name: "winnerIndex", type: "uint256" },
    ],
  },
];

const CHAIN_STATE_TO_STATUS: Record<number, string> = {
  [CHAIN_POLL_STATE.CREATED]: "draft",
  [CHAIN_POLL_STATE.ACTIVE]: "active",
  [CHAIN_POLL_STATE.ENDED]: "closed",
  [CHAIN_POLL_STATE.FINALIZED]: "tallied",
};

const RPC_URL =
  process.env.SEPOLIA_RPC_URL ||
  process.env.BLOCKCHAIN_RPC_URL ||
  "http://localhost:8545";

const VOTING_CONTRACT_ADDRESS =
  process.env.VOTING_CONTRACT_ADDRESS ||
  process.env.ANCHOR_CONTRACT_ADDRESS ||
  "0x782B32957085B8F4f24D0F2f36DF0FF0705dbf68";

interface PollDetails {
  title: string;
  startTime: bigint;
  endTime: bigint;
  candidateCount: bigint;
  maxChoices: bigint;
  candidateNames: string[];
  auditors: string[];
  creator: string;
  voteType: bigint;
  currentState: bigint;
  winnerIndex: bigint;
}

let contract: ethers.Contract | null = null;

function getContract(): ethers.Contract {
  if (!contract) {
    contract = new ethers.Contract(
      VOTING_CONTRACT_ADDRESS,
      GET_POLL_DETAILS_ABI,
      new ethers.JsonRpcProvider(RPC_URL),
    );
  }
  return contract;
}

async function getPollDetails(pollId: bigint): Promise<PollDetails> {
  const typed = getContract() as unknown as {
    getPollDetails(pollId: bigint): Promise<PollDetails>;
  };
  return typed.getPollDetails(pollId);
}

export async function getPollChainState(
  chainPollId: bigint,
): Promise<ChainPollState | null> {
  try {
    const details = await getPollDetails(chainPollId);
    const currentState = Number(details.currentState);
    if (!(currentState in CHAIN_STATE_TO_STATUS)) return null;
    return currentState as ChainPollState;
  } catch (error) {
    console.warn(
      `[chainVoting] getPollDetails(${chainPollId}) failed:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

export function chainStateToStatus(state: ChainPollState): string {
  return CHAIN_STATE_TO_STATUS[state]!;
}