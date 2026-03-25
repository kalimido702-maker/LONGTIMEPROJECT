import { FastifyRequest, FastifyReply } from "fastify";
import { JWTAccessPayload } from "../config/jwt.js";
import { query } from "../config/database-factory.js";
import { createHash } from "crypto";

// Extended payload type to include sync tokens
interface JWTSyncPayload {
  licenseKey: string;
  clientId: string;
  branchId: string | null;
  deviceId: string;
  type: "sync";
}

type JWTPayload = JWTAccessPayload | JWTSyncPayload;

function getPasswordVersion(passwordHash: string): string {
  return createHash("sha256").update(passwordHash).digest("hex").slice(0, 24);
}

interface AuthUserRow {
  password_hash: string;
  is_active: number | boolean;
  is_deleted: number | boolean;
  client_id: string;
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Verify JWT token
    const payload = await request.jwtVerify<JWTPayload>();

    // Accept both access tokens (admin dashboard) and sync tokens (Electron app)
    if (payload.type !== "access" && payload.type !== "sync") {
      return reply.code(401).send({
        error: "Invalid token type",
        message: "Access or sync token required",
      });
    }

    // Attach user/sync info to request
    if (payload.type === "access") {
      const accessPayload = payload as JWTAccessPayload;
      const users = await query<AuthUserRow>(
        "SELECT password_hash, is_active, is_deleted, client_id FROM users WHERE id = ? LIMIT 1",
        [accessPayload.userId]
      );

      if (users.length === 0) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "User not found",
        });
      }

      const user = users[0];
      const isDeleted = user.is_deleted === true || Number(user.is_deleted) === 1;
      const isActive = user.is_active === true || Number(user.is_active) === 1;

      if (isDeleted || !isActive || String(user.client_id) != String(accessPayload.clientId)) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Session is no longer valid",
        });
      }

      if (accessPayload.pwdv) {
        const currentPwdv = getPasswordVersion(user.password_hash);
        if (accessPayload.pwdv !== currentPwdv) {
          return reply.code(401).send({
            error: "Unauthorized",
            message: "Session expired, please login again",
          });
        }
      }

      request.user = accessPayload;
    } else {
      // For sync tokens, map to user format for compatibility
      request.user = {
        userId: 0,
        clientId: (payload as JWTSyncPayload).clientId,
        branchId: (payload as JWTSyncPayload).branchId,
        type: "sync",
      } as any;
    }
  } catch (error) {
    return reply.code(401).send({
      error: "Unauthorized",
      message: "Invalid or expired token",
    });
  }
}

export async function optionalAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const payload = await request.jwtVerify<JWTAccessPayload>();
    if (payload.type === "access") {
      request.user = payload;
    }
  } catch {
    // Ignore authentication errors for optional auth
  }
}

// Register the decorator
export function registerAuthDecorator(server: any): void {
  server.decorate("authenticate", authMiddleware);
  server.decorate("optionalAuth", optionalAuth);
}
