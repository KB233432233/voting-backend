process.env.SEPOLIA_RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";

async function main() {
  const { buildVoteTxData, getVotingContractAddress } = await import("./src/config/contract.ts");
  const data = buildVoteTxData(5n, [2, 0, 1]);
  console.log("vote calldata:", data);
  console.log("to:", getVotingContractAddress());
  console.log("length ok:", data.length === 138 || data.length === 202); // 4 bytes selector + 32 pollId + 32 offset + 32 len + 32*3

  const { ethers } = await import("ethers");
  const iface = new ethers.Interface([
    { type: "function", name: "vote", stateMutability: "nonpayable", inputs: [{ name: "pollId", type: "uint256" }, { name: "ranking", type: "uint256[]" }], outputs: [] },
  ]);
  const decoded = iface.decodeFunctionData("vote", data);
  console.log("decoded pollId:", decoded[0].toString(), "ranking:", decoded[1].map((x: any) => x.toString()));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });