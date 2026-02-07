import { FastifyRequest, FastifyReply } from "fastify";

export async function clientValidation(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const user = request.user;

  if (!user) {
    return reply.code(401).send({
      error: "Unauthorized",
      message: "Authentication required",
    });
  }

  // Extract client_id and branch_id from query, params, or body
  const clientId =
    (request.query as any)?.client_id ||
    (request.params as any)?.client_id ||
    (request.body as any)?.client_id;

  const branchId =
    (request.query as any)?.branch_id ||
    (request.params as any)?.branch_id ||
    (request.body as any)?.branch_id;

  // Validate client_id matches user's client
  if (clientId && clientId !== user.clientId) {
    return reply.code(403).send({
      error: "Forbidden",
      message: "Access denied to this client",
    });
  }

  // Validate branch_id matches user's branch (unless super admin)
  if (branchId && branchId !== user.branchId && user.role !== "super_admin") {
    return reply.code(403).send({
      error: "Forbidden",
      message: "Access denied to this branch",
    });
  }
}
