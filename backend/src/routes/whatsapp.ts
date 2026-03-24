/**
 * WhatsApp API Routes
 * نقاط نهاية REST API لخدمة الواتساب
 *
 * كل الطلبات تتطلب مصادقة (JWT token)
 * البيانات مقيدة بـ clientId المستخرج من التوكن
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { query } from "../config/database-factory.js";
import { logger } from "../config/logger.js";
import {
  connectionManager,
  messageService,
  getBotSettings,
  saveBotSettings,
} from "../services/whatsapp/index.js";
import type {
  SendMessageRequest,
  MediaPayload,
  BotSettings,
} from "../services/whatsapp/types.js";

// ─── Request Types ───────────────────────────────────────────────

interface AccountParams {
  accountId: string;
}

interface CreateAccountBody {
  id?: string;
  name: string;
  phone: string;
  dailyLimit?: number;
  antiSpamDelay?: number;
}

interface ConnectBody {
  phone?: string;
}

interface SendMessageBody {
  accountId: string;
  to: string;
  message: string;
  media?: MediaPayload;
  metadata?: SendMessageRequest["metadata"];
}

interface SendDirectBody {
  accountId: string;
  to: string;
  message: string;
  media?: MediaPayload;
}

// ─── Routes ──────────────────────────────────────────────────────

export async function whatsappRoutes(server: FastifyInstance): Promise<void> {
  // كل الطلبات تتطلب مصادقة
  server.addHook("preHandler", server.authenticate);

  // ──────────────────────────────────────────────────────────────
  // حسابات الواتساب
  // ──────────────────────────────────────────────────────────────

  /**
   * GET /accounts - قائمة حسابات الواتساب
   */
  server.get("/accounts", async (request: FastifyRequest, reply: FastifyReply) => {
    const { clientId, branchId } = request.user!;

    const rows = await query<any>(
      `SELECT id, name, phone, status, daily_limit, daily_sent, anti_spam_delay,
              is_active, last_reset_date, created_at, last_connected_at
       FROM whatsapp_accounts
       WHERE client_id = ? AND is_deleted = 0
       ORDER BY created_at DESC`,
      [clientId],
    );

    // إضافة حالة الاتصال الحقيقية
    const accounts = rows.map((row: any) => ({
      ...row,
      liveStatus: connectionManager.getState(String(clientId), row.id),
      isConnected: connectionManager.isConnected(String(clientId), row.id),
    }));

    return reply.send({ data: accounts });
  });

  /**
   * POST /accounts - إضافة حساب جديد
   */
  server.post<{ Body: CreateAccountBody }>(
    "/accounts",
    async (request, reply) => {
      const { clientId, branchId } = request.user!;
      const { name, phone, dailyLimit = 500, antiSpamDelay = 2000 } = request.body;

      if (!name || !phone) {
        return reply.code(400).send({ error: "الاسم والرقم مطلوبين" });
      }

      const id = request.body.id || `wa_${Date.now()}`;

      await query(
        `INSERT INTO whatsapp_accounts 
         (id, client_id, branch_id, name, phone, status, daily_limit, daily_sent,
          anti_spam_delay, is_active, last_reset_date, created_at)
         VALUES (?, ?, ?, ?, ?, 'disconnected', ?, 0, ?, 1, NOW(), NOW())`,
        [id, clientId, branchId, name, phone, dailyLimit, antiSpamDelay],
      );

      return reply.code(201).send({
        data: { id, name, phone, status: "disconnected", dailyLimit, antiSpamDelay },
        message: "✅ تم إضافة الحساب",
      });
    },
  );

  /**
   * PUT /accounts/:accountId - تعديل حساب
   */
  server.put<{ Params: AccountParams; Body: Partial<CreateAccountBody> }>(
    "/accounts/:accountId",
    async (request, reply) => {
      const { clientId } = request.user!;
      const { accountId } = request.params;
      const updates = request.body;

      const setClauses: string[] = [];
      const values: any[] = [];

      if (updates.name !== undefined) {
        setClauses.push("name = ?");
        values.push(updates.name);
      }
      if (updates.phone !== undefined) {
        setClauses.push("phone = ?");
        values.push(updates.phone);
      }
      if (updates.dailyLimit !== undefined) {
        setClauses.push("daily_limit = ?");
        values.push(updates.dailyLimit);
      }
      if (updates.antiSpamDelay !== undefined) {
        setClauses.push("anti_spam_delay = ?");
        values.push(updates.antiSpamDelay);
      }

      if (setClauses.length === 0) {
        return reply.code(400).send({ error: "لا توجد بيانات للتعديل" });
      }

      setClauses.push("updated_at = NOW()");
      values.push(accountId, clientId);

      await query(
        `UPDATE whatsapp_accounts SET ${setClauses.join(", ")} WHERE id = ? AND client_id = ?`,
        values,
      );

      return reply.send({ message: "✅ تم التعديل" });
    },
  );

  /**
   * DELETE /accounts/:accountId - حذف حساب
   */
  server.delete<{ Params: AccountParams }>(
    "/accounts/:accountId",
    async (request, reply) => {
      const { clientId } = request.user!;
      const { accountId } = request.params;

      // قطع الاتصال أولاً
      try {
        await connectionManager.disconnect(String(clientId), accountId);
      } catch {
        // تجاهل
      }

      await query(
        "UPDATE whatsapp_accounts SET is_deleted = 1, updated_at = NOW() WHERE id = ? AND client_id = ?",
        [accountId, clientId],
      );

      return reply.send({ message: "✅ تم حذف الحساب" });
    },
  );

  // ──────────────────────────────────────────────────────────────
  // الاتصال والقطع
  // ──────────────────────────────────────────────────────────────

  /**
   * POST /accounts/:accountId/connect - بدء اتصال الواتساب
   * ← QR code يتم إرساله عبر WebSocket
   */
  server.post<{ Params: AccountParams; Body: ConnectBody }>(
    "/accounts/:accountId/connect",
    async (request, reply) => {
      const { clientId } = request.user!;
      const { accountId } = request.params;

      // جلب بيانات الحساب
      const rows = await query<any>(
        "SELECT phone FROM whatsapp_accounts WHERE id = ? AND client_id = ? AND is_deleted = 0 LIMIT 1",
        [accountId, clientId],
      );

      if (rows.length === 0) {
        return reply.code(404).send({ error: "الحساب غير موجود" });
      }

      const phone = request.body?.phone || rows[0].phone;
      const result = await connectionManager.connect(String(clientId), accountId, phone);

      return reply.send(result);
    },
  );

  /**
   * POST /accounts/:accountId/disconnect - قطع اتصال (logout)
   */
  server.post<{ Params: AccountParams }>(
    "/accounts/:accountId/disconnect",
    async (request, reply) => {
      const { clientId } = request.user!;
      const { accountId } = request.params;

      await connectionManager.disconnect(String(clientId), accountId);

      await query(
        "UPDATE whatsapp_accounts SET status = 'disconnected', updated_at = NOW() WHERE id = ? AND client_id = ?",
        [accountId, clientId],
      );

      return reply.send({ message: "✅ تم قطع الاتصال" });
    },
  );

  /**
   * GET /accounts/:accountId/status - حالة الاتصال (+ QR)
   */
  server.get<{ Params: AccountParams }>(
    "/accounts/:accountId/status",
    async (request, reply) => {
      const { clientId } = request.user!;
      const { accountId } = request.params;

      const state = connectionManager.getState(String(clientId), accountId);
      return reply.send({ data: state });
    },
  );

  /**
   * GET /accounts/:accountId/groups - مجموعات الواتساب
   */
  server.get<{ Params: AccountParams }>(
    "/accounts/:accountId/groups",
    async (request, reply) => {
      const { clientId } = request.user!;
      const { accountId } = request.params;

      const groups = await connectionManager.getGroups(String(clientId), accountId);
      return reply.send({ data: groups });
    },
  );

  // ──────────────────────────────────────────────────────────────
  // إرسال الرسائل
  // ──────────────────────────────────────────────────────────────

  /**
   * POST /messages/send - إضافة رسالة لقائمة الانتظار
   */
  server.post<{ Body: SendMessageBody }>(
    "/messages/send",
    async (request, reply) => {
      const { clientId } = request.user!;
      const { accountId, to, message, media, metadata } = request.body;

      if (!accountId || !to || (!message && !media)) {
        return reply.code(400).send({ error: "بيانات ناقصة" });
      }

      const messageId = await messageService.enqueue(String(clientId), {
        accountId,
        to,
        message,
        media,
        metadata,
      });

      return reply.send({
        data: { messageId },
        message: "✅ تمت إضافة الرسالة للقائمة",
      });
    },
  );

  /**
   * POST /messages/send-direct - إرسال رسالة مباشرة (بدون قائمة)
   */
  server.post<{ Body: SendDirectBody }>(
    "/messages/send-direct",
    async (request, reply) => {
      const { clientId } = request.user!;
      const { accountId, to, message, media } = request.body;

      if (!accountId || !to || (!message && !media)) {
        return reply.code(400).send({ error: "بيانات ناقصة" });
      }

      const result = await messageService.sendDirect(
        String(clientId),
        accountId,
        to,
        message,
        media,
      );

      const statusCode = result.success ? 200 : 422;
      return reply.code(statusCode).send(result);
    },
  );

  /**
   * GET /messages/queue - حالة قائمة الانتظار
   */
  server.get("/messages/queue", async (request: FastifyRequest, reply: FastifyReply) => {
    const { clientId } = request.user!;
    const status = messageService.getQueueStatus(String(clientId));
    return reply.send({ data: status });
  });

  // ──────────────────────────────────────────────────────────────
  // إعدادات البوت
  // ──────────────────────────────────────────────────────────────

  /**
   * GET /bot/settings - إعدادات البوت
   */
  server.get("/bot/settings", async (request: FastifyRequest, reply: FastifyReply) => {
    const { clientId } = request.user!;
    const settings = getBotSettings(String(clientId));
    return reply.send({ data: settings });
  });

  /**
   * PUT /bot/settings - تعديل إعدادات البوت
   */
  server.put<{ Body: BotSettings }>(
    "/bot/settings",
    async (request, reply) => {
      const { clientId } = request.user!;
      const settings = request.body;

      saveBotSettings(String(clientId), settings);
      return reply.send({ message: "✅ تم حفظ الإعدادات" });
    },
  );
}
