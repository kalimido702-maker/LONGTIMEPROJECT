/**
 * WhatsApp Service Types
 * أنواع البيانات المستخدمة في خدمة الواتساب
 */

// ─── Account Types ───────────────────────────────────────────────

export interface WhatsAppAccount {
  id: string;
  clientId: string;
  branchId: string | null;
  name: string;
  phone: string;
  status: AccountStatus;
  dailyLimit: number;
  dailySent: number;
  lastResetDate: string;
  antiSpamDelay: number;
  isActive: boolean;
  createdAt: string;
  lastConnectedAt?: string;
}

export type AccountStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "qr"
  | "failed";

export interface AccountState {
  status: AccountStatus;
  qrCode?: string;
  phone?: string;
  message?: string;
  error?: string;
}

// ─── Message Types ───────────────────────────────────────────────

export interface SendMessageRequest {
  accountId: string;
  to: string;
  message: string;
  media?: MediaPayload;
  metadata?: MessageMetadata;
}

export interface MediaPayload {
  type: "image" | "document" | "video";
  data: string; // base64 data
  filename?: string;
  caption?: string;
}

export interface MessageMetadata {
  invoiceId?: string;
  customerId?: string;
  campaignId?: string;
  type?: "invoice" | "reminder" | "campaign" | "manual" | "statement" | "payment_receipt";
}

export interface QueuedMessage {
  id: string;
  clientId: string;
  accountId: string;
  to: string;
  message: string;
  media?: MediaPayload;
  metadata?: MessageMetadata;
  status: "pending" | "sending" | "sent" | "failed";
  retries: number;
  error?: string;
  createdAt: string;
  sentAt?: string;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  message: string;
}

// ─── Campaign Types ──────────────────────────────────────────────

export interface Campaign {
  id: string;
  clientId: string;
  branchId: string | null;
  name: string;
  accountId: string;
  template: string;
  templateId?: string;
  variables: string[];
  targetType: "credit" | "installment" | "all" | "custom";
  sendTo?: "customer" | "salesRep" | "both";
  filters?: CampaignFilters;
  status: "draft" | "scheduled" | "running" | "paused" | "completed" | "failed";
  scheduledAt?: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  completedAt?: string;
}

export interface CampaignFilters {
  minAmount?: number;
  maxAmount?: number;
  daysBefore?: number;
  class?: string;
  supervisorId?: string;
  salesRepId?: string;
}

// ─── Bot Types ───────────────────────────────────────────────────

export interface BotSettings {
  enabled: boolean;
  allowedSenders: "all" | "customers" | "supervisors" | "salesreps";
  welcomeMessage: string;
  unknownCommandMessage: string;
}

export interface BotReply {
  text: string;
  media?: {
    base64: string;
    filename: string;
    caption?: string;
  };
}

export interface IncomingMessage {
  accountId: string;
  clientId: string;
  senderPhone: string;
  senderJid: string;
  messageText: string;
  timestamp: string;
}

// ─── WebSocket Event Types ───────────────────────────────────────

export type WhatsAppWsEventType =
  | "whatsapp:qr"
  | "whatsapp:status"
  | "whatsapp:message-sent"
  | "whatsapp:message-failed"
  | "whatsapp:bot-incoming";

export interface WhatsAppWsEvent {
  type: WhatsAppWsEventType;
  accountId: string;
  data: Record<string, unknown>;
}

// ─── Error Messages ──────────────────────────────────────────────

export const ERROR_MESSAGES = {
  CONNECTION_TIMEOUT: "⏱️ انتهت مهلة الاتصال - جرب مرة تانية",
  CONNECTION_FAILED: "❌ فشل الاتصال - تأكد من الإنترنت وجرب تاني",
  NO_CONNECTION: "📵 الحساب مش متصل - اربط الحساب الأول",
  RECONNECTING: "🔄 جاري إعادة الاتصال...",
  SEND_FAILED: "❌ فشل إرسال الرسالة - جرب مرة تانية",
  SEND_TIMEOUT: "⏱️ الرسالة أخذت وقت طويل",
  INVALID_NUMBER: "📱 رقم الهاتف غلط - تأكد من الرقم",
  NUMBER_NOT_ON_WHATSAPP: "📱 الرقم ده مش على واتساب",
  MEDIA_FAILED: "🖼️ فشل إرسال الملف",
  MEDIA_TOO_LARGE: "📁 الملف كبير جداً - أقصى حجم 16 ميجا",
  ACCOUNT_NOT_FOUND: "❌ الحساب غير موجود",
  ACCOUNT_NOT_ACTIVE: "⚠️ الحساب غير نشط",
  ACCOUNT_LOGGED_OUT: "🔐 تم تسجيل الخروج - اربط الحساب من جديد",
  DAILY_LIMIT_REACHED: "⏰ وصلت للحد الأقصى للرسائل اليوم",
  UNKNOWN_ERROR: "⚠️ حصل خطأ - جرب مرة تانية",
} as const;
