"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyAccessToken = verifyAccessToken;
exports.verifyRefreshToken = verifyRefreshToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
function verifyAccessToken(token, secret) {
    const decoded = jsonwebtoken_1.default.verify(token, secret, { algorithms: ["HS256"] });
    if (typeof decoded !== "object" || decoded === null) {
        throw new Error("Invalid token payload");
    }
    const payload = decoded;
    // Runtime validation of required claims
    if (typeof payload.userId !== "string" ||
        typeof payload.walletAddress !== "string" ||
        !["user", "admin", "organization", "auditor", "owner"].includes(payload.role)) {
        throw new Error("Missing or invalid required claims");
    }
    return {
        userId: payload.userId,
        walletAddress: payload.walletAddress,
        role: payload.role,
    };
}
function verifyRefreshToken(token, secret) {
    return jsonwebtoken_1.default.verify(token, secret, { algorithms: ["HS256"] });
}
//# sourceMappingURL=jwt.js.map