process.env.SEPOLIA_RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";

async function main() {
  const { ethers } = await import("ethers");
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const ABI = [
    { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
    { type: "function", name: "getUserRole", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ name: "", type: "string" }] },
    { type: "function", name: "isAdmin", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "bool" }] },
  ];
  const addr = "0x782B32957085B8F4f24D0F2f36DF0FF0705dbf68";
  const c = new ethers.Contract(addr, ABI, provider);

  const owner = await c.owner();
  console.log("contract owner:", owner);

  const candidate = "0xa165E8326847190FEBD2Ae2E37FFFE991F4fBB37";
  const role = await c.getUserRole(candidate);
  const admin = await c.isAdmin(candidate);
  console.log(`address ${candidate}: role=${role} isAdmin=${admin}`);

  const balance = await provider.getBalance(candidate);
  console.log(`balance of ${candidate}: ${ethers.formatEther(balance)} ETH`);

  const ownerBal = await provider.getBalance(owner);
  console.log(`balance of owner ${owner}: ${ethers.formatEther(ownerBal)} ETH`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });