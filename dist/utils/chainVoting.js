"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHAIN_POLL_STATE = void 0;
exports.getPollChainState = getPollChainState;
exports.chainStateToStatus = chainStateToStatus;
const ethers_1 = require("ethers");
exports.CHAIN_POLL_STATE = {
    CREATED: 0,
    ACTIVE: 1,
    ENDED: 2,
    FINALIZED: 3,
};
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
const CHAIN_STATE_TO_STATUS = {
    [exports.CHAIN_POLL_STATE.CREATED]: "draft",
    [exports.CHAIN_POLL_STATE.ACTIVE]: "active",
    [exports.CHAIN_POLL_STATE.ENDED]: "closed",
    [exports.CHAIN_POLL_STATE.FINALIZED]: "tallied",
};
const RPC_URL = process.env.SEPOLIA_RPC_URL ||
    process.env.BLOCKCHAIN_RPC_URL ||
    "http://localhost:8545";
const VOTING_CONTRACT_ADDRESS = process.env.VOTING_CONTRACT_ADDRESS ||
    process.env.ANCHOR_CONTRACT_ADDRESS ||
    "0x782B32957085B8F4f24D0F2f36DF0FF0705dbf68";
let contract = null;
function getContract() {
    if (!contract) {
        contract = new ethers_1.ethers.Contract(VOTING_CONTRACT_ADDRESS, GET_POLL_DETAILS_ABI, new ethers_1.ethers.JsonRpcProvider(RPC_URL));
    }
    return contract;
}
async function getPollDetails(pollId) {
    const typed = getContract();
    return typed.getPollDetails(pollId);
}
async function getPollChainState(chainPollId) {
    try {
        const details = await getPollDetails(chainPollId);
        const currentState = Number(details.currentState);
        if (!(currentState in CHAIN_STATE_TO_STATUS))
            return null;
        return currentState;
    }
    catch (error) {
        console.warn(`[chainVoting] getPollDetails(${chainPollId}) failed:`, error instanceof Error ? error.message : error);
        return null;
    }
}
function chainStateToStatus(state) {
    return CHAIN_STATE_TO_STATUS[state];
}
//# sourceMappingURL=chainVoting.js.map