import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import bcrypt from "bcrypt";
import { z } from "zod";
import { query, beginTransaction } from "../config/database-factory.js";
import {
  jwtConfig,
  JWTAccessPayload,
  JWTRefreshPayload,
} from "../config/jwt.js";
import { randomUUID } from "crypto";

// Validation schemas
const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  deviceId: z.string().optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string(),
});

interface User {
  id: string;
  client_id: string;
  branch_id: string;
  username: string;
  password_hash: string;
  full_name: string;
  role: string;
  is_active: boolean;
}

interface Role {
  permissions: string[];
}

export default async function authRoutes(fastify: FastifyInstance) {
  // Login
  fastify.post(
    "/login",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = loginSchema.parse(request.body);

        // Find user
        const users = await query<User>(
          "SELECT * FROM users WHERE username = ? AND is_deleted = FALSE LIMIT 1",
          [body.username]
        );

        if (users.length === 0) {
          return reply.code(401).send({
            error: "Unauthorized",
            message: "Invalid username or password",
          });
        }

        const user = users[0];

        // Check if user is active
        if (!user.is_active) {
          return reply.code(403).send({
            error: "Forbidden",
            message: "User account is inactive",
          });
        }

        // Verify password
        const passwordValid = await bcrypt.compare(
          body.password,
          user.password_hash
        );
        if (!passwordValid) {
          return reply.code(401).send({
            error: "Unauthorized",
            message: "Invalid username or password",
          });
        }

        // Get user permissions from role
        const roles = await query<Role>(
          "SELECT permissions FROM roles WHERE client_id = ? AND name = ? AND is_deleted = FALSE LIMIT 1",
          [user.client_id, user.role]
        );

        const permissions =
          roles.length > 0 && roles[0].permissions
            ? typeof roles[0].permissions === 'string'
              ? JSON.parse(roles[0].permissions)
              : roles[0].permissions
            : [];

        // Generate tokens
        const tokenId = crypto.randomUUID();
        const accessPayload: JWTAccessPayload = {
          userId: user.id,
          clientId: user.client_id,
          branchId: user.branch_id,
          role: user.role,
          permissions: Array.isArray(permissions) ? permissions : [],
          type: "access",
        };

        const refreshPayload: JWTRefreshPayload = {
          userId: user.id,
          clientId: user.client_id,
          branchId: user.branch_id,
          role: user.role,
          type: "refresh",
          tokenId,
        };

        const accessToken = fastify.jwt.sign(accessPayload, {
          expiresIn: jwtConfig.accessExpiry,
        });

        const refreshToken = fastify.jwt.sign(refreshPayload, {
          expiresIn: jwtConfig.refreshExpiry,
        });

        // Store refresh token
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

        await query(
          "INSERT INTO refresh_tokens (id, user_id, token, device_id, expires_at) VALUES (?, ?, ?, ?, ?)",
          [tokenId, user.id, refreshToken, body.deviceId ?? null, expiresAt.toISOString()]
        );

        // Update last login
        await query("UPDATE users SET last_login_at = ? WHERE id = ?", [
          new Date().toISOString(),
          user.id,
        ]);

        return reply.send({
          accessToken,
          refreshToken,
          expiresIn: jwtConfig.accessExpiry,
          user: {
            id: user.id,
            username: user.username,
            fullName: user.full_name,
            role: user.role,
            clientId: user.client_id,
            branchId: user.branch_id,
          },
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({
            error: "Validation Error",
            details: error.errors,
          });
        }
        throw error;
      }
    }
  );

  // Refresh Token
  fastify.post(
    "/refresh",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = refreshSchema.parse(request.body);

        // Verify refresh token
        let payload: JWTRefreshPayload;
        try {
          payload = fastify.jwt.verify<JWTRefreshPayload>(body.refreshToken);
        } catch {
          return reply.code(401).send({
            error: "Unauthorized",
            message: "Invalid or expired refresh token",
          });
        }

        if (payload.type !== "refresh") {
          return reply.code(401).send({
            error: "Unauthorized",
            message: "Invalid token type",
          });
        }

        // Check if refresh token exists and not expired
        const tokens = await query<{ expires_at: Date; user_id: string }>(
          "SELECT expires_at, user_id FROM refresh_tokens WHERE id = ? AND token = ?",
          [payload.tokenId, body.refreshToken]
        );

        if (tokens.length === 0) {
          return reply.code(401).send({
            error: "Unauthorized",
            message: "Refresh token not found",
          });
        }

        const tokenData = tokens[0];
        if (new Date() > new Date(tokenData.expires_at)) {
          // Delete expired token
          await query("DELETE FROM refresh_tokens WHERE id = ?", [
            payload.tokenId,
          ]);
          return reply.code(401).send({
            error: "Unauthorized",
            message: "Refresh token expired",
          });
        }

        // Get user data
        const users = await query<User>(
          "SELECT * FROM users WHERE id = ? AND is_deleted = FALSE LIMIT 1",
          [tokenData.user_id]
        );

        if (users.length === 0 || !users[0].is_active) {
          return reply.code(401).send({
            error: "Unauthorized",
            message: "User not found or inactive",
          });
        }

        const user = users[0];

        // Get permissions
        const roles = await query<Role>(
          "SELECT permissions FROM roles WHERE client_id = ? AND name = ? AND is_deleted = FALSE LIMIT 1",
          [user.client_id, user.role]
        );

        const permissions =
          roles.length > 0 && roles[0].permissions
            ? typeof roles[0].permissions === 'string'
              ? JSON.parse(roles[0].permissions)
              : roles[0].permissions
            : [];

        // Generate new access token
        const accessPayload: JWTAccessPayload = {
          userId: user.id,
          clientId: user.client_id,
          branchId: user.branch_id,
          role: user.role,
          permissions: Array.isArray(permissions) ? permissions : [],
          type: "access",
        };

        const accessToken = fastify.jwt.sign(accessPayload, {
          expiresIn: jwtConfig.accessExpiry,
        });

        return reply.send({
          accessToken,
          expiresIn: jwtConfig.accessExpiry,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({
            error: "Validation Error",
            details: error.errors,
          });
        }
        throw error;
      }
    }
  );

  // Logout
  fastify.post(
    "/logout",
    {
      preHandler: async (request, reply) => {
        try {
          await request.jwtVerify();
        } catch {
          return reply.code(401).send({
            error: "Unauthorized",
          });
        }
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const refreshSchema = z.object({
          refreshToken: z.string(),
        });
        const body = refreshSchema.parse(request.body);

        // Delete refresh token
        await query("DELETE FROM refresh_tokens WHERE token = ?", [
          body.refreshToken,
        ]);

        return reply.send({
          message: "Logged out successfully",
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.code(400).send({
            error: "Validation Error",
            details: error.errors,
          });
        }
        throw error;
      }
    }
  );
}
