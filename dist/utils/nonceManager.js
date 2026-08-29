"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNextNonce = getNextNonce;
exports.resetNonceIfBehind = resetNonceIfBehind;
const ioredis_1 = __importDefault(require("ioredis"));
const relayer_ts_1 = require("../config/relayer.ts");
const redis = new ioredis_1.default(process.env.REDIS_URL || "redis://localhost:6379");
const NONCE_KEY = "relayer:nonce";
async function getNextNonce() {
    // Get current on-chain nonce
    const chainNonce = await (0, relayer_ts_1.getRelayerWallet)().getNonce("pending");
    // Get our tracked nonce (starts at chainNonce)
    let tracked = await redis.get(NONCE_KEY);
    if (!tracked) {
        tracked = chainNonce.toString();
    }
    let nonce = parseInt(tracked, 10);
    // Increment atomically
    await redis.set(NONCE_KEY, (nonce + 1).toString());
    return nonce;
}
async function resetNonceIfBehind() {
    const chainNonce = await (0, relayer_ts_1.getRelayerWallet)().getNonce("pending");
    const tracked = parseInt(await redis.get(NONCE_KEY) || "0", 10);
    if (tracked < chainNonce) {
        await redis.set(NONCE_KEY, chainNonce.toString());
    }
}
//# sourceMappingURL=nonceManager.js.map