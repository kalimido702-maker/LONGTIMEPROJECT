import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  syncService,
  SyncBatchRequest,
  PullChangesRequest,
} from "../services/SyncService.js";
import { logger } from "../config/logger.js";
import { wsSyncServer } from "../websocket/syncServer.js";
import { notificationService } from "../services/NotificationService.js";

interface BatchPushBody {
  device_id: string;
  records: Array<{
    table_name: string;
    record_id: string;
    data: Record<string, any>;
    local_updated_at: string;
    is_deleted: boolean;
  }>;
}

interface PullChangesQuery {
  since: string;
  tables?: string;
}

interface ResolveConflictBody {
  table_name: string;
  record_id: string;
  resolution: "accept_server" | "accept_client";
  client_data?: Record<string, any>;
}

export async function syncRoutes(server: FastifyInstance) {
  /**
   * POST /api/sync/batch-push
   * دفع batch من التغييرات من الـ client للسيرفر
   */
  server.post<{ Body: BatchPushBody }>(
    "/batch-push",
    {
      preHandler: [server.authenticate],
      schema: {
        body: {
          type: "object",
          required: ["device_id", "records"],
          properties: {
            device_id: { type: "string" },
            records: {
              type: "array",
              items: {
                type: "object",
                required: [
                  "table_name",
                  "record_id",
                  "data",
                  "local_updated_at",
                  "is_deleted",
                ],
                properties: {
                  table_name: { type: "string" },
                  record_id: { type: "string" },
                  data: { type: "object", additionalProperties: true },
                  local_updated_at: { type: "string" },
                  is_deleted: { type: "boolean" },
                },
              },
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              synced_count: { type: "number" },
              conflicts: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    table_name: { type: "string" },
                    record_id: { type: "string" },
                    local_data: { type: "object", additionalProperties: true },
                    server_data: { type: "object", additionalProperties: true },
                    local_updated_at: { type: "string" },
                    server_updated_at: { type: "string" },
                  },
                },
              },
              errors: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    table_name: { type: "string" },
                    record_id: { type: "string" },
                    error: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: BatchPushBody }>,
      reply: FastifyReply
    ) => {
      try {
        const { device_id, records } = request.body;
        const { userId, clientId, branchId } = request.user!;

        logger.info(
          {
            user_id: userId,
            client_id: clientId,
            branch_id: branchId,
            device_id,
            record_count: records.length,
          },
          "Sync batch push request"
        );

        const syncRequest: SyncBatchRequest = {
          client_id: clientId as any, // Keep as string UUID
          branch_id: branchId as any, // Keep as string UUID
          device_id,
          records,
        };

        const result = await syncService.processBatch(syncRequest);

        // Broadcast changes to other connected clients via WebSocket
        if (result.synced_count > 0 && wsSyncServer) {
          const room = `${clientId}:${branchId}`;
          for (const record of records) {
            // Only broadcast if record wasn't in conflict
            const hasConflict = result.conflicts?.some(
              (c: any) => c.record_id === record.record_id && c.table_name === record.table_name
            );
            if (!hasConflict) {
              try {
                await wsSyncServer.broadcastToRoom(
                  room,
                  record.table_name,
                  record.record_id,
                  record.is_deleted ? "delete" : "update",  // Operation stays same
                  null,  // NO DATA - force client to pull
                  device_id
                );
              } catch (broadcastError) {
                logger.warn({ error: broadcastError, table: record.table_name, record_id: record.record_id }, "Failed to broadcast sync update");
              }
            }
          }
          logger.info({ room, synced_count: result.synced_count }, "Broadcasted sync updates to room");
        }

        // ── Push Notifications for mobile customers ──────────────
        // Fire-and-forget: don't block the sync response
        if (result.synced_count > 0) {
          setImmediate(async () => {
            try {
              for (const record of records) {
                // Skip deleted records and conflicts
                if (record.is_deleted) continue;
                const hasConflict = result.conflicts?.some(
                  (c: any) =>
                    c.record_id === record.record_id &&
                    c.table_name === record.table_name
                );
                if (hasConflict) continue;

                const tableName = record.table_name;
                const data = record.data || {};

                if (
                  tableName === "invoices" ||
                  tableName === "Invoices"
                ) {
                  await notificationService.notifyNewInvoice(
                    { id: record.record_id, ...data },
                    clientId as string,
                    branchId as string
                  );
                } else if (
                  tableName === "payments" ||
                  tableName === "Payments"
                ) {
                  await notificationService.notifyNewPayment(
                    { id: record.record_id, ...data },
                    clientId as string,
                    branchId as string
                  );
                } else if (
                  tableName === "salesReturns" ||
                  tableName === "sales_returns"
                ) {
                  await notificationService.notifyNewReturn(
                    { id: record.record_id, ...data },
                    clientId as string,
                    branchId as string
                  );
                }
              }
            } catch (notifError) {
              logger.warn(
                { error: notifError },
                "Failed to send push notifications after sync"
              );
            }
          });
        }

        return reply.code(200).send(result);
      } catch (error) {
        logger.error({ error }, "Batch push failed");
        return reply.code(500).send({
          error: "Sync failed",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  /**
   * GET /api/sync/pull-changes
   * سحب التغييرات من السيرفر منذ timestamp معين
   */
  server.get<{ Querystring: PullChangesQuery }>(
    "/pull-changes",
    {
      // !! CRITICAL: Must authenticate to get correct client_id and branch_id
      preHandler: [server.authenticate],
      schema: {
        querystring: {
          type: "object",
          required: ["since"],
          properties: {
            since: { type: "string" }, // timestamp or compound cursor (timestamp|id)
            tables: { type: "string" }, // comma-separated table names
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              changes: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    table_name: { type: "string" },
                    record_id: { type: "string" },
                    data: { type: "object", additionalProperties: true },
                    server_updated_at: { type: "string" },
                    is_deleted: { type: "boolean" },
                  },
                },
              },
              has_more: { type: "boolean" },
              next_cursor: { type: "string" },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Querystring: PullChangesQuery }>,
      reply: FastifyReply
    ) => {
      try {
        const { since, tables } = request.query;
        // Get client_id and branch_id from authenticated user (JWT token)
        const { clientId, branchId, userId } = request.user!;

        logger.info(
          {
            user_id: userId,
            client_id: clientId,
            branch_id: branchId,
            since,
            tables,
          },
          "Pull changes request"
        );

        const pullRequest: PullChangesRequest = {
          client_id: clientId,
          branch_id: branchId,
          since,
          tables: tables ? tables.split(",") : undefined,
        };

        const result = await syncService.pullChanges(pullRequest);

        return reply.code(200).send(result);
      } catch (error) {
        logger.error({ error }, "Pull changes failed");
        return reply.code(500).send({
          error: "Pull failed",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  /**
   * GET /api/sync/record/:tableName/:recordId
   * سحب سجل محدد من جدول معين (للمزامنة notification-based)
   */
  server.get<{
    Params: { tableName: string; recordId: string };
  }>(
    "/record/:tableName/:recordId",
    {
      preHandler: [server.authenticate],
      schema: {
        params: {
          type: "object",
          required: ["tableName", "recordId"],
          properties: {
            tableName: { type: "string" },
            recordId: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: { type: "object", additionalProperties: true },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { tableName: string; recordId: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { tableName, recordId } = request.params;
        const { userId, clientId, branchId } = request.user!;

        logger.info(
          {
            user_id: userId,
            client_id: clientId,
            branch_id: branchId,
            table: tableName,
            record_id: recordId,
          },
          "Get specific record request"
        );

        // Get the record from the specific table
        const record = await syncService.getSpecificRecord(
          clientId as any,
          branchId as any,
          tableName,
          recordId
        );

        if (!record) {
          return reply.code(404).send({
            success: false,
            error: "Record not found",
          });
        }

        return reply.code(200).send({
          success: true,
          data: record,
        });
      } catch (error) {
        logger.error({ error }, "Get specific record failed");
        return reply.code(500).send({
          error: "Fetch failed",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  /**
   * POST /api/sync/resolve-conflict
   * حل conflict بين نسخة client وserver
   */
  server.post<{ Body: ResolveConflictBody }>(
    "/resolve-conflict",
    {
      preHandler: [server.authenticate],
      schema: {
        body: {
          type: "object",
          required: ["table_name", "record_id", "resolution"],
          properties: {
            table_name: { type: "string" },
            record_id: { type: "string" },
            resolution: {
              type: "string",
              enum: ["accept_server", "accept_client"],
            },
            client_data: { type: "object", additionalProperties: true },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: ResolveConflictBody }>,
      reply: FastifyReply
    ) => {
      try {
        const { table_name, record_id, resolution, client_data } = request.body;
        const { userId, clientId, branchId } = request.user!;

        logger.info(
          {
            user_id: userId,
            client_id: clientId,
            branch_id: branchId,
            table_name,
            record_id,
            resolution,
          },
          "Resolve conflict request"
        );

        if (resolution === "accept_client" && !client_data) {
          return reply.code(400).send({
            error: "Bad Request",
            message: "client_data is required when accepting client version",
          });
        }

        await syncService.resolveConflict(
          clientId as any,
          branchId as any,
          table_name,
          record_id,
          resolution,
          client_data
        );

        return reply.code(200).send({
          success: true,
          message: `Conflict resolved with ${resolution}`,
        });
      } catch (error) {
        logger.error({ error }, "Resolve conflict failed");
        return reply.code(500).send({
          error: "Resolution failed",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  /**
   * GET /api/sync/stats
   * الحصول على إحصائيات الـ sync للعميل والفرع
   */
  server.get(
    "/stats",
    {
      preHandler: [server.authenticate],
      schema: {
        response: {
          200: {
            type: "object",
            properties: {
              pending_queue_count: { type: "number" },
              last_sync_at: { type: ["string", "null"] },
              tables_stats: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    table_name: { type: "string" },
                    record_count: { type: "number" },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { userId, clientId, branchId } = request.user!;

        logger.info(
          {
            user_id: userId,
            client_id: clientId,
            branch_id: branchId,
          },
          "Sync stats request"
        );

        const stats = await syncService.getSyncStats(
          clientId as any,
          branchId as any
        );

        return reply.code(200).send(stats);
      } catch (error) {
        logger.error({ error }, "Get sync stats failed");
        return reply.code(500).send({
          error: "Stats retrieval failed",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  /**
   * DELETE /api/sync/clear-all
   * حذف جميع البيانات من السيرفر للعميل والفرع الحالي
   * ⚠️ عملية خطيرة - تحذف كل البيانات
   */
  server.delete(
    "/clear-all",
    {
      preHandler: [server.authenticate],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { userId, clientId, branchId } = request.user!;

        logger.warn(
          {
            user_id: userId,
            client_id: clientId,
            branch_id: branchId,
          },
          "⚠️ CLEAR ALL DATA request"
        );

        const result = await syncService.clearAllData(
          clientId as any,
          branchId as any
        );

        logger.warn(
          {
            user_id: userId,
            client_id: clientId,
            branch_id: branchId,
            deleted_tables: result.deleted_tables,
            total_deleted: result.total_deleted,
          },
          "✅ CLEAR ALL DATA completed"
        );

        return reply.code(200).send(result);
      } catch (error) {
        logger.error({ error }, "Clear all data failed");
        return reply.code(500).send({
          error: "Clear all data failed",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );
}
