import type { Request, Response } from "express";
import crypto from "crypto";

/**
 * GET /voting/public-key
 * Expose the RSA public key (n, e as hex) so clients can blind their
 * vote hash before calling /voting/blind-sign.
 */
export async function getVotingPublicKey(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    const pemKey = process.env.RSA_PUBLIC_KEY_PEM?.replace(/\\n/g, "\n");
    if (!pemKey) {
      res.status(503).json({ error: "Public key not configured" });
      return;
    }

    const pubKey = crypto.createPublicKey(pemKey);
    const jwk = pubKey.export({ format: "jwk" }) as {
      n?: string;
      e?: string;
    };
    if (!jwk.n || !jwk.e) {
      res.status(500).json({ error: "Invalid RSA public key" });
      return;
    }

    const toHex = (base64url: string) =>
      Buffer.from(base64url, "base64url").toString("hex");

    res.json({ success: true, n: toHex(jwk.n), e: toHex(jwk.e) });
  } catch (error) {
    console.error("Error reading public key:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}