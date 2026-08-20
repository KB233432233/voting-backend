// src/utils/snowflake.ts
import { SnowflakeIdGenerator } from "@codylabs/snowflake-id-generator";

const workerId = (() => {
  const val = process.env.SNOWFLAKE_WORKER_ID;
  if (!val) return 1n;
  const parsed = BigInt(val);
  if (parsed < 0n || parsed > 31n) return 1n; // fallback
  return parsed;
})();

const datacenterId = (() => {
  const val = process.env.SNOWFLAKE_DATACENTER_ID;
  if (!val) return 1n;
  const parsed = BigInt(val);
  if (parsed < 0n || parsed > 31n) return 1n; // fallback
  return parsed;
})();

// Validate ranges (0-31 for 5 bits)
if (workerId < 0n || workerId > 31n) {
  throw new Error(
    `SNOWFLAKE_WORKER_ID must be between 0 and 31, got ${workerId}`,
  );
}
if (datacenterId < 0n || datacenterId > 31n) {
  throw new Error(
    `SNOWFLAKE_DATACENTER_ID must be between 0 and 31, got ${datacenterId}`,
  );
}

const generator = new SnowflakeIdGenerator(workerId, datacenterId, {
  epoch: 1609459200000n, // 2021-01-01T00:00:00Z
  workerIdBits: 5n,
  datacenterIdBits: 5n,
  sequenceBits: 12n,
  sequence: 0n,
});

export function generateSnowflakeId(): string {
  try {
    return generator.nextId().toString();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message?.includes("clock moved backwards")
    ) {
      // Wait or log critical error
      console.error("System clock moved backwards!");
    }
    throw error;
  }
}

export function generateSnowflakeIdBigInt(): bigint {
  try {
    return generator.nextId();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message?.includes("clock moved backwards")
    ) {
      // Wait or log critical error
      console.error("System clock moved backwards!");
    }
    throw error;
  }
}
export function extractTimestamp(id: bigint): Date {
  const timestamp = (id >> 22n) + 1609459200000n; // Shift right 22 bits (5+5+12)
  return new Date(Number(timestamp));
}
