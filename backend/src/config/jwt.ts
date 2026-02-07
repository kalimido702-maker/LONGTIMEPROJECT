import { env } from "./env.js";

export interface JWTConfig {
  secret: string;
  accessExpiry: string;
  refreshExpiry: string;
}

export const jwtConfig: JWTConfig = {
  secret: env.JWT_SECRET,
  accessExpiry: env.JWT_ACCESS_EXPIRY,
  refreshExpiry: env.JWT_REFRESH_EXPIRY,
};

export interface JWTPayload {
  userId: string;
  clientId: string;
  branchId: string;
  role: string;
  permissions: string[];
  type: "access" | "refresh";
}

export interface JWTAccessPayload extends JWTPayload {
  type: "access";
}

export interface JWTRefreshPayload extends Omit<JWTPayload, "permissions"> {
  type: "refresh";
  tokenId: string;
}
