
import Redis from "ioredis";
import { getRelayerWallet } from "../config/relayer.ts";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
const NONCE_KEY = "relayer:nonce";

export async function getNextNonce(): Promise<number> {
  // Get current on-chain nonce
  const chainNonce = await getRelayerWallet().getNonce("pending");
  
  // Get our tracked nonce (starts at chainNonce)
  let tracked = await redis.get(NONCE_KEY);
  if (!tracked) {
    tracked = chainNonce.toString();
  }
  
  let nonce = parseInt(tracked as string, 10);
  
  // Increment atomically
  await redis.set(NONCE_KEY, (nonce + 1).toString());
  
  return nonce;
}

export async function resetNonceIfBehind(): Promise<void> {
  const chainNonce = await getRelayerWallet().getNonce("pending");
  const tracked = parseInt(await redis.get(NONCE_KEY) || "0", 10);
  if (tracked < chainNonce) {
    await redis.set(NONCE_KEY, chainNonce.toString());
  }
}
