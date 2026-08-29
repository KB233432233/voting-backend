import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../types/auth";
import Redis from "ioredis";
import crypto from "crypto";
import { VALIDATE_NONCE_SCRIPT } from "../utils/redis-scripts";
import { verifyAccessToken } from "../utils/jwt";
import type { TokenExpiredError, JsonWebTokenError } from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "15m";

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}

interface NonceResponse {
  nonce: string;
  expiresAt: number;
}

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
/**
 * Generate a cryptographically secure nonce and cache it
 */
export async function createNonce(address: string): Promise<NonceResponse> {
  const nonce = crypto.randomBytes(20).toString("hex");
  const ttlInSeconds = 300;
  const expiresAt = Date.now() + ttlInSeconds * 1000;

  // ✅ Store the address as a plain string (not JSON)
  await redis.set(
    `nonce:${nonce}`,
    address.toLowerCase(),  // <-- just the address
    "EX",
    ttlInSeconds,
  );

  return { nonce, expiresAt };
}

/**
 * Validate a nonce against an address using atomic Redis Lua script
 *
 * This function ensures that:
 * 1. The nonce exists in Redis
 * 2. The provided address matches the address stored with the nonce
 * 3. The nonce is consumed (deleted) only if validation succeeds
 *
 * Atomicity: The entire validation + deletion happens in one Redis command,
 * preventing race conditions where two requests could use the same nonce.
 *
 * Security: Fail-closed strategy - returns false on any error to prevent
 * unauthorized access when the system is in an uncertain state.
 *
 * @param nonce - The nonce string to validate (e.g., "abc123")
 * @param address - The user's address to validate against (e.g., "0x123...")
 * @returns Promise<boolean> - true if nonce is valid and consumed, false otherwise
 *
 * @example
 * ```typescript
 * const isValid = await validateNonce("abc123", "0x1234...");
 * if (isValid) {
 *   console.log("Nonce validated successfully!");
 * } else {
 *   console.log("Invalid nonce or address mismatch");
 * }
 * ```
 */
export async function validateNonce(
  nonce: string,
  address: string,
): Promise<boolean> {
  // Try to execute the atomic validation script
  try {
    // Execute the Lua script in Redis
    // Parameters:
    // - VALIDATE_NONCE_SCRIPT: The Lua script to run
    // - 1: Number of keys passed to the script
    // - `nonce:${nonce}`: KEYS[1] in the Lua script (the Redis key for this nonce)
    // - address.toLowerCase(): ARGV[1] in the Lua script (the address to validate)
    const result = await redis.eval(
      VALIDATE_NONCE_SCRIPT,
      1, // number of keys
      `nonce:${nonce}`, // KEYS[1] - the Redis key for this nonce
      address.toLowerCase(), // ARGV[1] - the address to validate (normalized to lowercase)
    );

    // Lua script returns 1 if validation succeeded (nonce deleted), 0 otherwise
    // Convert to boolean: result === 1 means true (valid nonce)
    return result === 1;
  } catch (error) {
    // Handle any errors (Redis connection issues, script errors, etc.)
    console.error("Nonce validation error:", error);

    // Fail-closed strategy: Return false on any error
    // This prevents unauthorized access when the system is in an uncertain state
    // Security best practice: deny access when we can't verify it
    return false;
  }
}
/**
 * Middleware to extract session user from request
 */
/**
 * Authentication middleware for Express routes
 *
 * This middleware validates JWT access tokens from cookies and attaches
 * the decoded user payload to the request object.
 *
 * Security features:
 * 1. Validates JWT exists in cookies
 * 2. Checks JWT_SECRET configuration before verification
 * 3. Uses verifyAccessToken() which enforces HS256 algorithm (prevents algorithm confusion attacks)
 * 4. Runtime validation of required claims (userId, walletAddress, role)
 * 5. Fail-closed error handling - returns 401 on any error
 *
 * Error handling:
 * - Missing token: Returns 401 "Missing access token"
 * - Token expired: Returns 401 "Session expired, please re-authenticate"
 * - Invalid token: Returns 401 "Invalid authentication credentials"
 * - Server error: Returns 500 "Server configuration error"
 * - Unknown error: Returns 401 "Authentication failed" + logs error
 *
 * @param req - Express request object (with cookies and user property)
 * @param res - Express response object
 * @param next - Express next function (to continue to next middleware)
 *
 * @example
 * ```typescript
 * // Apply to route
 * app.get('/api/user/profile', requireAuth, (req, res) => {
 *   // req.user is now available with userId, walletAddress, role
 *   res.json({ user: req.user });
 * });
 * ```
 */
export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  // Step 1: Extract access token from cookies
  // Token is stored in cookie named "accessToken"
  // Use optional chaining (?.) to safely access nested property
  const token = req.cookies?.accessToken;

  // Step 2: Check if token exists
  // If no token, reject immediately with 401 Unauthorized
  // This is a client error (missing required credential)
  if (!token) {
    res.status(401).json({ error: "Missing access token" });
    return;
  }

  // Step 3: Verify JWT token and attach user to request
  try {
    // Step 3a: Validate server configuration
    // JWT_SECRET must be configured before verifying tokens
    // This prevents verification with undefined/empty secret (security vulnerability)
    if (!JWT_SECRET) {
      // Server configuration error - cannot verify tokens without secret
      // Return 500 to indicate server-side issue (not client error)
      res.status(500).json({ error: "Server configuration error" });
      return;
    }

    // Step 3b: Verify JWT token using secure utility function
    // verifyAccessToken() provides:
    // - Algorithm enforcement: Only allows HS256 (prevents algorithm confusion attacks)
    // - Runtime validation: Checks userId, walletAddress, and role are present and valid
    // - Type safety: Returns properly typed JWTPayload
    const payload = verifyAccessToken(token, JWT_SECRET);

    // Step 3c: Attach decoded user payload to request object
    // This makes user data available to downstream handlers
    // req.user now contains: userId, walletAddress, role (as UserRole)
    req.user = payload;

    // Step 3d: Continue to next middleware/handler
    // Authentication successful - proceed with request
    next();
  } catch (error) {
    // Step 4: Handle JWT verification errors
    // Different error types get different responses for better UX

    // Case 1: Token has expired
    // TokenExpiredError indicates the JWT's expiration claim (exp) is in the past
    // User needs to re-authenticate to get a new token
    if (error instanceof Error && error.name === 'TokenExpiredError') {
      res
        .status(401)
        .json({ error: "Session expired, please re-authenticate" });
      return;
    }

    // Case 2: Invalid JWT token
    // JsonWebTokenError indicates:
    // - Malformed token (not valid JWT format)
    // - Invalid signature (tampered or wrong secret)
    // - Wrong algorithm (algorithm confusion attempt)
    if (error instanceof Error && error.name === 'JsonWebTokenError') {
      res.status(401).json({ error: "Invalid authentication credentials" });
      return;
    }

    // Case 3: Unknown error
    // Log the error for debugging (server-side issue)
    // Return generic 401 to avoid exposing internal details to client
    // Fail-closed strategy: deny access when we can't verify it
    console.error("Auth middleware error:", error);
    res.status(401).json({ error: "Authentication failed" });
  }
}
