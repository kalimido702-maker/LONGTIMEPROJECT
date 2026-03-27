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
              is_active, bot_enabled, last_reset_date, created_at, last_connected_at
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
      if ((updates as any).isActive !== undefined) {
        setClauses.push("is_active = ?");
        values.push((updates as any).isActive ? 1 : 0);
      }
      if ((updates as any).botEnabled !== undefined) {
        setClauses.push("bot_enabled = ?");
        values.push((updates as any).botEnabled ? 1 : 0);
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

    // جلب من DB أولاً لضمان البيانات مدمجة بعد إعادة تشغيل السيرفر
    try {
      const rows = await query<any>(
        `SELECT * FROM whatsapp_bot_settings WHERE client_id = ? LIMIT 1`,
        [String(clientId)],
      );
      if (rows[0]) {
        const dbSettings: BotSettings = {
          enabled: Boolean(rows[0].enabled),
          allowedSenders: rows[0].allowed_senders || 'all',
          welcomeMessage: rows[0].welcome_message || '',
          unknownCommandMessage: rows[0].unknown_command_message || '',
          companyInfo: rows[0].company_info || undefined,
        };
        // تحديث الذاكرة بالبيانات المحملة من DB
        saveBotSettings(String(clientId), dbSettings);
        return reply.send({ data: dbSettings });
      }
    } catch (dbErr) {
      logger.warn({ dbErr, clientId }, 'Failed to load bot settings from DB');
    }

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

      // حفظ في الذاكرة
      saveBotSettings(String(clientId), settings);

      // حفظ في DB ليبقى بعد إعادة تشغيل السيرفر
      try {
        await query(
          `INSERT INTO whatsapp_bot_settings
             (client_id, enabled, allowed_senders, welcome_message, unknown_command_message, company_info, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE
             enabled = VALUES(enabled),
             allowed_senders = VALUES(allowed_senders),
             welcome_message = VALUES(welcome_message),
             unknown_command_message = VALUES(unknown_command_message),
             company_info = VALUES(company_info),
             updated_at = NOW()`,
          [
            String(clientId),
            settings.enabled ? 1 : 0,
            settings.allowedSenders,
            settings.welcomeMessage,
            settings.unknownCommandMessage,
            settings.companyInfo || null,
          ],
        );
      } catch (dbErr) {
        logger.error({ dbErr, clientId }, 'Failed to persist bot settings to DB');
      }

      return reply.send({ message: "✅ تم حفظ الإعدادات" });
    },
  );
}
