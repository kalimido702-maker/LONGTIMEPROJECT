/**
 * WhatsApp Message Service
 * خدمة إرسال الرسائل وإدارة قائمة الانتظار
 *
 * المسؤوليات:
 * - إرسال رسائل نصية و ميديا
 * - قائمة انتظار ذكية مع retry
 * - التحقق من الأرقام
 * - Rate limiting (حد يومي + تأخير مكافح للسبام)
 */

import { connectionManager } from "./ConnectionManager.js";
import { query } from "../../config/database-factory.js";
import { logger } from "../../config/logger.js";
import {
  SendMessageRequest,
  SendResult,
  QueuedMessage,
  ERROR_MESSAGES,
} from "./types.js";

// ─── Message Service ─────────────────────────────────────────────

class WhatsAppMessageService {
  private queues = new Map<string, QueuedMessage[]>(); // clientId → messages
  private processing = new Set<string>(); // clientIds currently being processed
  private processingInterval?: ReturnType<typeof setInterval>;

  /**
   * بدء معالج قائمة الانتظار
   */
  start(): void {
    this.processingInterval = setInterval(() => this.processQueues(), 2000);
    logger.info("WhatsApp message queue processor started");
  }

  /**
   * إيقاف المعالج
   */
  stop(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }
  }

  /**
   * إرسال رسالة (تضاف للقائمة)
   */
  async enqueue(clientId: string, request: SendMessageRequest): Promise<string> {
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const formattedTo = this.formatPhoneNumber(request.to);

    const queued: QueuedMessage = {
      id: messageId,
      clientId,
      accountId: request.accountId,
      to: formattedTo,
      message: request.message,
      media: request.media,
      metadata: request.metadata,
      status: "pending",
      retries: 0,
      createdAt: new Date().toISOString(),
    };

    const queue = this.queues.get(clientId) ?? [];
    queue.push(queued);
    this.queues.set(clientId, queue);

    return messageId;
  }

  /**
   * إرسال رسالة فوري (بدون قائمة انتظار)
   */
  async sendDirect(
    clientId: string,
    accountId: string,
    to: string,
    message: string,
    media?: SendMessageRequest["media"],
  ): Promise<SendResult> {
    const formattedTo = this.formatPhoneNumber(to);
    return this.send(clientId, accountId, formattedTo, message, media);
  }

  /**
   * الحصول على حالة قائمة الانتظار
   */
  getQueueStatus(clientId: string): {
    pending: number;
    sending: number;
    sent: number;
    failed: number;
    messages: QueuedMessage[];
  } {
    const queue = this.queues.get(clientId) ?? [];
    return {
      pending: queue.filter((m) => m.status === "pending").length,
      sending: queue.filter((m) => m.status === "sending").length,
      sent: queue.filter((m) => m.status === "sent").length,
      failed: queue.filter((m) => m.status === "failed").length,
      messages: queue.slice(-100), // آخر 100 رسالة
    };
  }

  /**
   * تنظيف الرسائل القديمة من القائمة
   */
  cleanup(clientId: string): void {
    const queue = this.queues.get(clientId);
    if (!queue) return;

    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    const cleaned = queue.filter((m) => {
      if (m.status === "pending" || m.status === "sending") return true;
      const ts = new Date(m.sentAt ?? m.createdAt).getTime();
      return ts > twoHoursAgo;
    });

    this.queues.set(clientId, cleaned);
  }

  // ─── Private ─────────────────────────────────────────────────────

  private async processQueues(): Promise<void> {
    for (const [clientId, queue] of this.queues) {
      if (this.processing.has(clientId)) continue;

      const pending = queue.find((m) => m.status === "pending");
      if (!pending) continue;

      this.processing.add(clientId);
      try {
        await this.processMessage(clientId, pending);
      } finally {
        this.processing.delete(clientId);
      }
    }
  }

  private async processMessage(clientId: string, msg: QueuedMessage): Promise<void> {
    // التحقق من الحد اليومي
    const limitOk = await this.checkDailyLimit(clientId, msg.accountId);
    if (!limitOk) {
      msg.status = "failed";
      msg.error = ERROR_MESSAGES.DAILY_LIMIT_REACHED;
      return;
    }

    // التحقق من الاتصال
    if (!connectionManager.isConnected(clientId, msg.accountId)) {
      msg.retries++;
      if (msg.retries >= 3) {
        msg.status = "failed";
        msg.error = ERROR_MESSAGES.NO_CONNECTION;
      }
      return;
    }

    // مكافحة السبام - تأخير بين الرسائل
    const delay = await this.getAntiSpamDelay(clientId, msg.accountId);
    if (delay > 0) {
      await new Promise((r) => setTimeout(r, delay));
    }

    msg.status = "sending";
    const result = await this.send(clientId, msg.accountId, msg.to, msg.message, msg.media);

    if (result.success) {
      msg.status = "sent";
      msg.sentAt = new Date().toISOString();
      await this.incrementDailySent(clientId, msg.accountId);
    } else {
      msg.retries++;
      if (msg.retries >= 3) {
        msg.status = "failed";
        msg.error = result.message;
      } else {
        msg.status = "pending"; // retry
      }
    }
  }

  private async send(
    clientId: string,
    accountId: string,
    to: string,
    message: string,
    media?: SendMessageRequest["media"],
  ): Promise<SendResult> {
    const sock = connectionManager.getSocket(clientId, accountId);
    if (!sock) {
      return { success: false, message: ERROR_MESSAGES.NO_CONNECTION };
    }

    try {
      const isGroup = to.includes("@g.us");
      let formattedNumber = to;

      // التحقق من صحة الرقم (لغير المجموعات)
      if (!isGroup && !to.includes("@")) {
        const cleanedNumber = to.replace(/\D/g, "");

        if (cleanedNumber.length < 10) {
          return { success: false, message: ERROR_MESSAGES.INVALID_NUMBER };
        }

        // فحص هل الرقم موجود على واتساب
        try {
          const results = await sock.onWhatsApp(cleanedNumber);
          if (results?.[0]) {
            if (!results[0].exists) {
              return { success: false, message: ERROR_MESSAGES.NUMBER_NOT_ON_WHATSAPP };
            }
            if (results[0].jid) {
              formattedNumber = results[0].jid;
            }
          }
        } catch {
          // نكمل حتى لو فشل الفحص
          formattedNumber = `${cleanedNumber}@s.whatsapp.net`;
        }

        if (!formattedNumber.includes("@")) {
          formattedNumber = `${cleanedNumber}@s.whatsapp.net`;
        }
      }

      // إرسال حسب نوع الرسالة
      const sendPromise = media
        ? this.sendMedia(sock, formattedNumber, message, media)
        : sock.sendMessage(formattedNumber, { text: message });

      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timed out")), media ? 60_000 : 30_000),
      );

      await Promise.race([sendPromise, timeout]);

      return { success: true, message: "✅ تم إرسال الرسالة بنجاح" };
    } catch (error) {
      logger.error({ error, to }, "Failed to send WhatsApp message");
      return { success: false, message: this.getArabicError(error) };
    }
  }

  private async sendMedia(
    sock: any,
    to: string,
    caption: string,
    media: SendMessageRequest["media"],
  ): Promise<void> {
    if (!media) return;

    // حل base64
    let buffer: Buffer;
    if (media.data.startsWith("data:")) {
      const match = media.data.match(/^data:[^;]+;base64,(.+)$/);
      if (!match) throw new Error("Invalid data URL");
      buffer = Buffer.from(match[1], "base64");
    } else {
      buffer = Buffer.from(media.data, "base64");
    }

    // فحص الحجم (16MB max)
    if (buffer.length > 16 * 1024 * 1024) {
      throw new Error(ERROR_MESSAGES.MEDIA_TOO_LARGE);
    }

    const content: Record<string, unknown> = {};
    switch (media.type) {
      case "image":
        content.image = buffer;
        content.caption = caption || media.caption || "";
        break;
      case "document":
        content.document = buffer;
        content.fileName = media.filename || "document.pdf";
        content.caption = caption || media.caption || "";
        break;
      case "video":
        content.video = buffer;
        content.caption = caption || media.caption || "";
        break;
    }

    await sock.sendMessage(to, content);
  }

  private async checkDailyLimit(clientId: string, accountId: string): Promise<boolean> {
    try {
      const rows = await query<{ daily_sent: number; daily_limit: number; last_reset_date: string }>(
        `SELECT daily_sent, daily_limit, last_reset_date FROM whatsapp_accounts 
         WHERE id = ? AND client_id = ? AND is_deleted = 0 LIMIT 1`,
        [accountId, clientId],
      );

      if (rows.length === 0) return false;

      const account = rows[0];
      const lastReset = new Date(account.last_reset_date);
      const now = new Date();

      // إعادة ضبط العداد اليومي
      if (
        now.getDate() !== lastReset.getDate() ||
        now.getMonth() !== lastReset.getMonth()
      ) {
        await query(
          "UPDATE whatsapp_accounts SET daily_sent = 0, last_reset_date = NOW() WHERE id = ?",
          [accountId],
        );
        return true;
      }

      return (account.daily_sent ?? 0) < (account.daily_limit ?? 500);
    } catch {
      return true; // نكمل في حالة خطأ DB
    }
  }

  private async incrementDailySent(clientId: string, accountId: string): Promise<void> {
    try {
      await query(
        "UPDATE whatsapp_accounts SET daily_sent = daily_sent + 1 WHERE id = ? AND client_id = ?",
        [accountId, clientId],
      );
    } catch {
      // تجاهل
    }
  }

  private async getAntiSpamDelay(clientId: string, accountId: string): Promise<number> {
    try {
      const rows = await query<{ anti_spam_delay: number }>(
        "SELECT anti_spam_delay FROM whatsapp_accounts WHERE id = ? AND client_id = ? LIMIT 1",
        [accountId, clientId],
      );
      return rows[0]?.anti_spam_delay ?? 2000;
    } catch {
      return 2000;
    }
  }

  private formatPhoneNumber(phone: string): string {
    // مجموعة واتساب - نتركها كما هي
    if (phone.includes("@g.us") || phone.includes("@s.whatsapp.net")) {
      return phone;
    }

    let cleaned = phone.replace(/\D/g, "");

    // إزالة الصفر من الأول (أرقام مصرية)
    if (cleaned.startsWith("0") && !cleaned.startsWith("00")) {
      cleaned = cleaned.substring(1);
    }

    // إضافة كود مصر لو مش موجود
    if (!cleaned.startsWith("20")) {
      cleaned = "20" + cleaned;
    }

    return cleaned;
  }

  private getArabicError(error: unknown): string {
    const msg = (error as Error)?.message?.toLowerCase() ?? "";

    if (msg.includes("timed out") || msg.includes("timeout"))
      return ERROR_MESSAGES.SEND_TIMEOUT;
    if (msg.includes("not connected"))
      return ERROR_MESSAGES.NO_CONNECTION;
    if (msg.includes("invalid") && msg.includes("number"))
      return ERROR_MESSAGES.INVALID_NUMBER;
    if (msg.includes("not on whatsapp") || msg.includes("not registered"))
      return ERROR_MESSAGES.NUMBER_NOT_ON_WHATSAPP;
    if (msg.includes("too large") || msg.includes("size"))
      return ERROR_MESSAGES.MEDIA_TOO_LARGE;
    if (msg.includes("media") || msg.includes("file"))
      return ERROR_MESSAGES.MEDIA_FAILED;

    return ERROR_MESSAGES.SEND_FAILED;
  }
}

export const messageService = new WhatsAppMessageService();
