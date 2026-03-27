export interface WhatsAppAccount {
  id: string;
  name: string;
  phone: string;
  status: "disconnected" | "connecting" | "connected" | "qr" | "failed";
  qrCode?: string;
  dailyLimit: number;
  dailySent: number;
  lastResetDate: string;
  antiSpamDelay: number;
  isActive: boolean;
  botEnabled: boolean;
  createdAt: string;
  lastConnectedAt?: string;
}

export interface WhatsAppMessage {
  id: string;
  accountId: string;
  to: string;
  message: string;
  media?: {
    type: "image" | "document" | "video";
    url: string;
    filename?: string;
    caption?: string;
  };
  status: "pending" | "sending" | "sent" | "failed" | "paused";
  retries: number;
  scheduledAt?: string;
  sentAt?: string;
  error?: string;
  metadata?: {
    invoiceId?: string;
    customerId?: string;
    campaignId?: string;
    type?: "invoice" | "reminder" | "campaign" | "manual";
  };
  createdAt: string;
}

export interface WhatsAppCampaign {
  id: string;
  name: string;
  accountId: string;
  template: string;
  templateId?: string;
  variables: string[];
  targetType: "credit" | "installment" | "all" | "custom";
  filters?: {
    minAmount?: number;
    maxAmount?: number;
    daysBefore?: number;
    class?: string;
    supervisorId?: string;
    salesRepId?: string;
  };
  status: "draft" | "scheduled" | "running" | "paused" | "completed" | "failed";
  scheduledAt?: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  completedAt?: string;
}

export interface WhatsAppTask {
  id: string;
  type: "send_message" | "send_campaign" | "send_reminder";
  accountId: string;
  status: "running" | "paused" | "completed" | "failed";
  currentStep: string;
  currentIndex: number;
  totalItems: number;
  data: any;
  error?: string;
  pausedAt?: string;
  resumedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// دعم مجموعات WhatsApp
export interface WhatsAppGroup {
  id: string;
  name: string;
  groupJid: string; // معرف المجموعة على WhatsApp
  accountId: string; // الحساب المستخدم للإرسال
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

// الإرسال الدوري التلقائي
export interface ScheduledStatement {
  id: string;
  name: string;
  accountId: string;
  targetType: "customer" | "group" | "salesReps";
  targetIds: string[]; // معرفات العملاء أو المجموعات
  scheduleType: "daily" | "weekly" | "monthly";
  scheduleDay?: number; // يوم الأسبوع (0-6) أو يوم الشهر (1-31)
  scheduleTime: string; // الوقت بتنسيق "HH:mm"
  template: string;
  isActive: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  createdAt: string;
  updatedAt?: string;
}
