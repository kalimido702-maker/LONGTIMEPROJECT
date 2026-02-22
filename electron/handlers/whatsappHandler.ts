import { ipcMain, BrowserWindow } from "electron";
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  proto,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import path from "path";
import { app } from "electron";

// Store active WhatsApp connections
const activeSockets = new Map<string, WASocket>();
const accountStates = new Map<string, any>();

// Track reconnect attempts per account to prevent infinite loops
const reconnectAttempts = new Map<string, number>();
const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
const MAX_RECONNECT_ATTEMPTS = 5;

// Reference to main window for forwarding bot messages
let mainWindowRef: BrowserWindow | null = null;

// Bot enabled state (synced from renderer)
let botEnabled = true;

// Simple logger replacement (avoiding pino issues)
const logger = {
  trace: (...args: any[]) => { }, // Silent trace logging
  debug: (...args: any[]) => { }, // Silent debug logging
  info: (...args: any[]) => console.log("[WhatsApp]", ...args),
  warn: (...args: any[]) => console.warn("[WhatsApp]", ...args),
  error: (...args: any[]) => console.error("[WhatsApp]", ...args),
  fatal: (...args: any[]) => console.error("[WhatsApp FATAL]", ...args),
  child: () => logger,
  level: "info", // Minimum log level
};

/**
 * رسائل الأخطاء بالعربي للمستخدم
 */
const ERROR_MESSAGES = {
  // أخطاء الاتصال
  CONNECTION_TIMEOUT: "⏱️ انتهت مهلة الاتصال - جرب مرة تانية",
  CONNECTION_FAILED: "❌ فشل الاتصال - تأكد من الإنترنت وجرب تاني",
  NO_CONNECTION: "📵 الحساب مش متصل - اربط الحساب الأول",
  RECONNECTING: "🔄 جاري إعادة الاتصال...",

  // أخطاء إرسال الرسائل
  SEND_FAILED: "❌ فشل إرسال الرسالة - جرب مرة تانية",
  SEND_TIMEOUT: "⏱️ الرسالة أخذت وقت طويل - الإنترنت بطيء",
  INVALID_NUMBER: "📱 رقم الهاتف غلط - تأكد من الرقم",
  NUMBER_NOT_ON_WHATSAPP: "📱 الرقم ده مش على واتساب",

  // أخطاء الميديا
  MEDIA_FAILED: "🖼️ فشل إرسال الصورة/الملف",
  MEDIA_TOO_LARGE: "📁 الملف كبير جداً - أقصى حجم 16 ميجا",
  MEDIA_DOWNLOAD_FAILED: "⬇️ فشل تحميل الملف",

  // أخطاء عامة
  UNKNOWN_ERROR: "⚠️ حصل خطأ - جرب مرة تانية",
  ACCOUNT_LOGGED_OUT: "🔐 تم تسجيل الخروج - اربط الحساب من جديد",
  SESSION_EXPIRED: "🔑 الجلسة انتهت - امسح QR Code من جديد",

  // أخطاء الشبكة
  NO_INTERNET: "🌐 مفيش إنترنت - تأكد من الاتصال",
  SLOW_INTERNET: "🐌 الإنترنت بطيء جداً",
};

/**
 * تحويل الخطأ لرسالة مفهومة
 */
function getArabicErrorMessage(error: any): string {
  const errorMessage = error?.message?.toLowerCase() || "";
  const statusCode =
    error?.output?.statusCode || error?.data?.output?.statusCode;

  // Timeout errors
  if (
    errorMessage.includes("timed out") ||
    errorMessage.includes("timeout") ||
    statusCode === 408
  ) {
    return ERROR_MESSAGES.SEND_TIMEOUT;
  }

  // Connection errors
  if (
    errorMessage.includes("not connected") ||
    errorMessage.includes("no connection")
  ) {
    return ERROR_MESSAGES.NO_CONNECTION;
  }

  if (
    errorMessage.includes("connection closed") ||
    errorMessage.includes("connection failed")
  ) {
    return ERROR_MESSAGES.CONNECTION_FAILED;
  }

  // Number errors
  if (errorMessage.includes("invalid") && errorMessage.includes("number")) {
    return ERROR_MESSAGES.INVALID_NUMBER;
  }

  if (
    errorMessage.includes("not on whatsapp") ||
    errorMessage.includes("not registered")
  ) {
    return ERROR_MESSAGES.NUMBER_NOT_ON_WHATSAPP;
  }

  // Session errors
  if (statusCode === DisconnectReason.loggedOut) {
    return ERROR_MESSAGES.ACCOUNT_LOGGED_OUT;
  }

  // Media errors
  if (errorMessage.includes("media") || errorMessage.includes("file")) {
    if (errorMessage.includes("too large") || errorMessage.includes("size")) {
      return ERROR_MESSAGES.MEDIA_TOO_LARGE;
    }
    return ERROR_MESSAGES.MEDIA_FAILED;
  }

  // Network errors
  if (errorMessage.includes("network") || errorMessage.includes("fetch")) {
    return ERROR_MESSAGES.NO_INTERNET;
  }

  return ERROR_MESSAGES.UNKNOWN_ERROR;
}

/**
 * Get session directory for WhatsApp auth state
 */
function getSessionPath(accountId: string): string {
  const userDataPath = app.getPath("userData");
  return path.join(userDataPath, "wa_sessions", accountId);
}

/**
 * Initialize WhatsApp account connection
 */
async function initializeAccount(accountId: string, accountPhone: string) {
  try {
    // Cancel any pending reconnect timer for this account
    const existingTimer = reconnectTimers.get(accountId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      reconnectTimers.delete(accountId);
    }

    // Close any existing socket first to prevent "conflict" errors
    const existingSock = activeSockets.get(accountId);
    if (existingSock) {
      try {
        existingSock.ev.removeAllListeners("connection.update");
        existingSock.ev.removeAllListeners("creds.update");
        existingSock.ev.removeAllListeners("messages.upsert");
        existingSock.end(undefined);
      } catch (e) {
        // Ignore cleanup errors
      }
      activeSockets.delete(accountId);
    }

    const sessionPath = getSessionPath(accountId);
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      logger,
      printQRInTerminal: false,
      auth: state,
      browser: ["MASR POS Pro", "Chrome", "1.0.0"],
      generateHighQualityLinkPreview: true,
      connectTimeoutMs: 60000, // 60 seconds timeout
      defaultQueryTimeoutMs: 60000,
      retryRequestDelayMs: 250,
    });

    // Store socket
    activeSockets.set(accountId, sock);

    // Handle QR code
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        // Send QR code to renderer
        accountStates.set(accountId, {
          status: "qr",
          qrCode: qr,
          phone: accountPhone,
          message: "📱 امسح الكود ده من الموبايل",
        });
      }

      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const errorMsg = (lastDisconnect?.error as Boom)?.message || "";
        const isConflict = statusCode === DisconnectReason.connectionReplaced || errorMsg.includes("conflict");
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;

        let errorMessage = ERROR_MESSAGES.CONNECTION_FAILED;

        if (isLoggedOut) {
          errorMessage = ERROR_MESSAGES.ACCOUNT_LOGGED_OUT;
          activeSockets.delete(accountId);
          reconnectAttempts.delete(accountId);
          accountStates.set(accountId, {
            status: "disconnected",
            phone: accountPhone,
            error: errorMessage,
            message: errorMessage,
          });
        } else if (isConflict) {
          // "conflict" means another session took over - do NOT reconnect (causes infinite loop)
          console.log(`⚠️ WhatsApp ${accountId} got conflict error - stopping reconnect to prevent loop`);
          activeSockets.delete(accountId);
          reconnectAttempts.delete(accountId);
          accountStates.set(accountId, {
            status: "disconnected",
            phone: accountPhone,
            error: "⚠️ تم الاتصال من جهاز آخر",
            message: "⚠️ تم الاتصال من جهاز آخر - اضغط اتصال لإعادة الربط",
          });
        } else {
          // Other errors - reconnect with limit and exponential backoff
          const attempts = (reconnectAttempts.get(accountId) || 0) + 1;
          reconnectAttempts.set(accountId, attempts);

          if (attempts <= MAX_RECONNECT_ATTEMPTS) {
            const delay = Math.min(3000 * Math.pow(2, attempts - 1), 60000); // 3s, 6s, 12s, 24s, 48s
            console.log(`🔄 Reconnecting WhatsApp ${accountId} (attempt ${attempts}/${MAX_RECONNECT_ATTEMPTS}) in ${delay/1000}s...`);
            accountStates.set(accountId, {
              status: "connecting",
              phone: accountPhone,
              message: ERROR_MESSAGES.RECONNECTING,
            });
            const timer = setTimeout(() => initializeAccount(accountId, accountPhone), delay);
            reconnectTimers.set(accountId, timer);
          } else {
            console.log(`❌ WhatsApp ${accountId} max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Giving up.`);
            activeSockets.delete(accountId);
            reconnectAttempts.delete(accountId);
            accountStates.set(accountId, {
              status: "disconnected",
              phone: accountPhone,
              error: "❌ فشل الاتصال بعد عدة محاولات",
              message: "❌ فشل الاتصال - اضغط اتصال لإعادة المحاولة",
            });
          }
        }
      } else if (connection === "open") {
        // Successfully connected - reset reconnect counter
        reconnectAttempts.delete(accountId);

        // Get the real phone number from WhatsApp
        const realPhone =
          sock.user?.id?.split(":")[0] ||
          sock.user?.id?.split("@")[0] ||
          accountPhone;

        accountStates.set(accountId, {
          status: "connected",
          phone: realPhone,
          message: "✅ تم الاتصال بنجاح!",
        });
        console.log(
          "WhatsApp connected successfully:",
          accountId,
          "Phone:",
          realPhone
        );
      } else if (connection === "connecting") {
        accountStates.set(accountId, {
          status: "connecting",
          phone: accountPhone,
          message: "🔄 جاري الاتصال...",
        });
      }
    });

    // Save credentials on update
    sock.ev.on("creds.update", saveCreds);

    // === BOT: Handle incoming messages ===
    sock.ev.on("messages.upsert", async (m) => {
      if (!botEnabled) return;
      
      for (const msg of m.messages) {
        try {
          // تجاهل الرسائل المرسلة من نفسنا
          if (msg.key.fromMe) continue;
          
          // تجاهل رسائل الحالة (status@broadcast)
          if (msg.key.remoteJid === "status@broadcast") continue;
          
          // تجاهل رسائل المجموعات
          if (msg.key.remoteJid?.endsWith("@g.us")) continue;
          
          // استخراج نص الرسالة
          const messageText = 
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            "";
          
          if (!messageText.trim()) continue;
          
          // استخراج رقم المرسل
          const senderJid = msg.key.remoteJid || "";
          const senderPhone = senderJid.replace("@s.whatsapp.net", "");
          
          console.log(`[WhatsApp Bot] Incoming from ${senderPhone}: ${messageText}`);
          
          // إرسال الرسالة للـ renderer لمعالجتها (هناك الداتا بيز)
          if (mainWindowRef && !mainWindowRef.isDestroyed()) {
            mainWindowRef.webContents.send("whatsapp:bot-incoming", {
              accountId,
              senderPhone,
              senderJid,
              messageText: messageText.trim(),
            });
          }
        } catch (err) {
          console.error("[WhatsApp Bot] Error processing incoming message:", err);
        }
      }
    });

    return {
      success: true,
      status: "connecting",
      message: "🔄 جاري الاتصال بالواتساب...",
      messageAr: "جاري الاتصال بالواتساب...",
    };
  } catch (error: any) {
    console.error("Failed to initialize WhatsApp account:", error);
    const errorMessage = getArabicErrorMessage(error);

    accountStates.set(accountId, {
      status: "failed",
      error: errorMessage,
      message: errorMessage,
    });

    return {
      success: false,
      status: "failed",
      message: errorMessage,
      messageAr: errorMessage,
    };
  }
}

/**
 * Get account status and QR code
 */
function getAccountState(accountId: string) {
  return (
    accountStates.get(accountId) || {
      status: "disconnected",
      message: "📵 الحساب غير متصل",
    }
  );
}

/**
 * Send text message with better error handling
 */
async function sendTextMessage(accountId: string, to: string, message: string) {
  try {
    const sock = activeSockets.get(accountId);
    if (!sock) {
      return {
        success: false,
        message: ERROR_MESSAGES.NO_CONNECTION,
        messageAr: ERROR_MESSAGES.NO_CONNECTION,
      };
    }

    // Validate phone number (skip for groups)
    const isGroup = to.includes("@g.us");
    const cleanedNumber = to.replace(/\D/g, "");

    console.log(`[WhatsApp sendText] to: "${to}", isGroup: ${isGroup}`);

    if (!isGroup && cleanedNumber.length < 10) {
      return {
        success: false,
        message: ERROR_MESSAGES.INVALID_NUMBER,
        messageAr: ERROR_MESSAGES.INVALID_NUMBER,
      };
    }

    // Format phone number to international format (or keep group JID as-is)
    let formattedNumber: string;
    if (isGroup || to.includes("@g.us")) {
      formattedNumber = to; // Keep group JID as-is
      console.log(`[WhatsApp sendText] Group message, using JID: ${formattedNumber}`);
    } else if (to.includes("@s.whatsapp.net")) {
      formattedNumber = to;
    } else {
      formattedNumber = `${cleanedNumber}@s.whatsapp.net`;
    }

    // Check if number exists on WhatsApp (skip for groups)
    if (!isGroup) {
      try {
        const results = await sock.onWhatsApp(cleanedNumber);
        if (results && results.length > 0) {
          if (!results[0]?.exists) {
            return {
              success: false,
              message: ERROR_MESSAGES.NUMBER_NOT_ON_WHATSAPP,
              messageAr: ERROR_MESSAGES.NUMBER_NOT_ON_WHATSAPP,
            };
          }
          // Use the actual JID returned by WhatsApp to avoid sending to wrong number
          if (results[0]?.jid) {
            formattedNumber = results[0].jid;
          }
        }
      } catch (checkError) {
        // Continue anyway if check fails
        console.warn("Could not verify number:", checkError);
      }
    }

    // Send with timeout
    console.log(`[WhatsApp] Sending message to: ${formattedNumber}`);
    const sendPromise = sock.sendMessage(formattedNumber, { text: message });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timed out")), 30000)
    );

    await Promise.race([sendPromise, timeoutPromise]);

    return {
      success: true,
      message: "✅ تم إرسال الرسالة بنجاح",
      messageAr: "تم إرسال الرسالة بنجاح",
    };
  } catch (error: any) {
    console.error("Failed to send message:", error);
    const errorMessage = getArabicErrorMessage(error);

    return {
      success: false,
      message: errorMessage,
      messageAr: errorMessage,
      error: error.message,
    };
  }
}

/**
 * Send media message (image, document, video) with better error handling
 */
async function sendMediaMessage(
  accountId: string,
  to: string,
  mediaUrl: string,
  mediaType: "image" | "document" | "video",
  caption?: string,
  filename?: string
) {
  try {
    const sock = activeSockets.get(accountId);
    if (!sock) {
      return {
        success: false,
        message: ERROR_MESSAGES.NO_CONNECTION,
        messageAr: ERROR_MESSAGES.NO_CONNECTION,
      };
    }

    // Validate phone number (skip for groups)
    const isGroup = to.includes("@g.us");
    const cleanedNumber = to.replace(/\D/g, "");

    console.log(`[WhatsApp sendMedia] to: "${to}", isGroup: ${isGroup}, mediaType: ${mediaType}`);

    if (!isGroup && cleanedNumber.length < 10) {
      return {
        success: false,
        message: ERROR_MESSAGES.INVALID_NUMBER,
        messageAr: ERROR_MESSAGES.INVALID_NUMBER,
      };
    }

    // Format phone number to international format (or keep group JID as-is)
    let formattedNumber: string;
    if (isGroup || to.includes("@g.us")) {
      formattedNumber = to; // Keep group JID as-is
      console.log(`[WhatsApp sendMedia] Group message, using JID: ${formattedNumber}`);
    } else if (to.includes("@s.whatsapp.net")) {
      formattedNumber = to;
    } else {
      formattedNumber = `${cleanedNumber}@s.whatsapp.net`;
    }

    // Verify number and use actual JID (skip for groups)
    if (!isGroup) {
      try {
        const results = await sock.onWhatsApp(cleanedNumber);
        if (results && results.length > 0 && results[0]?.jid) {
          formattedNumber = results[0].jid;
        }
      } catch (checkError) {
        console.warn("Could not verify number for media:", checkError);
      }
    }

    // Fetch media from URL with timeout
    let buffer: Buffer;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(mediaUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error("Failed to fetch media");
      }

      buffer = Buffer.from(await response.arrayBuffer());

      // Check file size (max 16MB for WhatsApp)
      if (buffer.length > 16 * 1024 * 1024) {
        return {
          success: false,
          message: ERROR_MESSAGES.MEDIA_TOO_LARGE,
          messageAr: ERROR_MESSAGES.MEDIA_TOO_LARGE,
        };
      }
    } catch (fetchError) {
      console.error("Failed to fetch media:", fetchError);
      return {
        success: false,
        message: ERROR_MESSAGES.MEDIA_DOWNLOAD_FAILED,
        messageAr: ERROR_MESSAGES.MEDIA_DOWNLOAD_FAILED,
      };
    }

    let messageContent: any = {};

    switch (mediaType) {
      case "image":
        messageContent = {
          image: buffer,
          caption: caption || "",
        };
        break;
      case "document":
        messageContent = {
          document: buffer,
          fileName: filename || "document.pdf",
          caption: caption || "",
        };
        break;
      case "video":
        messageContent = {
          video: buffer,
          caption: caption || "",
        };
        break;
    }

    // Send with timeout
    const sendPromise = sock.sendMessage(formattedNumber, messageContent);
    const timeoutPromise = new Promise(
      (_, reject) => setTimeout(() => reject(new Error("Timed out")), 60000) // 60 seconds for media
    );

    await Promise.race([sendPromise, timeoutPromise]);

    return {
      success: true,
      message: "✅ تم إرسال الملف بنجاح",
      messageAr: "تم إرسال الملف بنجاح",
    };
  } catch (error: any) {
    console.error("Failed to send media:", error);
    const errorMessage = getArabicErrorMessage(error);

    return {
      success: false,
      message: errorMessage,
      messageAr: errorMessage,
      error: error.message,
    };
  }
}

/**
 * Soft-close account socket without logging out (preserves session)
 * Used by auto-reconnect to skip accounts that need QR scan
 */
function closeSocket(accountId: string) {
  try {
    // Cancel any pending reconnect timer
    const timer = reconnectTimers.get(accountId);
    if (timer) {
      clearTimeout(timer);
      reconnectTimers.delete(accountId);
    }
    reconnectAttempts.delete(accountId);

    const sock = activeSockets.get(accountId);
    if (sock) {
      // Remove all listeners first to prevent reconnect triggers
      sock.ev.removeAllListeners("connection.update");
      sock.ev.removeAllListeners("creds.update");
      sock.ev.removeAllListeners("messages.upsert");
      sock.end(undefined);
      activeSockets.delete(accountId);
      accountStates.delete(accountId);
    }
    return { success: true };
  } catch (error: any) {
    console.error("Failed to close socket:", error);
    activeSockets.delete(accountId);
    accountStates.delete(accountId);
    return { success: true };
  }
}

/**
 * Disconnect account
 */
async function disconnectAccount(accountId: string) {
  try {
    // Cancel any pending reconnect timer
    const timer = reconnectTimers.get(accountId);
    if (timer) {
      clearTimeout(timer);
      reconnectTimers.delete(accountId);
    }
    reconnectAttempts.delete(accountId);

    const sock = activeSockets.get(accountId);
    if (sock) {
      sock.ev.removeAllListeners("connection.update");
      sock.ev.removeAllListeners("creds.update");
      sock.ev.removeAllListeners("messages.upsert");
      await sock.logout();
      activeSockets.delete(accountId);
      accountStates.delete(accountId);
    }
    return {
      success: true,
      message: "✅ تم قطع الاتصال",
      messageAr: "تم قطع الاتصال",
    };
  } catch (error: any) {
    console.error("Failed to disconnect:", error);
    // Force cleanup even if logout fails
    activeSockets.delete(accountId);
    accountStates.delete(accountId);

    return {
      success: true, // Still consider it successful since account is now disconnected
      message: "✅ تم قطع الاتصال",
      messageAr: "تم قطع الاتصال",
    };
  }
}

/**
 * Get participating groups
 */
async function getGroups(accountId: string) {
  try {
    const sock = activeSockets.get(accountId);
    if (!sock) {
      return {
        success: false,
        message: ERROR_MESSAGES.NO_CONNECTION,
        groups: []
      };
    }

    // Fetch all participating groups
    const groups = await sock.groupFetchAllParticipating();

    // Format groups for frontend
    const formattedGroups = Object.values(groups).map((group) => ({
      id: group.id,
      name: group.subject || "Unknown Group",
    }));

    return {
      success: true,
      groups: formattedGroups
    };
  } catch (error: any) {
    console.error("Failed to fetch groups:", error);
    return {
      success: false,
      message: getArabicErrorMessage(error),
      groups: []
    };
  }
}

/**
 * Check if account is connected
 */
function isAccountConnected(accountId: string): boolean {
  const sock = activeSockets.get(accountId);
  return sock !== undefined && sock.user !== undefined;
}

/**
 * Register all WhatsApp IPC handlers
 */
export function registerWhatsAppHandlers() {
  // Initialize account
  ipcMain.handle(
    "whatsapp:init-account",
    async (_, accountId: string, accountPhone: string) => {
      // Reset reconnect counter when user manually initiates
      reconnectAttempts.delete(accountId);
      return await initializeAccount(accountId, accountPhone);
    }
  );

  // Get account state (includes QR code)
  ipcMain.handle("whatsapp:get-state", (_, accountId: string) => {
    return getAccountState(accountId);
  });

  // Send text message
  ipcMain.handle(
    "whatsapp:send-text",
    async (_, accountId: string, to: string, message: string) => {
      return await sendTextMessage(accountId, to, message);
    }
  );

  // Send media message
  ipcMain.handle(
    "whatsapp:send-media",
    async (
      _,
      accountId: string,
      to: string,
      mediaUrl: string,
      mediaType: "image" | "document" | "video",
      caption?: string,
      filename?: string
    ) => {
      return await sendMediaMessage(
        accountId,
        to,
        mediaUrl,
        mediaType,
        caption,
        filename
      );
    }
  );

  // Close socket without logout (for auto-reconnect skip)
  ipcMain.handle("whatsapp:close-socket", (_, accountId: string) => {
    return closeSocket(accountId);
  });

  // Disconnect account (full logout)
  ipcMain.handle("whatsapp:disconnect", async (_, accountId: string) => {
    return await disconnectAccount(accountId);
  });

  // Check connection status
  ipcMain.handle("whatsapp:is-connected", (_, accountId: string) => {
    return isAccountConnected(accountId);
  });

  // Get Groups
  ipcMain.handle("whatsapp:get-groups", async (_, accountId: string) => {
    return await getGroups(accountId);
  });

  // === BOT IPC Handlers ===
  
  // Set bot enabled/disabled from renderer
  ipcMain.handle("whatsapp:bot-set-enabled", (_, enabled: boolean) => {
    botEnabled = enabled;
    console.log("[WhatsApp Bot] Bot", enabled ? "enabled" : "disabled");
    return { success: true };
  });

  // Bot reply: renderer processed the message and sends back a reply
  ipcMain.handle(
    "whatsapp:bot-reply",
    async (_, accountId: string, to: string, message: string) => {
      return await sendTextMessage(accountId, to, message);
    }
  );

  // Bot reply with media (PDF): renderer sends back a document
  ipcMain.handle(
    "whatsapp:bot-reply-media",
    async (_, accountId: string, to: string, message: string, mediaBase64: string, filename: string) => {
      try {
        // First send text message
        await sendTextMessage(accountId, to, message);
        // Then send the document
        return await sendMediaMessage(accountId, to, mediaBase64, "document", "", filename);
      } catch (error: any) {
        console.error("[WhatsApp Bot] Failed to send media reply:", error);
        return { success: false, message: error.message };
      }
    }
  );

  console.log("✅ WhatsApp IPC handlers registered (with Bot support)");
}

/**
 * Set the main window reference for bot message forwarding
 */
export function setMainWindow(win: BrowserWindow) {
  mainWindowRef = win;
}
