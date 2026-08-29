import type { JwtPayload } from "jsonwebtoken";
import jwt from "jsonwebtoken";
import type { JWTPayload, UserRole } from "../types/auth";

export function verifyAccessToken(token: string, secret: string): JWTPayload {
  const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] });
  
  if (typeof decoded !== "object" || decoded === null) {
    throw new Error("Invalid token payload");
  }
  
  const payload = decoded as JwtPayload;
  
  // Runtime validation of required claims
  if (
    typeof payload.userId !== "string" || 
    typeof payload.walletAddress !== "string" ||
    !["user", "admin", "organization", "auditor", "owner"].includes(payload.role)
  ) {
    throw new Error("Missing or invalid required claims");
  }
  
  return {
    userId: payload.userId,
    walletAddress: payload.walletAddress,
    role: payload.role as UserRole,
  };
}

export function verifyRefreshToken(token: string, secret: string) {
  return jwt.verify(token, secret, { algorithms: ["HS256"] }) as {
    userId: string;
    walletAddress: string;
    role: UserRole;
  };
}
