"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVotingPublicKey = getVotingPublicKey;
const crypto_1 = __importDefault(require("crypto"));
/**
 * GET /voting/public-key
 * Expose the RSA public key (n, e as hex) so clients can blind their
 * vote hash before calling /voting/blind-sign.
 */
async function getVotingPublicKey(_req, res) {
    try {
        const pemKey = process.env.RSA_PUBLIC_KEY_PEM?.replace(/\\n/g, "\n");
        if (!pemKey) {
            res.status(503).json({ error: "Public key not configured" });
            return;
        }
        const pubKey = crypto_1.default.createPublicKey(pemKey);
        const jwk = pubKey.export({ format: "jwk" });
        if (!jwk.n || !jwk.e) {
            res.status(500).json({ error: "Invalid RSA public key" });
            return;
        }
        const toHex = (base64url) => Buffer.from(base64url, "base64url").toString("hex");
        res.json({ success: true, n: toHex(jwk.n), e: toHex(jwk.e) });
    }
    catch (error) {
        console.error("Error reading public key:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}
//# sourceMappingURL=publicKey.controller.js.map