"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_VOTING_CONTRACT_ADDRESS = exports.VOTING_CONTRACT_ABI = void 0;
exports.getVotingContractAddress = getVotingContractAddress;
exports.buildVoteTxData = buildVoteTxData;
const ethers_1 = require("ethers");
/**
 * Minimal ABI for the IRVVoting contract's vote submission.
 * Matches _con.txt: vote(uint256 pollId, uint256[] ranking)
 */
exports.VOTING_CONTRACT_ABI = [
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
];
exports.DEFAULT_VOTING_CONTRACT_ADDRESS = "0x782B32957085B8F4f24D0F2f36DF0FF0705dbf68";
function getVotingContractAddress() {
    return (process.env.VOTING_CONTRACT_ADDRESS || exports.DEFAULT_VOTING_CONTRACT_ADDRESS);
}
/**
 * Encode calldata for IRVVoting.vote(pollId, ranking).
 * @param pollId on-chain poll id (BigInt)
 * @param ranking 0-based candidate indices in preference order
 */
function buildVoteTxData(pollId, ranking) {
    const iface = new ethers_1.Interface(exports.VOTING_CONTRACT_ABI);
    return iface.encodeFunctionData("vote", [
        pollId,
        ranking.map((r) => BigInt(r)),
    ]);
}
//# sourceMappingURL=contract.js.map