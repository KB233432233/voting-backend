"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProvider = getProvider;
exports.getRelayerWallet = getRelayerWallet;
const ethers_1 = require("ethers");
const RPC_URL = process.env.SEPOLIA_RPC_URL ||
    process.env.BLOCKCHAIN_RPC_URL ||
    "https://ethereum-sepolia-rpc.publicnode.com";
let _provider = null;
let _wallet = null;
function getProvider() {
    if (!_provider) {
        _provider = new ethers_1.JsonRpcProvider(RPC_URL);
    }
    return _provider;
}
function getRelayerWallet() {
    if (_wallet)
        return _wallet;
    const key = process.env.RELAYER_PRIVATE_KEY;
    if (!key) {
        throw new Error("RELAYER_PRIVATE_KEY is required for the relayer worker");
    }
    const normalized = key.startsWith("0x") ? key.slice(2) : key;
    if (!/^[0-9a-fA-F]{64}$/.test(normalized)) {
        throw new Error("RELAYER_PRIVATE_KEY is not a valid private key (expected 64 hex chars). " +
            "Note: the current .env value looks like a public address — paste the owner/admin wallet's actual private key.");
    }
    _wallet = new ethers_1.Wallet(key, getProvider());
    // Log only the address, never the key
    console.log(`🔑 Relayer wallet initialized: ${_wallet.address}`);
    return _wallet;
}
//# sourceMappingURL=relayer.js.map