"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptRankings = encryptRankings;
exports.decryptRankings = decryptRankings;
// utils/voteEncryption.ts
const crypto_1 = __importDefault(require("crypto"));
const ENCRYPTION_KEY = process.env.VOTE_ENCRYPTION_KEY; // 32 bytes hex (generate with: crypto.randomBytes(32).toString('hex'))
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM recommended nonce length
function encryptRankings(rankings) {
    try {
        const iv = crypto_1.default.randomBytes(IV_LENGTH);
        const cipher = crypto_1.default.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, "hex"), iv);
        const rankingsJson = JSON.stringify(rankings);
        const encrypted = Buffer.concat([
            cipher.update(rankingsJson, "utf8"),
            cipher.final(),
        ]);
        const authTag = cipher.getAuthTag();
        // Combine: iv + authTag + encrypted data
        const result = Buffer.concat([iv, authTag, encrypted]);
        return result.toString("base64");
    }
    catch (error) {
        console.error("Encryption error:", error);
        throw new Error("Failed to encrypt rankings");
    }
}
function decryptRankings(encryptedData) {
    try {
        const buffer = Buffer.from(encryptedData, "base64");
        // Extract components
        const iv = buffer.subarray(0, IV_LENGTH);
        const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + 16);
        const encrypted = buffer.subarray(IV_LENGTH + 16);
        const decipher = crypto_1.default.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, "hex"), iv);
        decipher.setAuthTag(authTag);
        const decrypted = Buffer.concat([
            decipher.update(encrypted),
            decipher.final(),
        ]);
        return JSON.parse(decrypted.toString("utf8"));
    }
    catch (error) {
        console.error("Decryption error:", error);
        throw new Error("Failed to decrypt rankings");
    }
}
//# sourceMappingURL=voteEncryption.js.map