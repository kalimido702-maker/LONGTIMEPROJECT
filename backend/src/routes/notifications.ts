import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { db } from "../config/database-factory.js";
import { logger } from "../config/logger.js";
import { notificationService, NotificationType } from "../services/NotificationService.js";
import { RowDataPacket } from "mysql2/promise";
import { randomUUID } from "crypto";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { resolve, extname } from "path";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";

interface SendNotificationBody {
  title: string;
  body: string;
  type: NotificationType;
  target: 'all' | 'customers' | 'sales_reps' | 'supervisors' | 'user';
  imageUrl?: string;
  userId?: string;
  customerId?: string;
  referenceId?: string;
  referenceType?: string;
}

export async function notificationRoutes(server: FastifyInstance) {

  // ─────────────────────────────────────────────────────
  // POST /api/notifications/send
  // Send a push notification from desktop to mobile users
  // ─────────────────────────────────────────────────────
  server.post(
    "/send",
    { preHandler: [server.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { clientId, branchId } = request.user!;
        const body = request.body as SendNotificationBody;

        if (!body.title || !body.body || !body.type || !body.target) {
          return reply.code(400).send({ error: "title, body, type, and target are required" });
        }

        const pushEnabled = notificationService.isEnabled();

        if (body.target === 'all' || body.target === 'customers' || body.target === 'sales_reps' || body.target === 'supervisors') {
          // Targeted broadcast by role
          let roleFilter = '';
          if (body.target === 'customers') roleFilter = "AND u.role = 'customer'";
          else if (body.target === 'sales_reps') roleFilter = "AND u.role = 'sales_rep'";
          else if (body.target === 'supervisors') roleFilter = "AND u.role = 'supervisor'";

          const [rows] = await db.query<RowDataPacket[]>(
            `SELECT DISTINCT u.id as user_id
             FROM users u
             INNER JOIN fcm_tokens f ON f.user_id = u.id AND f.is_active = 1
             WHERE u.client_id = ? AND u.is_deleted = 0 AND u.is_active = 1
             ${roleFilter}`,
            [clientId]
          );

          const userIds = rows.map((r) => r.user_id).filter(Boolean);

          if (userIds.length === 0) {
            return reply.code(200).send({ success: true, sent: 0, message: "لا يوجد مستخدمين متصلين" });
          }

          // Persist + push one notification per target user
          for (const targetUserId of userIds) {
            await notificationService.sendNotification({
              clientId,
              branchId,
              userId: targetUserId,
              title: body.title,
              body: body.body,
              type: body.type,
              imageUrl: body.imageUrl,
              referenceId: body.referenceId,
              referenceType: body.referenceType,
            });
          }

          logger.info({ clientId, target: body.target, userCount: userIds.length, pushEnabled }, "Manual notification sent");
          return reply.code(200).send({ success: true, sent: userIds.length, pushEnabled });

        } else if (body.target === 'user') {
          if (!body.userId && !body.customerId) {
            return reply.code(400).send({ error: "userId or customerId required for user target" });
          }

          await notificationService.sendNotification({
            clientId,
            branchId,
            userId: body.userId,
            customerId: body.customerId,
            title: body.title,
            body: body.body,
            type: body.type,
            imageUrl: body.imageUrl,
            referenceId: body.referenceId,
            referenceType: body.referenceType,
          });

          return reply.code(200).send({ success: true, sent: 1, pushEnabled });
        }

        return reply.code(400).send({ error: "Invalid target" });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error({ error }, "Failed to send notification");
        return reply.code(500).send({ error: "Failed to send notification", details: msg });
      }
    }
  );

  // ─────────────────────────────────────────────────────
  // GET /api/notifications/history
  // Get sent notifications history
  // ─────────────────────────────────────────────────────
  server.get(
    "/history",
    { preHandler: [server.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { clientId } = request.user!;
        const { page = 1, limit = 50 } = request.query as { page?: number; limit?: number };
        const offset = (Number(page) - 1) * Number(limit);

        const [rows] = await db.query<RowDataPacket[]>(
          `SELECT n.*, u.username, u.full_name
           FROM notifications n
           LEFT JOIN users u ON n.user_id = u.id
           WHERE n.client_id = ?
           ORDER BY n.created_at DESC
           LIMIT ? OFFSET ?`,
          [clientId, Number(limit), offset]
        );

        const [countResult] = await db.query<RowDataPacket[]>(
          "SELECT COUNT(*) as total FROM notifications WHERE client_id = ?",
          [clientId]
        );

        return reply.code(200).send({
          data: rows,
          pagination: {
            total: countResult[0]?.total || 0,
            page: Number(page),
            limit: Number(limit),
            pages: Math.ceil((countResult[0]?.total || 0) / Number(limit)),
          },
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return reply.code(500).send({ error: "Failed to fetch notification history", details: msg });
      }
    }
  );

  // ─────────────────────────────────────────────────────
  // GET /api/notifications/targets
  // Get list of users with active FCM tokens (for individual targeting)
  // ─────────────────────────────────────────────────────
  server.get(
    "/targets",
    { preHandler: [server.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { clientId } = request.user!;

        const [rows] = await db.query<RowDataPacket[]>(
          `SELECT u.id, u.username, u.full_name, u.role,
                  u.linked_customer_id, u.linked_sales_rep_id, u.linked_supervisor_id,
                  c.name as customer_name, sr.name as sales_rep_name, sv.name as supervisor_name,
                  COUNT(f.token) as token_count
           FROM users u
           INNER JOIN fcm_tokens f ON f.user_id = u.id AND f.is_active = 1
           LEFT JOIN customers c ON u.linked_customer_id = c.id
           LEFT JOIN sales_reps sr ON u.linked_sales_rep_id = sr.id
           LEFT JOIN supervisors sv ON u.linked_supervisor_id = sv.id
           WHERE u.client_id = ? AND u.is_deleted = 0 AND u.is_active = 1
           GROUP BY u.id
           ORDER BY u.role, u.full_name`,
          [clientId]
        );

        return reply.code(200).send({ data: rows });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return reply.code(500).send({ error: "Failed to fetch targets", details: msg });
      }
    }
  );

  // ─────────────────────────────────────────────────────
  // GET /api/notifications/:id/reads
  // Get read stats for a specific notification (desktop)
  // ─────────────────────────────────────────────────────
  server.get(
    "/:id/reads",
    { preHandler: [server.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { clientId } = request.user!;
        const { id } = request.params as { id: string };

        // Verify notification belongs to client
        const [notifRows] = await db.query<RowDataPacket[]>(
          "SELECT id FROM notifications WHERE id = ? AND client_id = ?",
          [id, clientId]
        );
        if (notifRows.length === 0) return reply.code(404).send({ error: "Notification not found" });

        // Get all users who were sent this notification (via fcm_tokens at send time)
        // We approximate "sent_to" as users who have/had tokens for this client
        const [sentRows] = await db.query<RowDataPacket[]>(
          `SELECT DISTINCT f.user_id FROM fcm_tokens f WHERE f.client_id = ?`,
          [clientId]
        );

        // Get reads
        const [readRows] = await db.query<RowDataPacket[]>(
          `SELECT nr.user_id, nr.read_at, u.full_name, u.username, u.role
           FROM notification_reads nr
           JOIN users u ON u.id = nr.user_id
           WHERE nr.notification_id = ?
           ORDER BY nr.read_at ASC`,
          [id]
        );

        const sent_to = sentRows.length;
        const read_count = readRows.length;
        const unread_count = Math.max(0, sent_to - read_count);

        return reply.code(200).send({ sent_to, read_count, unread_count, reads: readRows });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return reply.code(500).send({ error: "Failed to fetch reads", details: msg });
      }
    }
  );

  // ─────────────────────────────────────────────────────
  // POST /api/notifications/:id/mark-read
  // Called by mobile app when user opens a notification
  // ─────────────────────────────────────────────────────
  server.post(
    "/:id/mark-read",
    { preHandler: [server.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { userId } = request.user!;
        const { id } = request.params as { id: string };

        await db.query(
          `INSERT IGNORE INTO notification_reads (id, notification_id, user_id)
           VALUES (?, ?, ?)`,
          [randomUUID(), id, userId]
        );

        // Also update legacy is_read flag
        await db.query(
          "UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?",
          [id, userId]
        );

        return reply.code(200).send({ success: true });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return reply.code(500).send({ error: "Failed to mark as read", details: msg });
      }
    }
  );

  // ─────────────────────────────────────────────────────
  // POST /api/notifications/upload-image
  // Upload an image and return its public URL
  // ─────────────────────────────────────────────────────
  server.post(
    "/upload-image",
    { preHandler: [server.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const data = await request.file();
        if (!data) return reply.code(400).send({ error: "No file uploaded" });

        const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
        if (!allowedTypes.includes(data.mimetype)) {
          return reply.code(400).send({ error: "Only JPEG, PNG, GIF, WEBP images are allowed" });
        }

        const uploadsDir = resolve(process.cwd(), "data/notification-images");
        if (!existsSync(uploadsDir)) await mkdir(uploadsDir, { recursive: true });

        const ext = extname(data.filename) || ".jpg";
        const filename = `${randomUUID()}${ext}`;
        const filePath = resolve(uploadsDir, filename);

        await pipeline(data.file, createWriteStream(filePath));

        // Return public URL using forwarded host/proto when behind reverse proxy
        const forwardedProto = (request.headers["x-forwarded-proto"] as string | undefined)
          ?.split(",")[0]
          ?.trim();
        const forwardedHost = (request.headers["x-forwarded-host"] as string | undefined)
          ?.split(",")[0]
          ?.trim();
        const protocol = forwardedProto || (request as any).protocol || "http";
        const host = forwardedHost || request.headers.host || `localhost:${process.env.PORT || 3030}`;
        const baseUrl = process.env.BASE_URL || `${protocol}://${host}`;
        const imageUrl = `${baseUrl}/uploads/notification-images/${filename}`;

        return reply.code(200).send({ imageUrl });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error({ error }, "Failed to upload notification image");
        return reply.code(500).send({ error: "Failed to upload image", details: msg });
      }
    }
  );

}
