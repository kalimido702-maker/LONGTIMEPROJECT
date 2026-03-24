/**
 * WhatsApp Connection Manager
 * إدارة اتصالات الواتساب باستخدام Baileys
 *
 * المسؤوليات:
 * - إنشاء وإدارة اتصالات الواتساب لكل حساب
 * - توليد QR codes وإرسالها عبر callback
 * - إعادة الاتصال التلقائي مع exponential backoff
 * - تخزين الجلسات في نظام الملفات
 */

import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import path from "path";
import fs from "fs";
import { AccountState, AccountStatus, ERROR_MESSAGES } from "./types.js";
import { logger } from "../../config/logger.js";

// ─── Constants ───────────────────────────────────────────────────

const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_SESSION_PATH = path.join(process.cwd(), "data", "wa_sessions");

// ─── Silent Logger for Baileys ───────────────────────────────────

const baileysLogger = {
  trace: () => {},
  debug: () => {},
  info: (...args: unknown[]) => logger.info({ source: "baileys" }, String(args[0])),
  warn: (...args: unknown[]) => logger.warn({ source: "baileys" }, String(args[0])),
  error: (...args: unknown[]) => logger.error({ source: "baileys" }, String(args[0])),
  fatal: (...args: unknown[]) => logger.error({ source: "baileys" }, String(args[0])),
  child: () => baileysLogger,
  level: "info",
};

// ─── Types ───────────────────────────────────────────────────────

interface ConnectionEntry {
  socket: WASocket;
  clientId: string;
  accountId: string;
  phone: string;
  reconnectAttempts: number;
  reconnectTimer?: ReturnType<typeof setTimeout>;
}

type StatusChangeCallback = (
  clientId: string,
  accountId: string,
  state: AccountState,
) => void;

type IncomingMessageCallback = (
  clientId: string,
  accountId: string,
  senderPhone: string,
  senderJid: string,
  messageText: string,
) => void;

// ─── Connection Manager ──────────────────────────────────────────

class WhatsAppConnectionManager {
  private connections = new Map<string, ConnectionEntry>();
  private accountStates = new Map<string, AccountState>();
  private onStatusChange: StatusChangeCallback | null = null;
  private onIncomingMessage: IncomingMessageCallback | null = null;

  /**
   * تسجيل callback لتغيير حالة الاتصال
   */
  setStatusChangeHandler(handler: StatusChangeCallback): void {
    this.onStatusChange = handler;
  }

  /**
   * تسجيل callback للرسائل الواردة
   */
  setIncomingMessageHandler(handler: IncomingMessageCallback): void {
    this.onIncomingMessage = handler;
  }

  /**
   * بدء اتصال واتساب لحساب معين
   */
  async connect(
    clientId: string,
    accountId: string,
    phone: string,
  ): Promise<{ success: boolean; message: string }> {
    const key = this.buildKey(clientId, accountId);

    // إلغاء أي محاولة إعادة اتصال معلقة
    this.cancelReconnect(key);

    // إغلاق أي اتصال سابق
    await this.closeSocket(key);

    try {
      const sessionPath = this.getSessionPath(clientId, accountId);
      fs.mkdirSync(sessionPath, { recursive: true });

      const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
      const { version } = await fetchLatestBaileysVersion();

      const sock = makeWASocket({
        version,
        logger: baileysLogger as any,
        printQRInTerminal: false,
        auth: state,
        browser: ["MASR POS Pro", "Chrome", "1.0.0"],
        generateHighQualityLinkPreview: true,
        connectTimeoutMs: 60_000,
        defaultQueryTimeoutMs: 60_000,
        retryRequestDelayMs: 250,
      });

      const entry: ConnectionEntry = {
        socket: sock,
        clientId,
        accountId,
        phone,
        reconnectAttempts: 0,
      };
      this.connections.set(key, entry);

      this.setupConnectionEvents(key, sock, saveCreds);

      this.updateState(key, {
        status: "connecting",
        phone,
        message: "🔄 جاري الاتصال بالواتساب...",
      });

      return { success: true, message: "🔄 جاري الاتصال بالواتساب..." };
    } catch (error) {
      logger.error({ error, clientId, accountId }, "Failed to initialize WhatsApp");
      const msg = this.getArabicError(error);
      this.updateState(key, { status: "failed", phone, error: msg, message: msg });
      return { success: false, message: msg };
    }
  }

  /**
   * قطع اتصال حساب (logout كامل)
   */
  async disconnect(clientId: string, accountId: string): Promise<void> {
    const key = this.buildKey(clientId, accountId);
    this.cancelReconnect(key);

    const entry = this.connections.get(key);
    if (entry) {
      this.removeListeners(entry.socket);
      try {
        await entry.socket.logout();
      } catch {
        // تجاهل أخطاء الـ logout
      }
      this.connections.delete(key);
      this.accountStates.delete(key);
    }
  }

  /**
   * إغلاق socket بدون logout (حفظ الجلسة)
   */
  async softDisconnect(clientId: string, accountId: string): Promise<void> {
    const key = this.buildKey(clientId, accountId);
    await this.closeSocket(key);
  }

  /**
   * الحصول على حالة حساب
   */
  getState(clientId: string, accountId: string): AccountState {
    const key = this.buildKey(clientId, accountId);
    return this.accountStates.get(key) ?? {
      status: "disconnected",
      message: "📵 الحساب غير متصل",
    };
  }

  /**
   * فحص اتصال حساب
   */
  isConnected(clientId: string, accountId: string): boolean {
    const key = this.buildKey(clientId, accountId);
    const entry = this.connections.get(key);
    return entry?.socket?.user !== undefined;
  }

  /**
   * الحصول على socket لإرسال الرسائل
   */
  getSocket(clientId: string, accountId: string): WASocket | null {
    const key = this.buildKey(clientId, accountId);
    return this.connections.get(key)?.socket ?? null;
  }

  /**
   * جلب مجموعات الواتساب
   */
  async getGroups(
    clientId: string,
    accountId: string,
  ): Promise<{ id: string; name: string }[]> {
    const sock = this.getSocket(clientId, accountId);
    if (!sock) return [];

    try {
      const groups = await sock.groupFetchAllParticipating();
      return Object.values(groups).map((g) => ({
        id: g.id,
        name: g.subject || "Unknown Group",
      }));
    } catch (error) {
      logger.error({ error, clientId, accountId }, "Failed to fetch groups");
      return [];
    }
  }

  /**
   * إغلاق كل الاتصالات (عند إيقاف السيرفر)
   */
  async shutdownAll(): Promise<void> {
    for (const [key, entry] of this.connections) {
      this.cancelReconnect(key);
      this.removeListeners(entry.socket);
      try {
        entry.socket.end(undefined);
      } catch {
        // تجاهل
      }
    }
    this.connections.clear();
    this.accountStates.clear();
    logger.info("All WhatsApp connections closed");
  }

  // ─── Private Methods ────────────────────────────────────────────

  private setupConnectionEvents(
    key: string,
    sock: WASocket,
    saveCreds: () => Promise<void>,
  ): void {
    const entry = this.connections.get(key);
    if (!entry) return;

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.updateState(key, {
          status: "qr",
          qrCode: qr,
          phone: entry.phone,
          message: "📱 امسح الكود ده من الموبايل",
        });
      }

      if (connection === "close") {
        this.handleDisconnect(key, lastDisconnect);
      } else if (connection === "open") {
        entry.reconnectAttempts = 0;
        const realPhone =
          sock.user?.id?.split(":")[0] ||
          sock.user?.id?.split("@")[0] ||
          entry.phone;

        this.updateState(key, {
          status: "connected",
          phone: realPhone,
          message: "✅ تم الاتصال بنجاح!",
        });

        logger.info(
          { clientId: entry.clientId, accountId: entry.accountId, phone: realPhone },
          "WhatsApp connected",
        );
      } else if (connection === "connecting") {
        this.updateState(key, {
          status: "connecting",
          phone: entry.phone,
          message: "🔄 جاري الاتصال...",
        });
      }
    });

    sock.ev.on("creds.update", saveCreds);

    // استقبال الرسائل الواردة
    sock.ev.on("messages.upsert", async (m) => {
      for (const msg of m.messages) {
        try {
          if (msg.key.fromMe) continue;
          if (msg.key.remoteJid === "status@broadcast") continue;
          if (msg.key.remoteJid?.endsWith("@g.us")) continue;

          const messageText =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            "";

          if (!messageText.trim()) continue;

          const senderJid = msg.key.remoteJid || "";
          const senderPhone = senderJid.replace("@s.whatsapp.net", "");

          logger.info(
            { clientId: entry.clientId, accountId: entry.accountId, from: senderPhone },
            "Incoming WhatsApp message",
          );

          this.onIncomingMessage?.(
            entry.clientId,
            entry.accountId,
            senderPhone,
            senderJid,
            messageText.trim(),
          );
        } catch (err) {
          logger.error({ error: err }, "Error processing incoming message");
        }
      }
    });
  }

  private handleDisconnect(key: string, lastDisconnect: any): void {
    const entry = this.connections.get(key);
    if (!entry) return;

    const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
    const errorMsg = (lastDisconnect?.error as Boom)?.message || "";
    const isConflict =
      statusCode === DisconnectReason.connectionReplaced ||
      errorMsg.includes("conflict");
    const isLoggedOut = statusCode === DisconnectReason.loggedOut;

    if (isLoggedOut) {
      this.connections.delete(key);
      this.updateState(key, {
        status: "disconnected",
        phone: entry.phone,
        error: ERROR_MESSAGES.ACCOUNT_LOGGED_OUT,
        message: ERROR_MESSAGES.ACCOUNT_LOGGED_OUT,
      });
      return;
    }

    if (isConflict) {
      this.connections.delete(key);
      this.updateState(key, {
        status: "disconnected",
        phone: entry.phone,
        error: "⚠️ تم الاتصال من جهاز آخر",
        message: "⚠️ تم الاتصال من جهاز آخر",
      });
      return;
    }

    // إعادة اتصال مع exponential backoff
    entry.reconnectAttempts++;
    if (entry.reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
      const delay = Math.min(3000 * Math.pow(2, entry.reconnectAttempts - 1), 60_000);
      logger.info(
        { key, attempt: entry.reconnectAttempts, delay },
        "Reconnecting WhatsApp",
      );
      this.updateState(key, {
        status: "connecting",
        phone: entry.phone,
        message: ERROR_MESSAGES.RECONNECTING,
      });
      entry.reconnectTimer = setTimeout(
        () => this.connect(entry.clientId, entry.accountId, entry.phone),
        delay,
      );
    } else {
      this.connections.delete(key);
      this.updateState(key, {
        status: "disconnected",
        phone: entry.phone,
        error: "❌ فشل الاتصال بعد عدة محاولات",
        message: "❌ فشل الاتصال - اضغط اتصال لإعادة المحاولة",
      });
    }
  }

  private updateState(key: string, state: AccountState): void {
    this.accountStates.set(key, state);

    const [clientId, accountId] = key.split(":");
    this.onStatusChange?.(clientId, accountId, state);
  }

  private async closeSocket(key: string): Promise<void> {
    const entry = this.connections.get(key);
    if (!entry) return;

    this.removeListeners(entry.socket);
    try {
      entry.socket.end(undefined);
    } catch {
      // تجاهل
    }
    this.connections.delete(key);
    this.accountStates.delete(key);
  }

  private cancelReconnect(key: string): void {
    const entry = this.connections.get(key);
    if (entry?.reconnectTimer) {
      clearTimeout(entry.reconnectTimer);
      entry.reconnectTimer = undefined;
    }
  }

  private removeListeners(sock: WASocket): void {
    try {
      sock.ev.removeAllListeners("connection.update");
      sock.ev.removeAllListeners("creds.update");
      sock.ev.removeAllListeners("messages.upsert");
    } catch {
      // تجاهل
    }
  }

  private buildKey(clientId: string, accountId: string): string {
    return `${clientId}:${accountId}`;
  }

  private getSessionPath(clientId: string, accountId: string): string {
    return path.join(BASE_SESSION_PATH, clientId, accountId);
  }

  private getArabicError(error: unknown): string {
    const msg = (error as Error)?.message?.toLowerCase() ?? "";

    if (msg.includes("timed out") || msg.includes("timeout"))
      return ERROR_MESSAGES.CONNECTION_TIMEOUT;
    if (msg.includes("not connected") || msg.includes("no connection"))
      return ERROR_MESSAGES.NO_CONNECTION;
    if (msg.includes("connection closed") || msg.includes("connection failed"))
      return ERROR_MESSAGES.CONNECTION_FAILED;
    if (msg.includes("network") || msg.includes("fetch"))
      return "🌐 مفيش إنترنت - تأكد من الاتصال";

    return ERROR_MESSAGES.UNKNOWN_ERROR;
  }
}

export const connectionManager = new WhatsAppConnectionManager();
