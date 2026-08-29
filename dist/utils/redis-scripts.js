"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VALIDATE_NONCE_SCRIPT = void 0;
/**
 * Lua script for atomic nonce validation in Redis
 *
 * This script performs the following operations in a single atomic step:
 * 1. GET the nonce value from Redis
 * 2. Validate that the provided address matches the stored address
 * 3. DEL the nonce (consuming it) if validation passes
 *
 * Atomicity guarantee: No other request can read/write this nonce between steps,
 * preventing race conditions where the same nonce could be used twice.
 *
 * Script logic:
 * - KEYS[1]: The Redis key for the nonce (e.g., "nonce:abc123")
 * - ARGV[1]: The address to validate (normalized to lowercase)
 *
 * Returns:
 * - 0: Validation failed (nonce doesn't exist OR address doesn't match)
 * - 1: Validation succeeded (nonce deleted successfully)
 */
exports.VALIDATE_NONCE_SCRIPT = `
  -- KEYS[1] = nonce key (e.g., "nonce:abc123")
  -- ARGV[1] = address to validate (lowercase)
  local key = KEYS[1]
  local expectedAddress = string.lower(ARGV[1])
  local stored = redis.call('GET', key)

  if not stored then
      return 0   -- nonce not found or expired
  end

  if stored ~= expectedAddress then
      return 0   -- address mismatch
  end

  -- Address matches: delete the nonce and return success
  return redis.call('DEL', key)
`;
//# sourceMappingURL=redis-scripts.js.map