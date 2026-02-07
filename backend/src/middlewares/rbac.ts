import { FastifyRequest, FastifyReply } from "fastify";

type Permission = string;

export function requirePermissions(...permissions: Permission[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;

    if (!user) {
      return reply.code(401).send({
        error: "Unauthorized",
        message: "Authentication required",
      });
    }

    // Super admin bypasses permission checks
    if (user.role === "super_admin") {
      return;
    }

    // Check if user has all required permissions
    const hasAllPermissions = permissions.every((permission) =>
      user.permissions.includes(permission)
    );

    if (!hasAllPermissions) {
      return reply.code(403).send({
        error: "Forbidden",
        message: "Insufficient permissions",
        required: permissions,
        current: user.permissions,
      });
    }
  };
}

export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;

    if (!user) {
      return reply.code(401).send({
        error: "Unauthorized",
        message: "Authentication required",
      });
    }

    if (!roles.includes(user.role)) {
      return reply.code(403).send({
        error: "Forbidden",
        message: "Insufficient role",
        required: roles,
        current: user.role,
      });
    }
  };
}
