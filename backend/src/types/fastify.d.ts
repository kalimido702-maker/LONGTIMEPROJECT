import "@fastify/jwt";
import { JWTAccessPayload } from "../config/jwt";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    user: JWTAccessPayload;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
    optionalAuth: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
  }
}
