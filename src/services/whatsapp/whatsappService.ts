import { db } from "@/shared/lib/indexedDB";

// Check if running in Electron
const isElectron = () => {
  return typeof window !== "undefined" && window.electronAPI !== undefined;
};

/**
 * رسائل الأخطاء بالعربي للمستخدم
 */
const ERROR_MESSAGES_AR = {
  // بيئة التشغيل
  NOT_ELECTRON: "⚠️ الواتساب يعمل فقط في تطبيق الكمبيوتر",

  // أخطاء الحساب
  ACCOUNT_NOT_FOUND: "❌ الحساب غير موجود",
  ACCOUNT_NOT_ACTIVE: "⚠️ الحساب غير نشط - فعّل الحساب الأول",
  ACCOUNT_NOT_CONNECTED: "📵 الحساب مش متصل - اربط الحساب الأول",
  NO_ACTIVE_ACCOUNT: "📵 مفيش حساب واتساب نشط - أضف حساب وفعّله",

  // أخطاء إرسال الرسائل
  DAILY_LIMIT_REACHED: "⏰ وصلت للحد الأقصى للرسائل اليوم - جرب بكره",
  SEND_FAILED: "❌ فشل إرسال الرسالة - جرب مرة تانية",
  QUEUE_FAILED: "❌ فشل إضافة الرسالة للقائمة",

  // أخطاء الحملات
  CAMPAIGN_NOT_FOUND: "❌ الحملة غير موجودة",
  CAMPAIGN_FAILED: "❌ فشل تشغيل الحملة",

  // أخطاء العملاء
  CUSTOMER_NOT_FOUND: "❌ العميل غير موجود",
  NO_PHONE: "📱 العميل ده مسجلش رقم موبايل",

  // أخطاء الفواتير
  INVOICE_NOT_FOUND: "❌ الفاتورة غير موجودة",

  // أخطاء الشبكة
  NO_INTERNET: "🌐 مفيش إنترنت - تأكد من الاتصال",

  // أخطاء عامة
  UNKNOWN_ERROR: "⚠️ حصل خطأ - جرب مرة تانية",
};

/**
 * تحويل خطأ لرسالة عربية مفهومة
 */
function getArabicError(error: any): string {
  const msg = error?.message?.toLowerCase() || "";

  if (msg.includes("electron")) return ERROR_MESSAGES_AR.NOT_ELECTRON;
  if (msg.includes("not found") && msg.includes("account"))
    return ERROR_MESSAGES_AR.ACCOUNT_NOT_FOUND;
  if (msg.includes("not active")) return ERROR_MESSAGES_AR.ACCOUNT_NOT_ACTIVE;
  if (msg.includes("not connected"))
    return ERROR_MESSAGES_AR.ACCOUNT_NOT_CONNECTED;
  if (msg.includes("daily limit")) return ERROR_MESSAGES_AR.DAILY_LIMIT_REACHED;
  if (msg.includes("campaign")) return ERROR_MESSAGES_AR.CAMPAIGN_NOT_FOUND;
  if (msg.includes("customer")) return ERROR_MESSAGES_AR.CUSTOMER_NOT_FOUND;
  if (msg.includes("invoice")) return ERROR_MESSAGES_AR.INVOICE_NOT_FOUND;
  if (msg.includes("network") || msg.includes("offline"))
    return ERROR_MESSAGES_AR.NO_INTERNET;

  return ERROR_MESSAGES_AR.UNKNOWN_ERROR;
}

// Queue System for Messages
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
  errorAr?: string; // رسالة الخطأ بالعربي
  metadata?: {
    invoiceId?: string;
    customerId?: string;
    campaignId?: string;
    type?: "invoice" | "reminder" | "campaign" | "manual" | "statement" | "payment_receipt";
  };
  createdAt: string;
}

export interface WhatsAppAccount {
  id: string;
  name: string;
  phone: string;
  status: "disconnected" | "connecting" | "connected" | "qr" | "failed";
  qrCode?: string;
  dailyLimit: number;
  dailySent: number;
  lastResetDate: string;
  antiSpamDelay: number; // ms between messages
  isActive: boolean;
  createdAt: string;
  lastConnectedAt?: string;
}

export interface Campaign {
  id: string;
  name: string;
  accountId: string;
  template: string;
  variables: string[]; // e.g., ["customerName", "amount", "dueDate"]
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

export interface TaskState {
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

class WhatsAppService {
  private messageQueue: WhatsAppMessage[] = [];
  private isProcessing: boolean = false;
  private isOnline: boolean = navigator.onLine;
  private processingInterval?: any;

  constructor() {
    this.setupNetworkListener();
    this.loadQueue();
    this.startQueueProcessor();
    // إعادة ربط الحسابات المتصلة تلقائياً عند بدء التطبيق
    this.autoReconnectAccounts();
  }

  /**
   * Auto-reconnect WhatsApp accounts that were previously connected
   * Called once on service initialization (app startup)
   */
  private async autoReconnectAccounts() {
    if (!isElectron()) return;

    // Wait a bit for IndexedDB and Electron IPC to be ready
    await new Promise(resolve => setTimeout(resolve, 3000));

    try {
      const accounts = await db.getAll<WhatsAppAccount>("whatsappAccounts");
      const activeAccounts = accounts.filter(
        (a) => a.isActive && (a.status === "connected" || a.status === "connecting")
      );

      if (activeAccounts.length === 0) return;

      console.log(`🔄 Auto-reconnecting ${activeAccounts.length} WhatsApp account(s)...`);

      for (const account of activeAccounts) {
        try {
          console.log(`🔄 Reconnecting WhatsApp: ${account.phone} (${account.id})`);
          await window.electronAPI.whatsapp.initAccount(account.id, account.phone);
          console.log(`✅ WhatsApp reconnected: ${account.phone}`);
        } catch (err) {
          console.error(`❌ Failed to reconnect WhatsApp ${account.phone}:`, err);
        }
      }
    } catch (error) {
      console.error("❌ Auto-reconnect failed:", error);
    }
  }

  // Network Monitoring
  private setupNetworkListener() {
    window.addEventListener("online", () => {
      console.log("🌐 Internet connected");
      this.isOnline = true;
      this.resumeAllTasks();
    });

    window.addEventListener("offline", () => {
      console.log("🌐 Internet disconnected");
      this.isOnline = false;
      this.pauseAllTasks();
    });
  }

  // Initialize WhatsApp Account (Electron IPC)
  async initAccount(accountId: string): Promise<WhatsAppAccount> {
    if (!isElectron()) {
      throw new Error("WhatsApp requires Electron environment");
    }

    const account = await this.getAccount(accountId);
    if (!account) throw new Error("Account not found");

    try {
      // Call Electron main process via IPC
      const result = await window.electronAPI.whatsapp.initAccount(
        accountId,
        account.phone
      );

      if (result.success) {
        await this.updateAccountStatus(accountId, result.status as any);
      } else {
        await this.updateAccountStatus(accountId, "failed");
      }

      return account;
    } catch (error) {
      await this.updateAccountStatus(accountId, "failed");
      throw error;
    }
  }

  // Get Account State (QR Code) from Electron
  async getAccountState(accountId: string) {
    if (!isElectron()) {
      return { status: "disconnected" };
    }

    try {
      return await window.electronAPI.whatsapp.getState(accountId);
    } catch (error) {
      console.error("Failed to get account state:", error);
      return { status: "failed" };
    }
  }

  // Get Groups from WhatsApp (Electron IPC)
  async getGroups(accountId: string): Promise<{ id: string; name: string }[]> {
    if (!isElectron()) {
      console.warn("WhatsApp getGroups requires Electron environment");
      return [];
    }

    try {
      // Assuming window.electronAPI.whatsapp.getGroups exists or will continue to fail gracefully
      // If the backend isn't updated yet, this might fail, so we catch errors
      if (window.electronAPI.whatsapp.getGroups) {
        const result = await window.electronAPI.whatsapp.getGroups(accountId);
        if (result.success && Array.isArray(result.groups)) {
          return result.groups;
        }
      }
      return [];
    } catch (error) {
      console.error("Failed to get groups:", error);
      return [];
    }
  }

  // Send Message
  async sendMessage(
    accountId: string,
    to: string,
    message: string,
    media?: WhatsAppMessage["media"],
    metadata?: WhatsAppMessage["metadata"]
  ): Promise<string> {
    const messageId = Date.now().toString();

    const queueItem: WhatsAppMessage = {
      id: messageId,
      accountId,
      to: this.formatPhoneNumber(to),
      message,
      media,
      status: "pending",
      retries: 0,
      metadata,
      createdAt: new Date().toISOString(),
    };

    this.messageQueue.push(queueItem);
    await this.saveQueue();

    return messageId;
  }

  // Process Queue
  private async startQueueProcessor() {
    this.processingInterval = setInterval(async () => {
      if (!this.isProcessing && this.isOnline && this.messageQueue.length > 0) {
        await this.processNextMessage();
      }
    }, 1000);
  }

  private async processNextMessage() {
    if (!this.isOnline) {
      console.log("📵 [WhatsApp] Offline - waiting for connection...");
      return;
    }

    this.isProcessing = true;

    const message = this.messageQueue.find((m) => m.status === "pending");
    if (!message) {
      this.isProcessing = false;
      return;
    }

    try {
      const account = await this.getAccount(message.accountId);
      if (!account) {
        message.status = "failed";
        message.error = "Account not found";
        message.errorAr = ERROR_MESSAGES_AR.ACCOUNT_NOT_FOUND;
        await this.saveQueue();
        this.isProcessing = false;
        return;
      }

      if (!account.isActive) {
        message.status = "failed";
        message.error = "Account not active";
        message.errorAr = ERROR_MESSAGES_AR.ACCOUNT_NOT_ACTIVE;
        await this.saveQueue();
        this.isProcessing = false;
        return;
      }

      // Check daily limit
      if (this.shouldResetDailyCount(account)) {
        await this.resetDailyCount(message.accountId);
      }

      if (account.dailySent >= account.dailyLimit) {
        message.status = "failed";
        message.error = "Daily limit reached";
        message.errorAr = ERROR_MESSAGES_AR.DAILY_LIMIT_REACHED;
        await this.saveQueue();
        this.isProcessing = false;
        return;
      }

      // Anti-spam delay
      await this.delay(account.antiSpamDelay);

      message.status = "sending";
      await this.saveQueue();

      // Check if account is connected via Electron IPC
      if (isElectron()) {
        const isConnected = await window.electronAPI!.whatsapp.isConnected(
          message.accountId
        );
        if (!isConnected) {
          console.log(
            "🔄 [WhatsApp] Account not connected, trying to reconnect..."
          );
          message.status = "pending"; // Reset to pending for retry
          message.errorAr = ERROR_MESSAGES_AR.ACCOUNT_NOT_CONNECTED;
          await this.saveQueue();
          await this.initAccount(message.accountId);
          this.isProcessing = false;
          return;
        }

        // Send message via Electron IPC
        let result;
        if (message.media) {
          result = await window.electronAPI!.whatsapp.sendMedia(
            message.accountId,
            message.to,
            message.media.url,
            message.media.type,
            message.media.caption || message.message,
            message.media.filename
          );
        } else {
          result = await window.electronAPI!.whatsapp.sendText(
            message.accountId,
            message.to,
            message.message
          );
        }

        if (!result.success) {
          // Use Arabic error message from backend if available
          const errorMsg =
            result.messageAr || result.message || ERROR_MESSAGES_AR.SEND_FAILED;
          throw new Error(errorMsg);
        }
      } else {
        throw new Error(ERROR_MESSAGES_AR.NOT_ELECTRON);
      }

      message.status = "sent";
      message.sentAt = new Date().toISOString();
      message.errorAr = undefined; // Clear any previous error
      await this.incrementDailySent(message.accountId);
      await this.saveQueue();

      console.log("✅ [WhatsApp] Message sent successfully to:", message.to);

      // Remove from queue after 24 hours
      setTimeout(() => {
        this.messageQueue = this.messageQueue.filter(
          (m) => m.id !== message.id
        );
        this.saveQueue();
      }, 24 * 60 * 60 * 1000);
    } catch (error: any) {
      console.error("❌ [WhatsApp] Failed to send message:", error.message);

      message.retries++;
      message.error = error.message;
      message.errorAr = getArabicError(error) || error.message;

      if (message.retries >= 3) {
        message.status = "failed";
        console.error(
          "❌ [WhatsApp] Message failed after 3 retries:",
          message.to
        );
      } else {
        message.status = "pending";
        console.log(
          `🔄 [WhatsApp] Will retry (${message.retries}/3):`,
          message.to
        );
      }
      await this.saveQueue();
    }

    this.isProcessing = false;
  }

  // Campaign Management
  async createCampaign(
    campaign: Omit<Campaign, "id" | "createdAt">
  ): Promise<Campaign> {
    const newCampaign: Campaign = {
      ...campaign,
      id: Date.now().toString(),
      sentCount: 0,
      failedCount: 0,
      createdAt: new Date().toISOString(),
    };

    await db.add("whatsappCampaigns", newCampaign);
    return newCampaign;
  }

  async runCampaign(campaignId: string): Promise<void> {
    const campaign = await db.get<Campaign>("whatsappCampaigns", campaignId);
    if (!campaign) throw new Error("Campaign not found");

    // Create task state
    const taskState: TaskState = {
      id: `campaign_${campaignId}`,
      type: "send_campaign",
      accountId: campaign.accountId,
      status: "running",
      currentStep: "loading_recipients",
      currentIndex: 0,
      totalItems: campaign.totalRecipients,
      data: { campaignId },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.add("whatsappTasks", taskState);

    // Load recipients based on filters
    const recipients = await this.loadCampaignRecipients(campaign);

    for (let i = 0; i < recipients.length; i++) {
      if (!this.isOnline) {
        await this.pauseTask(taskState.id);
        break;
      }

      const recipient = recipients[i];
      const message = this.fillTemplate(
        campaign.template,
        campaign.variables,
        recipient
      );

      await this.sendMessage(
        campaign.accountId,
        recipient.phone,
        message,
        undefined,
        {
          campaignId,
          customerId: recipient.id,
          type: "campaign",
        }
      );

      // Update task progress
      taskState.currentIndex = i + 1;
      taskState.updatedAt = new Date().toISOString();
      await db.update("whatsappTasks", taskState);

      campaign.sentCount++;
      await db.update("whatsappCampaigns", campaign);
    }

    campaign.status = "completed";
    campaign.completedAt = new Date().toISOString();
    await db.update("whatsappCampaigns", campaign);

    taskState.status = "completed";
    taskState.updatedAt = new Date().toISOString();
    await db.update("whatsappTasks", taskState);
  }

  // Auto Reminders
  async sendInstallmentReminder(
    customerId: string,
    installmentId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Get customer and installment details
      const customer = await db.get("customers", customerId);
      if (!customer) {
        return {
          success: false,
          message: ERROR_MESSAGES_AR.CUSTOMER_NOT_FOUND,
        };
      }

      if (!(customer as any).phone) {
        return { success: false, message: ERROR_MESSAGES_AR.NO_PHONE };
      }

      // Get active WhatsApp account
      const accounts = await db.getAll<WhatsAppAccount>("whatsappAccounts");
      const activeAccount = accounts.find(
        (a) => a.isActive && a.status === "connected"
      );

      if (!activeAccount) {
        return { success: false, message: ERROR_MESSAGES_AR.NO_ACTIVE_ACCOUNT };
      }

      const message = `مرحباً ${(customer as any).name
        }،\n\nتذكير بموعد دفع القسط المستحق.\nيرجى التواصل معنا لإتمام الدفع.\n\nشكراً لتعاملكم معنا 🙏`;

      await this.sendMessage(
        activeAccount.id,
        (customer as any).phone,
        message,
        undefined,
        {
          customerId,
          type: "reminder",
        }
      );

      return { success: true, message: "✅ تم إرسال التذكير بنجاح" };
    } catch (error: any) {
      console.error("❌ [WhatsApp] Failed to send reminder:", error);
      return { success: false, message: getArabicError(error) };
    }
  }

  async sendInvoiceWhatsApp(
    invoiceId: string,
    pdfUrl: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const invoice = await db.get("invoices", invoiceId);
      if (!invoice) {
        return { success: false, message: ERROR_MESSAGES_AR.INVOICE_NOT_FOUND };
      }

      const customer = await db.get("customers", (invoice as any).customerId);
      if (!customer) {
        return {
          success: false,
          message: ERROR_MESSAGES_AR.CUSTOMER_NOT_FOUND,
        };
      }

      if (!(customer as any).phone) {
        return { success: false, message: ERROR_MESSAGES_AR.NO_PHONE };
      }

      const accounts = await db.getAll<WhatsAppAccount>("whatsappAccounts");
      const activeAccount = accounts.find(
        (a) => a.isActive && a.status === "connected"
      );

      if (!activeAccount) {
        return { success: false, message: ERROR_MESSAGES_AR.NO_ACTIVE_ACCOUNT };
      }

      const message = `فاتورة رقم: ${(invoice as any).id}\nالمبلغ الإجمالي: ${(invoice as any).total
        }\nشركة لونج تايم للصناعات الكهربائية`;

      await this.sendMessage(
        activeAccount.id,
        (customer as any).phone,
        message,
        {
          type: "document",
          url: pdfUrl,
          filename: `invoice_${(invoice as any).id}.pdf`,
        },
        {
          invoiceId,
          customerId: (customer as any).id,
          type: "invoice",
        }
      );

      return { success: true, message: "✅ تم إرسال الفاتورة بنجاح" };
    } catch (error: any) {
      console.error("❌ [WhatsApp] Failed to send invoice:", error);
      return { success: false, message: getArabicError(error) };
    }
  }

  // Task Management
  async pauseTask(taskId: string): Promise<void> {
    const task = await db.get<TaskState>("whatsappTasks", taskId);
    if (task) {
      task.status = "paused";
      task.pausedAt = new Date().toISOString();
      task.updatedAt = new Date().toISOString();
      await db.update("whatsappTasks", task);
    }
  }

  async resumeTask(taskId: string): Promise<void> {
    const task = await db.get<TaskState>("whatsappTasks", taskId);
    if (task && task.status === "paused") {
      task.status = "running";
      task.resumedAt = new Date().toISOString();
      task.updatedAt = new Date().toISOString();
      await db.update("whatsappTasks", task);

      // Resume based on task type
      if (task.type === "send_campaign") {
        await this.runCampaign(task.data.campaignId);
      }
    }
  }

  private async pauseAllTasks(): Promise<void> {
    const tasks = await db.getAll<TaskState>("whatsappTasks");
    for (const task of tasks) {
      if (task.status === "running") {
        await this.pauseTask(task.id);
      }
    }
  }

  private async resumeAllTasks(): Promise<void> {
    const tasks = await db.getAll<TaskState>("whatsappTasks");
    for (const task of tasks) {
      if (task.status === "paused") {
        await this.resumeTask(task.id);
      }
    }
  }

  // Helper Methods
  private formatPhoneNumber(phone: string): string {
    // If it's a group JID, keep it as-is
    if (phone.includes("@g.us")) {
      return phone;
    }

    // If it already has @s.whatsapp.net, keep it
    if (phone.includes("@s.whatsapp.net")) {
      return phone;
    }

    // Remove all non-digit characters
    let cleaned = phone.replace(/\D/g, "");

    // Handle Egyptian numbers - remove leading 0 if present
    if (cleaned.startsWith("0") && !cleaned.startsWith("00")) {
      cleaned = cleaned.substring(1);
    }

    // Add country code if not present (Egypt = 20)
    if (!cleaned.startsWith("20")) {
      cleaned = "20" + cleaned;
    }

    return cleaned + "@s.whatsapp.net";
  }

  private fillTemplate(
    template: string,
    variables: string[],
    data: any
  ): string {
    let message = template;

    // Mapping للمتغيرات: الـ template بيستخدم أسماء معينة والـ data ممكن يكون فيها أسماء مختلفة
    const variableMapping: Record<string, string> = {
      "name": data.name || data.customerName || "",
      "customerName": data.name || data.customerName || "",
      "phone": data.phone || "",
      "amount": (data.currentBalance || data.amount || 0).toLocaleString("ar-EG"),
      "currentBalance": (data.currentBalance || 0).toLocaleString("ar-EG"),
      "storeName": data.storeName || localStorage.getItem("storeName") || "متجرنا",
      "installmentAmount": (data.installmentAmount || data.nextInstallment || 0).toLocaleString("ar-EG"),
      "remainingAmount": (data.remainingAmount || data.currentBalance || 0).toLocaleString("ar-EG"),
      "dueDate": data.dueDate || data.nextDueDate || "",
    };

    // استبدال كل المتغيرات في الرسالة
    Object.entries(variableMapping).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, "g");
      message = message.replace(regex, String(value));
    });

    // لو في متغيرات تانية مش في الـ mapping، نحاول نجيبها من الـ data مباشرة
    variables.forEach((variable) => {
      if (!variableMapping[variable]) {
        const value = data[variable] || "";
        const regex = new RegExp(`{{${variable}}}`, "g");
        message = message.replace(regex, String(value));
      }
    });

    return message;
  }

  private async loadCampaignRecipients(campaign: Campaign): Promise<any[]> {
    let customers = await db.getAll("customers");

    if (campaign.targetType === "credit") {
      // Filter customers with credit
      customers = customers.filter((c: any) => c.currentBalance > 0);
    } else if (campaign.targetType === "installment") {
      // Filter customers with installments
      // Implementation depends on your data structure
    }

    if (campaign.filters) {
      if (campaign.filters.minAmount) {
        customers = customers.filter(
          (c: any) => c.currentBalance >= campaign.filters!.minAmount!
        );
      }
      if (campaign.filters.maxAmount) {
        customers = customers.filter(
          (c: any) => c.currentBalance <= campaign.filters!.maxAmount!
        );
      }

      // Filter by Class
      if (campaign.filters.class && campaign.filters.class !== "all") {
        customers = customers.filter(
          (c: any) => c.class === campaign.filters?.class
        );
      }

      // Filter by Sales Rep
      if (campaign.filters.salesRepId) {
        customers = customers.filter(
          (c: any) => c.salesRepId === campaign.filters?.salesRepId
        );
      }

      // Filter by Supervisor
      if (campaign.filters.supervisorId) {
        // We need to fetch reps for this supervisor properly, but since we are in a service 
        // that might not have direct access to "salesReps" easily unless we fetch them.
        // Let's fetch all salesReps first.

        try {
          // Assuming db.getAll is available and works for 'salesReps'
          const reps = await db.getAll("salesReps");
          const supervisorRepIds = reps
            .filter((r: any) => r.supervisorId === campaign.filters?.supervisorId)
            .map((r: any) => r.id);

          customers = customers.filter((c: any) => supervisorRepIds.includes(c.salesRepId));
        } catch (e) {
          console.error("Error filtering by supervisor", e);
        }
      }
    }

    // إضافة storeName لكل customer عشان يتعوض في الـ template
    const storeName = localStorage.getItem("storeName") || "متجرنا";
    return customers.map((c: any) => ({
      ...c,
      storeName,
    }));
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private shouldResetDailyCount(account: WhatsAppAccount): boolean {
    const lastReset = new Date(account.lastResetDate);
    const now = new Date();
    return (
      now.getDate() !== lastReset.getDate() ||
      now.getMonth() !== lastReset.getMonth() ||
      now.getFullYear() !== lastReset.getFullYear()
    );
  }

  private async resetDailyCount(accountId: string): Promise<void> {
    const account = await this.getAccount(accountId);
    if (account) {
      account.dailySent = 0;
      account.lastResetDate = new Date().toISOString();
      await db.update("whatsappAccounts", account);
    }
  }

  private async incrementDailySent(accountId: string): Promise<void> {
    const account = await this.getAccount(accountId);
    if (account) {
      account.dailySent++;
      await db.update("whatsappAccounts", account);
    }
  }

  private async updateAccountStatus(
    accountId: string,
    status: WhatsAppAccount["status"],
    qrCode?: string
  ): Promise<void> {
    const account = await this.getAccount(accountId);
    if (account) {
      account.status = status;
      if (qrCode) account.qrCode = qrCode;
      if (status === "connected")
        account.lastConnectedAt = new Date().toISOString();
      await db.update("whatsappAccounts", account);
    }
  }

  private async getAccount(accountId: string): Promise<WhatsAppAccount | null> {
    return await db.get<WhatsAppAccount>("whatsappAccounts", accountId);
  }

  private async saveQueue(): Promise<void> {
    try {
      localStorage.setItem("whatsappQueue", JSON.stringify(this.messageQueue));
    } catch (error) {
      console.warn("⚠️ Failed to save WhatsApp queue to localStorage (Quota exceeded). Operations will continue in-memory.", error);

      // Attempt to clean resolved messages to free space
      try {
        const essentialQueue = this.messageQueue.filter(m => m.status === 'pending' || m.status === 'sending');
        if (essentialQueue.length < this.messageQueue.length) {
          // Try saving only pending items
          localStorage.setItem("whatsappQueue", JSON.stringify(essentialQueue));
          console.log("✅ Recovered storage by clearing completed messages.");
        } else {
          console.error("❌ Critical: Queue too large to save even after cleanup. Media might be too large.");
        }
      } catch (e) {
        console.error("❌ Critical: Secondary save attempt failed.", e);
      }
    }
  }

  private async loadQueue(): Promise<void> {
    const saved = localStorage.getItem("whatsappQueue");
    if (saved) {
      try {
        this.messageQueue = JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse queue", e);
        this.messageQueue = [];
      }
    }
  }

  // Helper method to wait for message completion
  async waitForMessage(messageId: string, timeoutMs: number = 60000): Promise<boolean> {
    return new Promise((resolve) => {
      const startTime = Date.now();

      const checkInterval = setInterval(() => {
        const msg = this.messageQueue.find(m => m.id === messageId);

        if (!msg) {
          // Message removed or lost?
          // If we can't find it, it might have been cleared. Assume failed if too soon, or check if we tracked it differently.
          // For now, if lost from queue, stop waiting.
          clearInterval(checkInterval);
          resolve(false);
          return;
        }

        if (msg.status === 'sent') {
          clearInterval(checkInterval);
          resolve(true);
        } else if (msg.status === 'failed') {
          clearInterval(checkInterval);
          resolve(false);
        } else if (Date.now() - startTime > timeoutMs) {
          clearInterval(checkInterval);
          resolve(false); // Timeout
        }
      }, 500);
    });
  }

  // Cleanup
  cleanup(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }
    // Sockets are managed in Electron main process
  }
}

export const whatsappService = new WhatsAppService();
