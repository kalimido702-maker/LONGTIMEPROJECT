import { FastifyError, FastifyRequest, FastifyReply } from "fastify";
import logger from "../config/logger.js";
import { AlertService } from "../services/AlertService.js";

export async function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Log error
  logger.error({
    error: {
      message: error.message,
      stack: error.stack,
      code: error.code,
    },
    request: {
      method: request.method,
      url: request.url,
      params: request.params,
      query: request.query,
      user: request.user,
    },
  });

  // Send critical alert for 5xx errors
  if (error.statusCode && error.statusCode >= 500) {
    try {
      await AlertService.sendCriticalAlert({
        error: error.message,
        stack: error.stack || "",
        endpoint: `${request.method} ${request.url}`,
        user: request.user?.userId || "anonymous",
        clientId: request.user?.clientId || "unknown",
        timestamp: new Date().toISOString(),
      });
    } catch (alertError) {
      logger.error({ error: alertError }, "Failed to send critical alert");
    }
  }

  // Determine status code
  const statusCode = error.statusCode || 500;

  // Send error response
  reply.code(statusCode).send({
    error: error.name || "InternalServerError",
    message: error.message || "An unexpected error occurred",
    statusCode,
    ...(process.env.NODE_ENV === "development" && {
      stack: error.stack,
    }),
  });
}
