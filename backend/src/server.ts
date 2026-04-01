import Fastify from "fastify";
import fastifyJwt from "@fastify/jwt";
import fastifyCors from "@fastify/cors";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyWebsocket from "@fastify/websocket";
import fastifyMultipart from "@fastify/multipart";
import { resolve } from "path";
import { createReadStream, existsSync } from "fs";
import { env } from "./config/env.js";
import { jwtConfig } from "./config/jwt.js";
import logger from "./config/logger.js";
// New auto-database imports
import { initializeDatabase, closeDatabase, getDatabaseType, isUsingSQLite } from "./config/database-factory.js";
import { runMigrations } from "./database/MigrationRunner.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { registerAuthDecorator } from "./middlewares/auth.js";
import {
  initializeWebSocketServer,
  wsSyncServer,
} from "./websocket/syncServer.js";
import { notificationService } from "./services/NotificationService.js";

// Import routes
import authRoutes from "./routes/auth.js";
import licenseRoutes from "./routes/license.js";
import { syncRoutes } from "./routes/sync.js";
import productRoutes from "./routes/products.js";
import customerRoutes from "./routes/customers.js";
import nearestTraderRoutes from "./routes/nearestTrader.js";
import invoiceRoutes from "./routes/invoices.js";
import categoryRoutes from "./routes/categories.js";
import supplierRoutes from "./routes/suppliers.js";
import paymentMethodRoutes from "./routes/payment-methods.js";
import employeeRoutes from "./routes/employees.js";
import expenseCategoryRoutes from "./routes/expense-categories.js";
import expenseRoutes from "./routes/expenses.js";
import purchaseRoutes from "./routes/purchases.js";
import adminRoutes from "./routes/admin.js";
import adminClientsRoutes from "./routes/admin/clients.js";
import adminLicensesRoutes from "./routes/admin/licenses.js";
import adminBranchesRoutes from "./routes/admin/branches.js";
import adminPackagesRoutes from "./routes/admin/packages.js";
import updateRoutes from "./routes/updates.js";
import { supervisorRoutes } from "./routes/supervisors.js";
import { salesRepRoutes } from "./routes/salesReps.js";
import { mobileRoutes } from "./routes/mobile.js";
import { mobileAccountRoutes } from "./routes/mobile-accounts.js";
import { whatsappRoutes } from "./routes/whatsapp.js";
import { notificationRoutes } from "./routes/notifications.js";
import {
  initializeWhatsAppService,
  shutdownWhatsAppService,
  setBroadcaster,
} from "./services/whatsapp/index.js";

const fastify = Fastify({
  logger: logger,
  trustProxy: true,
  bodyLimit: 10485760, // 10MB
});

// Register plugins
async function registerPlugins() {
  // JWT
  await fastify.register(fastifyJwt, {
    secret: jwtConfig.secret,
    sign: {
      expiresIn: jwtConfig.accessExpiry,
    },
  });

  // CORS
  await fastify.register(fastifyCors, {
    origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(","),
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
    exposedHeaders: ["Content-Range", "X-Content-Range"],
    preflight: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  // Rate Limiting (except for sync and update endpoints)
  await fastify.register(fastifyRateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_TIMEWINDOW,
    skipOnError: true,
    allowList: (req) => {
      // Skip rate limiting for sync and update endpoints
      const url = req.url || "";
      return url.startsWith(`${env.API_PREFIX}/sync`) || url.startsWith(`${env.API_PREFIX}/updates`) || false;
    },
  });

  // Multipart (for file uploads, max 500MB for app updates)
  await fastify.register(fastifyMultipart, {
    limits: {
      fileSize: 500 * 1024 * 1024, // 500MB max file size
    },
  });

  // Serve uploaded notification images
  fastify.get("/uploads/notification-images/:filename", async (request, reply) => {
    const { filename } = request.params as { filename: string };
    // Prevent path traversal
    if (filename.includes("..") || filename.includes("/")) {
      return reply.code(400).send({ error: "Invalid filename" });
    }
    const filePath = resolve(process.cwd(), "data/notification-images", filename);
    if (!existsSync(filePath)) return reply.code(404).send({ error: "Not found" });
    const ext = filename.split(".").pop()?.toLowerCase() || "jpg";
    const mimeMap: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };
    reply.header("Content-Type", mimeMap[ext] || "application/octet-stream");
    return reply.send(createReadStream(filePath));
  });

  // Serve price list PDF
  fastify.get("/uploads/price-list/:filename", async (request, reply) => {
    const { filename } = request.params as { filename: string };
    if (filename.includes("..") || filename.includes("/")) {
      return reply.code(400).send({ error: "Invalid filename" });
    }
    const filePath = resolve(process.cwd(), "data/price-lists", filename);
    if (!existsSync(filePath)) return reply.code(404).send({ error: "Not found" });
    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", `inline; filename="${filename}"`);
    return reply.send(createReadStream(filePath));
  });

  // WebSocket
  await fastify.register(fastifyWebsocket, {
    options: {
      maxPayload: 1048576, // 1MB
    },
  });

  // Register auth decorator
  registerAuthDecorator(fastify);
}

// Register routes
async function registerRoutes() {
  // Health check
  fastify.get("/health", async () => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  });

  // Health with API prefix
  fastify.get(`${env.API_PREFIX}/health`, async () => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  });

  // API routes
  await fastify.register(authRoutes, { prefix: `${env.API_PREFIX}/auth` });
  await fastify.register(licenseRoutes, {
    prefix: `${env.API_PREFIX}/license`,
  });
  await fastify.register(syncRoutes, { prefix: `${env.API_PREFIX}/sync` });
  await fastify.register(productRoutes, {
    prefix: `${env.API_PREFIX}/products`,
  });
  await fastify.register(customerRoutes, {
    prefix: `${env.API_PREFIX}/customers`,
  });
  await fastify.register(nearestTraderRoutes, {
    prefix: `${env.API_PREFIX}/nearest-trader`,
  });
  await fastify.register(invoiceRoutes, {
    prefix: `${env.API_PREFIX}/invoices`,
  });
  await fastify.register(categoryRoutes, {
    prefix: `${env.API_PREFIX}/categories`,
  });
  await fastify.register(supplierRoutes, {
    prefix: `${env.API_PREFIX}/suppliers`,
  });
  await fastify.register(paymentMethodRoutes, {
    prefix: `${env.API_PREFIX}/payment-methods`,
  });
  await fastify.register(employeeRoutes, {
    prefix: `${env.API_PREFIX}/employees`,
  });
  await fastify.register(expenseCategoryRoutes, {
    prefix: `${env.API_PREFIX}/expense-categories`,
  });
  await fastify.register(expenseRoutes, {
    prefix: `${env.API_PREFIX}/expenses`,
  });
  await fastify.register(purchaseRoutes, {
    prefix: `${env.API_PREFIX}/purchases`,
  });
  await fastify.register(supervisorRoutes, {
    prefix: `${env.API_PREFIX}/supervisors`,
  });
  await fastify.register(salesRepRoutes, {
    prefix: `${env.API_PREFIX}/sales-reps`,
  });

  // Mobile routes
  await fastify.register(mobileRoutes, {
    prefix: `${env.API_PREFIX}/mobile`,
  });

  // Mobile account management routes
  await fastify.register(mobileAccountRoutes, {
    prefix: `${env.API_PREFIX}/mobile/accounts`,
  });

  // Admin routes
  await fastify.register(adminRoutes, { prefix: `${env.API_PREFIX}/admin` });
  await fastify.register(adminClientsRoutes, { prefix: `${env.API_PREFIX}/admin/clients` });
  await fastify.register(adminLicensesRoutes, { prefix: `${env.API_PREFIX}/admin/licenses` });
  await fastify.register(adminBranchesRoutes, { prefix: `${env.API_PREFIX}/admin/branches` });
  await fastify.register(adminPackagesRoutes, { prefix: `${env.API_PREFIX}/admin/packages` });

  // Notifications routes
  await fastify.register(notificationRoutes, {
    prefix: `${env.API_PREFIX}/notifications`,
  });

  // WhatsApp routes
  await fastify.register(whatsappRoutes, {
    prefix: `${env.API_PREFIX}/whatsapp`,
  });

  // App Updates routes - register under both /api/updates and /api/admin/updates
  await fastify.register(updateRoutes, { prefix: `${env.API_PREFIX}/updates` });
  await fastify.register(updateRoutes, { prefix: `${env.API_PREFIX}/admin/updates` });

  logger.info("✅ All routes registered successfully");
}

// Error handler
fastify.setErrorHandler(errorHandler);

// Graceful shutdown
async function gracefulShutdown() {
  logger.info("Received shutdown signal, closing server gracefully...");
  try {
    await shutdownWhatsAppService();
    if (wsSyncServer) {
      await wsSyncServer.shutdown();
    }
    await fastify.close();
    await closeDatabase();
    logger.info("✅ Server closed successfully");
    process.exit(0);
  } catch (error) {
    logger.error({ error }, "Error during shutdown");
    process.exit(1);
  }
}

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

// Start server
async function start() {
  try {
    // Auto-initialize database (MySQL or SQLite fallback)
    logger.info("🔄 Initializing database...");
    await initializeDatabase();

    const dbType = getDatabaseType();
    if (isUsingSQLite()) {
      logger.info("⚠️  Running in SQLite fallback mode (development only)");
    } else {
      logger.info(`✅ Connected to ${dbType.toUpperCase()} database`);
    }

    // Run pending migrations
    await runMigrations();

    // Register plugins
    await registerPlugins();

    // Register routes
    await registerRoutes();

    // Initialize WebSocket server
    await initializeWebSocketServer(fastify as any);

    // Initialize WhatsApp service
    initializeWhatsAppService();
    setBroadcaster((clientId, event, data) => {
      if (wsSyncServer) {
        wsSyncServer.broadcastToClientRooms(String(clientId), {
          type: event,
          data,
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Initialize Firebase for push notifications
    notificationService.initialize();

    // Start listening
    const host = env.HOST || "0.0.0.0";
    await fastify.listen({
      port: env.PORT,
      host: host,
    });

    logger.info(`🚀 Server is running on http://${host}:${env.PORT}`);
    logger.info(`📡 WebSocket ready on ws://${host}:${env.WS_PORT}`);
    logger.info(`🌍 Environment: ${env.NODE_ENV}`);
    logger.info(`💾 Database: ${dbType.toUpperCase()}`);
  } catch (error) {
    logger.error({ error }, "Failed to start server");
    process.exit(1);
  }
}

start();
