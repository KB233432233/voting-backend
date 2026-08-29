"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminLimiter = exports.voteLimiter = exports.globalLimiter = exports.blindSignLimiter = exports.tokenRequestLimiter = exports.authLimiter = void 0;
const express_rate_limit_1 = __importStar(require("express-rate-limit"));
const rate_limit_redis_1 = require("rate-limit-redis");
const ioredis_1 = __importDefault(require("ioredis"));
/**
 * Redis Connection Setup
 * Uses environment variable REDIS_URL or falls back to localhost
 */
const redis = new ioredis_1.default(process.env.REDIS_URL || "redis://localhost:6379");
// Redis event handlers for monitoring connection status
redis.on('error', (err) => {
    console.error('❌ Redis connection error in rate limiter:', err);
});
redis.on('connect', () => {
    console.log('✅ Redis connected for rate limiting');
});
/**
 * Redis Store Configuration
 * This stores rate limit data in Redis instead of memory,
 * allowing rate limits to work across multiple server instances (horizontal scaling)
 *
 * Note: sendCommand expects (command: string, ...args: string[]) format
 * The spread operator collects remaining arguments after the command
 */
const createRedisStore = (prefix = 'rl:') => {
    return new rate_limit_redis_1.RedisStore({
        sendCommand: async (command, ...args) => {
            try {
                return await redis.call(command, ...args);
            }
            catch (error) {
                console.error(`Redis command failed: ${command}`, error);
                throw error;
            }
        },
        prefix, // ← Unique prefix for each limiter
    });
};
/**
 * Helper function to extract unique identifier from request
 * Prioritizes userId (if authenticated) over IP address
 * Falls back to 'unknown' if neither is available
 */
const getRequestKey = (req) => {
    // If user is authenticated, use their userId as the key
    if (req.user?.userId) {
        return `user:${req.user.userId}`;
    }
    // Otherwise, use normalized IP
    return (0, express_rate_limit_1.ipKeyGenerator)(req.ip || req.connection?.remoteAddress || 'unknown');
};
const keyGenerator = (req) => (0, express_rate_limit_1.ipKeyGenerator)(req.ip || req.connection?.remoteAddress || 'unknown');
/**
 * 1. AUTHENTICATION RATE LIMITER
 * Applies to: Login, registration, password reset endpoints
 *
 * Why IP-based? Users aren't authenticated yet, so we can't use userId
 * Why 20 attempts? Allows legitimate users to retry typos while preventing brute force
 * Why 15 minutes? Balances security with user experience
 */
exports.authLimiter = (0, express_rate_limit_1.default)({
    // Store in Redis for distributed rate limiting
    store: createRedisStore('rl:auth:'),
    // Time window: 15 minutes
    // Each IP gets 20 attempts within this window
    windowMs: 15 * 60 * 1000,
    max: 20,
    // Response sent when rate limit is exceeded
    message: {
        error: "Too many authentication attempts. Please try again later."
    },
    // Use IP address as key (user isn't logged in yet)
    keyGenerator,
    // Return standard rate limit headers (RateLimit-*)
    standardHeaders: true,
    // Disable legacy X-RateLimit-* headers
    legacyHeaders: false,
    // Don't count successful authentications against the limit
    // This prevents legitimate users from being locked out
    skipSuccessfulRequests: true,
});
/**
 * 2. TOKEN REQUEST RATE LIMITER
 * Applies to: Requesting new API tokens, refresh tokens
 *
 * Why user-specific? Prevents one user from exhausting the system
 * Why only 3 requests? Token requests are expensive operations
 * Why 15 minute window? Provides quick recovery if user makes a mistake
 */
exports.tokenRequestLimiter = (0, express_rate_limit_1.default)({
    store: createRedisStore('rl:token:'),
    // Time window: 15 minutes
    windowMs: 15 * 60 * 1000,
    // Maximum: 3 token requests per user/IP per hour
    max: 3,
    message: {
        error: "Too many token requests. Please wait 15 minutes before trying again."
    },
    // Custom key generator: use userId if authenticated, fallback to IP
    keyGenerator: getRequestKey,
    standardHeaders: true,
    legacyHeaders: false,
    // Optional: Don't count failed token requests (e.g., invalid refresh token)
    // skipFailedRequests: false, // Keep this false to prevent abuse
    // Don't count failed attempts (409 already-issued, 403 not eligible, etc.)
    // against the limit — only successful token grants consume the budget.
    skipSuccessfulRequests: true,
});
/**
 * 3. BLIND SIGN RATE LIMITER
 * Applies to: Cryptographic blind signing endpoints
 *
 * Why strict limit? Blind signing is computationally expensive (asymmetric crypto)
 * Why user-specific? Prevents DoS attacks by a single user
 * Why 1 hour window? Gives system time to recover between bursts
 *
 * Security note: Blind signatures are resource-intensive operations.
 * An attacker could request many signatures to exhaust CPU/memory.
 * This limiter prevents that attack vector.
 */
exports.blindSignLimiter = (0, express_rate_limit_1.default)({
    store: createRedisStore('rl:blindsign:'),
    // Time window: 1 hour
    windowMs: 60 * 60 * 1000,
    // Maximum: 5 blind sign requests per user/hour
    // Adjust based on:
    // - Your server's crypto capacity
    // - Expected legitimate usage patterns
    // - Cost of each signature (2048-bit RSA is slower than 2048-bit ECC)
    max: 5,
    message: {
        error: "Too many blind sign requests. Please wait an hour before trying again."
    },
    // Use user-specific keys to prevent one user from affecting others
    keyGenerator: getRequestKey,
    standardHeaders: true,
    legacyHeaders: false,
});
/**
 * 4. GLOBAL API RATE LIMITER (Optional)
 * Apply to: All API endpoints as a safety net
 *
 * Why? Catches any traffic that slips through specific limiters
 * Last line of defense against DDoS attacks
 */
exports.globalLimiter = (0, express_rate_limit_1.default)({
    store: createRedisStore('rl:global:'),
    // Shorter window for faster response to attacks
    windowMs: 60 * 1000, // 1 minute
    // Higher limit for normal API usage
    max: 100, // 100 requests per minute per IP
    message: {
        error: "Too many requests. Please slow down."
    },
    // Use IP as key for global limiter
    keyGenerator,
    standardHeaders: true,
    legacyHeaders: false,
});
/**
 * 5. VOTE CASTING RATE LIMITER (Optional)
 * Apply to: Vote submission endpoints
 *
 * Prevents vote flooding/ballot stuffing
 * Ensures each user votes at a human-consistent pace
 */
exports.voteLimiter = (0, express_rate_limit_1.default)({
    store: createRedisStore('rl:vote:'),
    // Time window: 1 hour
    windowMs: 60 * 60 * 1000,
    // Maximum: 10 votes per hour (adjust based on your poll duration)
    max: 10,
    message: {
        error: "Too many votes cast. Please wait before submitting more votes."
    },
    // Use user-specific keys if authenticated
    keyGenerator: getRequestKey,
    standardHeaders: true,
    legacyHeaders: false,
});
/**
 * 6. ADMIN ENDPOINT RATE LIMITER (Stricter)
 * Apply to: Admin routes (user management, system config, etc.)
 *
 * Much stricter limits for sensitive operations
 * Prevents brute force attacks on admin functionality
 */
exports.adminLimiter = (0, express_rate_limit_1.default)({
    store: createRedisStore('rl:admin:'),
    // Shorter window
    windowMs: 5 * 60 * 1000, // 5 minutes
    // Very strict limit
    max: 20, // 20 requests per 5 minutes
    message: {
        error: "Too many admin requests. Access temporarily restricted."
    },
    // Always use IP for admin routes as additional security
    keyGenerator,
    standardHeaders: true,
    legacyHeaders: false,
});
/**
 * Troubleshooting:
 *
 * If rate limiter isn't working:
 * 1. Check Redis connection: redis.ping()
 * 2. Verify REDIS_URL environment variable is set
 * 3. Check if Redis has memory limits causing eviction
 * 4. Ensure keys are being created: redis.keys('rate-limit:*')
 *
 * If limits are too strict:
 * 1. Monitor actual usage patterns
 * 2. Adjust max values based on 99th percentile
 * 3. Consider higher limits for authenticated users
 * 4. Use skipSuccessfulRequests for auth limiter
 */ 
//# sourceMappingURL=rateLimit.js.map