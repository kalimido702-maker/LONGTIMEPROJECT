import { FastifyRequest, FastifyReply } from "fastify";
import { JWTAccessPayload } from "../config/jwt.js";

// Extended payload type to include sync tokens
interface JWTSyncPayload {
  licenseKey: string;
  clientId: string;
  branchId: string | null;
  deviceId: string;
  type: "sync";
}

type JWTPayload = JWTAccessPayload | JWTSyncPayload;

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
      request.user = payload as JWTAccessPayload;
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
