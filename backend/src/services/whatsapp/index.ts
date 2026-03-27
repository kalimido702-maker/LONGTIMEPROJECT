/**
 * WhatsApp Service - Entry Point
 * الواجهة الرئيسية لخدمة الواتساب على السيرفر
 *
 * يربط بين:
 * - ConnectionManager: إدارة الاتصالات
 * - MessageService: إرسال الرسائل
 * - BotService: الرد التلقائي
 * - WebSocket: إرسال الأحداث في الوقت الحقيقي للعملاء
 */

import { connectionManager } from "./ConnectionManager.js";
import { messageService } from "./MessageService.js";
import { handleBotMessage, getBotSettings, saveBotSettings } from "./BotService.js";
import { logger } from "../../config/logger.js";
import { query } from "../../config/database-factory.js";
import type { AccountState, BotSettings, IntentType, IntentResult } from "./types.js";

// Re-export AI intent types
export type { IntentType, IntentResult };

// ─── WebSocket Broadcaster ───────────────────────────────────────

type BroadcastFn = (clientId: string, event: string, data: unknown) => void;

let broadcastToClient: BroadcastFn | null = null;

/**
 * تسجيل دالة البث عبر WebSocket
 */
export function setBroadcaster(fn: BroadcastFn): void {
  broadcastToClient = fn;
}

// ─── Initialize ──────────────────────────────────────────────────

/**
 * تهيئة خدمة الواتساب - يتم استدعاؤها مرة واحدة عند بدء السيرفر
 */
export function initializeWhatsAppService(): void {
  // ربط أحداث تغيير الحالة
  connectionManager.setStatusChangeHandler(
    async (clientId: string, accountId: string, state: AccountState) => {
      logger.info(
        { clientId, accountId, status: state.status },
        "WhatsApp status changed",
      );

      // حفظ الحالة في قاعدة البيانات
      try {
        if (state.status === "connected") {
          await query(
            "UPDATE whatsapp_accounts SET status = 'connected', last_connected_at = NOW(), updated_at = NOW() WHERE id = ? AND client_id = ?",
            [accountId, clientId],
          );
        } else if (state.status === "disconnected" || state.status === "failed") {
          await query(
            "UPDATE whatsapp_accounts SET status = ?, updated_at = NOW() WHERE id = ? AND client_id = ?",
            [state.status, accountId, clientId],
          );
        } else if (state.status === "connecting" || state.status === "qr") {
          await query(
            "UPDATE whatsapp_accounts SET status = ?, updated_at = NOW() WHERE id = ? AND client_id = ?",
            [state.status, accountId, clientId],
          );
        }
      } catch (dbError) {
        logger.error({ dbError, clientId, accountId }, "Failed to persist WhatsApp status to DB");
      }

      // بث الحدث للعميل عبر WebSocket
      broadcastToClient?.(clientId, "whatsapp:status", {
        accountId,
        ...state,
      });
    },
  );

  // ربط معالج الرسائل الواردة (Bot)
  connectionManager.setIncomingMessageHandler(
    async (
      clientId: string,
      accountId: string,
      senderPhone: string,
      senderJid: string,
      messageText: string,
    ) => {
      logger.info(
        { clientId, accountId, from: senderPhone, text: messageText.slice(0, 50) },
        "INDEX_DEBUG: Incoming message handler called",
      );

      // بث الرسالة الواردة للعميل
      broadcastToClient?.(clientId, "whatsapp:bot-incoming", {
        accountId,
        senderPhone,
        senderJid,
        messageText,
        timestamp: new Date().toISOString(),
      });

      // التحقق من تفعيل البوت لهذا الحساب تحديداً
      try {
        const accRows = await query<{ bot_enabled: number }>(
          "SELECT bot_enabled FROM whatsapp_accounts WHERE id = ? AND client_id = ? AND is_deleted = 0 LIMIT 1",
          [accountId, clientId],
        );
        if (accRows.length === 0) {
          logger.warn({ clientId, accountId }, "Account not found - skipping bot");
          return;
        }
        if (!accRows[0].bot_enabled) {
          logger.info({ clientId, accountId }, "Bot disabled for this account - skipping");
          return;
        }
      } catch (checkErr) {
        logger.error({ checkErr, clientId, accountId }, "Failed to check account bot_enabled - skipping bot for safety");
        return;
      }

      // معالجة البوت
      try {
        logger.info({ clientId, senderPhone, messageText }, "INDEX_DEBUG: Calling handleBotMessage");
        
        const reply = await handleBotMessage(clientId, null, senderPhone, messageText);
        
        logger.info({ clientId, senderPhone, reply }, "INDEX_DEBUG: handleBotMessage returned");

        if (!reply) {
          logger.warn({ clientId, senderPhone }, "INDEX_DEBUG: handleBotMessage returned null - no reply will be sent");
          return;
        }

        // إرسال الرد
        if (reply.media) {
          // رد مع ملف
          await messageService.sendDirect(clientId, accountId, senderJid, reply.text);
          await messageService.sendDirect(clientId, accountId, senderJid, "", {
            type: "document",
            data: reply.media.base64,
            filename: reply.media.filename,
            caption: reply.media.caption,
          });
        } else {
          logger.info({ clientId, accountId, to: senderJid, text: reply.text }, "INDEX_DEBUG: Sending reply via messageService.sendDirect");
          await messageService.sendDirect(clientId, accountId, senderJid, reply.text);
        }

        logger.info(
          { clientId, accountId, to: senderPhone },
          "Bot reply sent",
        );
      } catch (error) {
        logger.error({ error, clientId, senderPhone }, "Bot reply failed");
      }
    },
  );

  // بدء معالج قائمة الانتظار
  messageService.start();

  logger.info("✅ WhatsApp service initialized");
}

/**
 * إيقاف خدمة الواتساب - عند إيقاف السيرفر
 */
export async function shutdownWhatsAppService(): Promise<void> {
  messageService.stop();
  await connectionManager.shutdownAll();
  logger.info("WhatsApp service shut down");
}

// ─── Re-exports ──────────────────────────────────────────────────

export { connectionManager } from "./ConnectionManager.js";
export { messageService } from "./MessageService.js";
export { getBotSettings, saveBotSettings } from "./BotService.js";
export type {
  WhatsAppAccount,
  AccountState,
  SendMessageRequest,
  SendResult,
  QueuedMessage,
  Campaign,
  BotSettings,
  MediaPayload,
  MessageMetadata,
} from "./types.js";
