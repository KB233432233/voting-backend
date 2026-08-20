// utils/voteEncryption.ts
import crypto from "crypto";

const ENCRYPTION_KEY = process.env.VOTE_ENCRYPTION_KEY; // 32 bytes hex (generate with: crypto.randomBytes(32).toString('hex'))
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM recommended nonce length

export function encryptRankings(rankings: any): string {
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(
      ALGORITHM,
      Buffer.from(ENCRYPTION_KEY!, "hex"),
      iv,
    );

    const rankingsJson = JSON.stringify(rankings);
    const encrypted = Buffer.concat([
      cipher.update(rankingsJson, "utf8"),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    // Combine: iv + authTag + encrypted data
    const result = Buffer.concat([iv, authTag, encrypted]);
    return result.toString("base64");
  } catch (error) {
    console.error("Encryption error:", error);
    throw new Error("Failed to encrypt rankings");
  }
}

export function decryptRankings(
  encryptedData: string,
): { candidateId: BigInt; rank: number }[] {
  try {
    const buffer = Buffer.from(encryptedData, "base64");

    // Extract components
    const iv = buffer.subarray(0, IV_LENGTH);
    const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + 16);
    const encrypted = buffer.subarray(IV_LENGTH + 16);

    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      Buffer.from(ENCRYPTION_KEY!, "hex"),
      iv,
    );
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return JSON.parse(decrypted.toString("utf8"));
  } catch (error) {
    console.error("Decryption error:", error);
    throw new Error("Failed to decrypt rankings");
  }
}
