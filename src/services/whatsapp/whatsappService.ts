/**
 * WhatsApp Service (Frontend)
 * الخدمة الرئيسية للواتساب - تعمل عبر API مع السيرفر
 *
 * التغيير الرئيسي: بدلاً من Electron IPC، نستخدم HTTP API + WebSocket
 * - الاتصال والإرسال يتم عبر السيرفر
 * - QR codes وتحديثات الحالة تصل عبر WebSocket
 * - الحملات لازالت تعمل من الفرونت (لأنها تعتمد على بيانات محلية + PDF)
 */

import { db } from "@/shared/lib/indexedDB";
import { whatsappApi } from "./whatsappApiClient";
import type {
  AccountState,
  MediaPayload,
  MessageMetadata,
} from "./whatsappApiClient";

// ─── Error Messages ──────────────────────────────────────────────

const ERROR_MESSAGES_AR = {
  NOT_CONNECTED: "📵 السيرفر مش متصل - تأكد من الاتصال",
  ACCOUNT_NOT_FOUND: "❌ الحساب غير موجود",
  ACCOUNT_NOT_ACTIVE: "⚠️ الحساب غير نشط - فعّل الحساب الأول",
  ACCOUNT_NOT_CONNECTED: "📵 الحساب مش متصل - اربط الحساب الأول",
  NO_ACTIVE_ACCOUNT: "📵 مفيش حساب واتساب نشط - أضف حساب وفعّله",
  DAILY_LIMIT_REACHED: "⏰ وصلت للحد الأقصى للرسائل اليوم",
  SEND_FAILED: "❌ فشل إرسال الرسالة - جرب مرة تانية",
  CUSTOMER_NOT_FOUND: "❌ العميل غير موجود",
  NO_PHONE: "📱 العميل ده مسجلش رقم موبايل",
  INVOICE_NOT_FOUND: "❌ الفاتورة غير موجودة",
  UNKNOWN_ERROR: "⚠️ حصل خطأ - جرب مرة تانية",
};

// ─── Types (re-exported for backward compatibility) ──────────────

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
  errorAr?: string;
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
  antiSpamDelay: number;
  isActive: boolean;
  createdAt: string;
  lastConnectedAt?: string;
}

export interface Campaign {
  id: string;
  name: string;
  accountId: string;
  template: string;
  templateId?: string;
  variables: string[];
  targetType: "credit" | "installment" | "all" | "custom";
  sendTo?: "customer" | "salesRep" | "both";
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

// ─── Status Listener ─────────────────────────────────────────────

type StatusListener = (accountId: string, state: AccountState) => void;

// ─── Service ─────────────────────────────────────────────────────

class WhatsAppService {
  private statusListeners: StatusListener[] = [];
  private statusPollIntervals = new Map<string, ReturnType<typeof setInterval>>();
  private isOnline = navigator.onLine;
  private schedulerInterval?: ReturnType<typeof setInterval>;

  constructor() {
    this.setupNetworkListener();
    this.startScheduleChecker();
  }

  // ── Status Listeners ────────────────────────────────────────

  onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.push(listener);
    return () => {
      this.statusListeners = this.statusListeners.filter((l) => l !== listener);
    };
  }

  private notifyStatusChange(accountId: string, state: AccountState): void {
    this.statusListeners.forEach((l) => l(accountId, state));
  }

  // ── Account Management ──────────────────────────────────────

  async initAccount(accountId: string): Promise<WhatsAppAccount> {
    const account = await this.getAccount(accountId);
    if (!account) throw new Error("Account not found");

    try {
      const result = await whatsappApi.connect(accountId, account.phone);

      if (result.success) {
        // بدء مراقبة الحالة عبر polling
        this.startStatusPolling(accountId);
        await this.updateAccountStatus(accountId, "connecting");
      } else {
        await this.updateAccountStatus(accountId, "failed");
      }

      return account;
    } catch (error) {
      await this.updateAccountStatus(accountId, "failed");
      throw error;
    }
  }

  async getAccountState(accountId: string): Promise<AccountState> {
    try {
      return await whatsappApi.getStatus(accountId);
    } catch {
      return { status: "disconnected", message: "📵 فشل الاتصال بالسيرفر" };
    }
  }

  async getGroups(accountId: string): Promise<{ id: string; name: string }[]> {
    try {
      return await whatsappApi.getGroups(accountId);
    } catch {
      return [];
    }
  }

  async disconnectAccount(accountId: string): Promise<void> {
    this.stopStatusPolling(accountId);
    try {
      await whatsappApi.disconnect(accountId);
    } catch {
      // تجاهل
    }
    await this.updateAccountStatus(accountId, "disconnected");
  }

  // ── Status Polling ──────────────────────────────────────────

  private startStatusPolling(accountId: string): void {
    this.stopStatusPolling(accountId);

    const interval = setInterval(async () => {
      try {
        const state = await whatsappApi.getStatus(accountId);
        this.notifyStatusChange(accountId, state);

        // تحديث DB المحلية
        const account = await this.getAccount(accountId);
        if (account && account.status !== state.status) {
          account.status = state.status;
          if (state.qrCode) account.qrCode = state.qrCode;
          if (state.status === "connected") {
            account.lastConnectedAt = new Date().toISOString();
            account.isActive = true;
          }
          await db.update("whatsappAccounts", account);
        }

        // إيقاف الاستطلاع إذا اتصل بنجاح أو فشل
        if (state.status === "connected" || state.status === "disconnected" || state.status === "failed") {
          // Keep polling for connected accounts to detect disconnection
          if (state.status !== "connected") {
            this.stopStatusPolling(accountId);
          }
        }
      } catch {
        // سيكتمل في المرة التالية
      }
    }, 2000);

    this.statusPollIntervals.set(accountId, interval);
  }

  private stopStatusPolling(accountId: string): void {
    const existing = this.statusPollIntervals.get(accountId);
    if (existing) {
      clearInterval(existing);
      this.statusPollIntervals.delete(accountId);
    }
  }

  // ── Send Message (via Server API) ───────────────────────────

  async sendMessage(
    accountId: string,
    to: string,
    message: string,
    media?: WhatsAppMessage["media"],
    metadata?: WhatsAppMessage["metadata"],
  ): Promise<string> {
    // تحويل media format من القديم للجديد
    let apiMedia: MediaPayload | undefined;
    if (media) {
      apiMedia = {
        type: media.type,
        data: media.url, // في الكود القديم كان url يحمل base64
        filename: media.filename,
        caption: media.caption,
      };
    }

    const result = await whatsappApi.sendMessage({
      accountId,
      to,
      message,
      media: apiMedia,
      metadata: metadata as MessageMetadata,
    });

    return result.data.messageId;
  }

  // ── Campaign Management ─────────────────────────────────────

  async createCampaign(
    campaign: Omit<Campaign, "id" | "createdAt">,
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

    if (campaign.templateId === "account_statement") {
      return this.runStatementCampaign(campaign);
    }

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

    const recipients = await this.loadCampaignRecipients(campaign);
    const salesRepsMap = await this.loadSalesRepsMap();

    for (let i = 0; i < recipients.length; i++) {
      if (!this.isOnline) {
        await this.pauseTask(taskState.id);
        break;
      }

      const recipient = recipients[i];
      const message = this.fillTemplate(campaign.template, campaign.variables, recipient);
      const targets = this.resolveSendTargets(recipient, campaign.sendTo || "customer", salesRepsMap);

      for (const target of targets) {
        await this.sendMessage(campaign.accountId, target, message, undefined, {
          campaignId,
          customerId: recipient.id,
          type: "campaign",
        });
      }

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

  private async runStatementCampaign(campaign: Campaign): Promise<void> {
    const campaignId = campaign.id;

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

    const recipients = await this.loadCampaignRecipients(campaign);
    const salesRepsMap = await this.loadSalesRepsMap();
    const { generateStatementPDF } = await import("@/services/statementPdfService");

    const fromDate = new Date(new Date().getFullYear(), 0, 1);
    const toDate = new Date();

    for (let i = 0; i < recipients.length; i++) {
      if (!this.isOnline) {
        await this.pauseTask(taskState.id);
        break;
      }

      const recipient = recipients[i];
      const targets = this.resolveSendTargets(recipient, campaign.sendTo || "customer", salesRepsMap);

      if (targets.length === 0) {
        campaign.failedCount++;
        await db.update("whatsappCampaigns", campaign);
        continue;
      }

      try {
        const pdfBlob = await generateStatementPDF(recipient.id, fromDate, toDate);
        if (!pdfBlob) {
          campaign.failedCount++;
          await db.update("whatsappCampaigns", campaign);
          continue;
        }

        const base64data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(pdfBlob);
        });

        const caption = this.fillTemplate(campaign.template, campaign.variables, recipient);

        for (const target of targets) {
          await this.sendMessage(campaign.accountId, target, caption, {
            type: "document",
            url: base64data,
            caption,
            filename: `كشف حساب ${recipient.name || "عميل"}.pdf`,
          }, {
            campaignId,
            customerId: recipient.id,
            type: "statement",
          });
        }

        campaign.sentCount++;
      } catch (error) {
        console.error(`❌ [Campaign] Failed to send statement to ${recipient.name}:`, error);
        campaign.failedCount++;
      }

      taskState.currentIndex = i + 1;
      taskState.updatedAt = new Date().toISOString();
      await db.update("whatsappTasks", taskState);
      await db.update("whatsappCampaigns", campaign);

      await this.delay(2000);
    }

    campaign.status = "completed";
    campaign.completedAt = new Date().toISOString();
    await db.update("whatsappCampaigns", campaign);

    taskState.status = "completed";
    taskState.updatedAt = new Date().toISOString();
    await db.update("whatsappTasks", taskState);
  }

  // ── Reminders ───────────────────────────────────────────────

  async sendInstallmentReminder(
    customerId: string,
    _installmentId: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const customer = await db.get("customers", customerId);
      if (!customer) return { success: false, message: ERROR_MESSAGES_AR.CUSTOMER_NOT_FOUND };

      const sendTarget = (customer as any).collectionGroupId || (customer as any).whatsappGroupId || (customer as any).phone;
      if (!sendTarget) return { success: false, message: ERROR_MESSAGES_AR.NO_PHONE };

      const accounts = await db.getAll<WhatsAppAccount>("whatsappAccounts");
      const activeAccount = accounts.find((a) => a.isActive && a.status === "connected");
      if (!activeAccount) return { success: false, message: ERROR_MESSAGES_AR.NO_ACTIVE_ACCOUNT };

      const message = `مرحباً ${(customer as any).name}،\n\nتذكير بموعد دفع القسط المستحق.\nيرجى التواصل معنا لإتمام الدفع.\n\nشكراً لتعاملكم معنا 🙏`;

      await this.sendMessage(activeAccount.id, sendTarget, message, undefined, {
        customerId,
        type: "reminder",
      });

      return { success: true, message: "✅ تم إرسال التذكير بنجاح" };
    } catch (error: any) {
      console.error("❌ [WhatsApp] Failed to send reminder:", error);
      return { success: false, message: ERROR_MESSAGES_AR.UNKNOWN_ERROR };
    }
  }

  async sendInvoiceWhatsApp(
    invoiceId: string,
    pdfUrl: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const invoice = await db.get("invoices", invoiceId);
      if (!invoice) return { success: false, message: ERROR_MESSAGES_AR.INVOICE_NOT_FOUND };

      const customer = await db.get("customers", (invoice as any).customerId);
      if (!customer) return { success: false, message: ERROR_MESSAGES_AR.CUSTOMER_NOT_FOUND };

      const sendTarget = (customer as any).invoiceGroupId || (customer as any).whatsappGroupId || (customer as any).phone;
      if (!sendTarget) return { success: false, message: ERROR_MESSAGES_AR.NO_PHONE };

      const accounts = await db.getAll<WhatsAppAccount>("whatsappAccounts");
      const activeAccount = accounts.find((a) => a.isActive && a.status === "connected");
      if (!activeAccount) return { success: false, message: ERROR_MESSAGES_AR.NO_ACTIVE_ACCOUNT };

      const message = `فاتورة رقم: ${(invoice as any).id}\nالمبلغ الإجمالي: ${(invoice as any).total}\nشركة لونج تايم للصناعات الكهربائية`;

      await this.sendMessage(activeAccount.id, sendTarget, message, {
        type: "document",
        url: pdfUrl,
        filename: `${(customer as any).name || (invoice as any).customerName || "عميل"} - ${(invoice as any).invoiceNumber || (invoice as any).id}.pdf`,
      }, {
        invoiceId,
        customerId: (customer as any).id,
        type: "invoice",
      });

      return { success: true, message: "✅ تم إرسال الفاتورة بنجاح" };
    } catch (error: any) {
      console.error("❌ [WhatsApp] Failed to send invoice:", error);
      return { success: false, message: ERROR_MESSAGES_AR.UNKNOWN_ERROR };
    }
  }

  // ── Task Management ─────────────────────────────────────────

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

      if (task.type === "send_campaign") {
        await this.runCampaign(task.data.campaignId);
      }
    }
  }

  // ── Wait for message ────────────────────────────────────────

  async waitForMessage(messageId: string, timeoutMs: number = 60000): Promise<boolean> {
    // في الوضع الجديد، الرسائل ترسل عبر السيرفر
    // يمكن مراقبة الحالة عبر polling للقائمة
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const status = await whatsappApi.getQueueStatus();
        const msg = status.messages.find((m: any) => m.id === messageId);
        if (msg?.status === "sent") return true;
        if (msg?.status === "failed") return false;
      } catch {
        // continue
      }
      await this.delay(1000);
    }
    return false;
  }

  // ── Cleanup ─────────────────────────────────────────────────

  cleanup(): void {
    for (const interval of this.statusPollIntervals.values()) {
      clearInterval(interval);
    }
    this.statusPollIntervals.clear();
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
    }
  }

  // ─── Private Helpers ──────────────────────────────────────────

  private setupNetworkListener(): void {
    window.addEventListener("online", () => {
      this.isOnline = true;
    });
    window.addEventListener("offline", () => {
      this.isOnline = false;
    });
  }

  private formatPhoneNumber(phone: string): string {
    if (phone.includes("@g.us") || phone.includes("@s.whatsapp.net")) {
      return phone;
    }
    let cleaned = phone.replace(/\D/g, "");
    if (cleaned.startsWith("0") && !cleaned.startsWith("00")) {
      cleaned = cleaned.substring(1);
    }
    if (!cleaned.startsWith("20")) {
      cleaned = "20" + cleaned;
    }
    return cleaned + "@s.whatsapp.net";
  }

  private fillTemplate(template: string, variables: string[], data: any): string {
    let message = template;

    const variableMapping: Record<string, string> = {
      name: data.name || data.customerName || "",
      customerName: data.name || data.customerName || "",
      phone: data.phone || "",
      amount: (data.currentBalance || data.amount || 0).toLocaleString("ar-EG"),
      currentBalance: (data.currentBalance || 0).toLocaleString("ar-EG"),
      storeName: data.storeName || localStorage.getItem("storeName") || "متجرنا",
      installmentAmount: (data.installmentAmount || data.nextInstallment || 0).toLocaleString("ar-EG"),
      remainingAmount: (data.remainingAmount || data.currentBalance || 0).toLocaleString("ar-EG"),
      dueDate: data.dueDate || data.nextDueDate || "",
    };

    Object.entries(variableMapping).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, "g");
      message = message.replace(regex, String(value));
    });

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

    const { calculateAllCustomerBalances } = await import("@/hooks/useCustomerBalances");
    const balanceMap = await calculateAllCustomerBalances();

    const getBalance = (customerId: string, fallback = 0) =>
      balanceMap[String(customerId)] ?? fallback;

    if (campaign.targetType === "credit") {
      customers = customers.filter(
        (c: any) => getBalance(c.id, Number(c.currentBalance) || 0) > 0,
      );
    }

    if (campaign.filters) {
      if (campaign.filters.minAmount) {
        customers = customers.filter(
          (c: any) => getBalance(c.id, Number(c.currentBalance) || 0) >= campaign.filters!.minAmount!,
        );
      }
      if (campaign.filters.maxAmount) {
        customers = customers.filter(
          (c: any) => getBalance(c.id, Number(c.currentBalance) || 0) <= campaign.filters!.maxAmount!,
        );
      }
      if (campaign.filters.class && campaign.filters.class !== "all") {
        customers = customers.filter((c: any) => c.class === campaign.filters?.class);
      }
      if (campaign.filters.salesRepId) {
        customers = customers.filter((c: any) => c.salesRepId === campaign.filters?.salesRepId);
      }
      if (campaign.filters.supervisorId) {
        try {
          const reps = await db.getAll("salesReps");
          const supervisorRepIds = reps
            .filter((r: any) => r.supervisorId === campaign.filters?.supervisorId)
            .map((r: any) => r.id);
          customers = customers.filter((c: any) => supervisorRepIds.includes(c.salesRepId));
        } catch {
          // تجاهل
        }
      }
    }

    customers = customers.filter(
      (c: any) => c.phone || c.whatsappGroupId || c.invoiceGroupId || c.collectionGroupId,
    );

    const storeName = localStorage.getItem("storeName") || "متجرنا";
    return customers.map((c: any) => ({
      ...c,
      currentBalance: getBalance(c.id, Number(c.currentBalance) || 0),
      storeName,
    }));
  }

  private resolveSendTargets(
    customer: any,
    sendTo: "customer" | "salesRep" | "both",
    salesRepsMap: Map<string, any>,
  ): string[] {
    const targets: string[] = [];

    if (sendTo === "customer" || sendTo === "both") {
      const customerTarget =
        customer.collectionGroupId || customer.whatsappGroupId || customer.phone;
      if (customerTarget) targets.push(customerTarget);
    }

    if (sendTo === "salesRep" || sendTo === "both") {
      if (customer.salesRepId) {
        const rep = salesRepsMap.get(customer.salesRepId);
        if (rep) {
          const repTarget = rep.whatsappGroupId || rep.phone;
          if (repTarget && !targets.includes(repTarget)) {
            targets.push(repTarget);
          }
        }
      }
    }

    return targets;
  }

  private async loadSalesRepsMap(): Promise<Map<string, any>> {
    const reps = await db.getAll("salesReps");
    const map = new Map<string, any>();
    reps.forEach((r: any) => map.set(r.id, r));
    return map;
  }

  private async getAccount(accountId: string): Promise<WhatsAppAccount | null> {
    return await db.get<WhatsAppAccount>("whatsappAccounts", accountId);
  }

  private async updateAccountStatus(
    accountId: string,
    status: WhatsAppAccount["status"],
  ): Promise<void> {
    const account = await this.getAccount(accountId);
    if (account) {
      account.status = status;
      if (status === "connected") account.lastConnectedAt = new Date().toISOString();
      await db.update("whatsappAccounts", account);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ── Scheduled Statements ────────────────────────────────────

  private startScheduleChecker(): void {
    setTimeout(() => this.checkScheduledStatements(), 10000);
    this.schedulerInterval = setInterval(() => this.checkScheduledStatements(), 60 * 1000);
  }

  private async checkScheduledStatements(): Promise<void> {
    try {
      const saved = localStorage.getItem("scheduledStatements");
      if (!saved) return;

      const statements = JSON.parse(saved);
      if (!Array.isArray(statements) || statements.length === 0) return;

      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const currentDay = now.getDay();
      const currentDate = now.getDate();
      const currentTimeStr = `${String(currentHour).padStart(2, "0")}:${String(currentMinute).padStart(2, "0")}`;

      for (const statement of statements) {
        if (!statement.isActive) continue;

        if (statement.lastRunAt) {
          const lastRun = new Date(statement.lastRunAt);
          const hoursSinceLastRun = (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60);
          if (hoursSinceLastRun < 2) continue;
        }

        if (statement.scheduleTime !== currentTimeStr) continue;

        let shouldRun = false;
        if (statement.scheduleType === "daily") shouldRun = true;
        else if (statement.scheduleType === "weekly") shouldRun = statement.scheduleDay === currentDay;
        else if (statement.scheduleType === "monthly") shouldRun = statement.scheduleDay === currentDate;

        if (!shouldRun) continue;

        try {
          await this.executeScheduledStatement(statement);
          statement.lastRunAt = now.toISOString();
          statement.nextRunAt = this.calculateNextRun(statement);
          localStorage.setItem("scheduledStatements", JSON.stringify(statements));
        } catch (error) {
          console.error(`❌ [Scheduler] Failed: ${statement.name}`, error);
        }
      }
    } catch (error) {
      console.error("❌ [Scheduler] Error:", error);
    }
  }

  private async executeScheduledStatement(statement: any): Promise<void> {
    const accounts = await db.getAll<WhatsAppAccount>("whatsappAccounts");
    const activeAccount = accounts.find((a) => a.isActive && a.status === "connected");
    if (!activeAccount) return;

    const accountId = statement.accountId !== "default" ? statement.accountId : activeAccount.id;

    const allCustomers = await db.getAll("customers");
    let recipients = allCustomers.filter(
      (c: any) =>
        (Number(c.currentBalance) || 0) > 0 &&
        (c.phone || c.whatsappGroupId || c.collectionGroupId),
    );

    if (statement.targetIds?.length > 0) {
      const targetSet = new Set(statement.targetIds);
      recipients = recipients.filter((c: any) => targetSet.has(c.id));
    }

    if (recipients.length === 0) return;

    const { generateStatementPDF } = await import("@/services/statementPdfService");
    const fromDate = new Date(new Date().getFullYear(), 0, 1);
    const toDate = new Date();

    for (const customer of recipients) {
      try {
        const recipientTarget = (customer as any).collectionGroupId || (customer as any).whatsappGroupId || (customer as any).phone;
        if (!recipientTarget) continue;

        const pdfBlob = await generateStatementPDF((customer as any).id, fromDate, toDate);
        if (!pdfBlob) continue;

        const base64data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(pdfBlob);
        });

        let message = statement.template || "كشف حساب";
        message = message.replace(/{customer_name}/g, (customer as any).name || "");
        message = message.replace(/{balance}/g, String(Number((customer as any).currentBalance) || 0));
        message = message.replace(/{date_from}/g, fromDate.toLocaleDateString("ar-EG"));
        message = message.replace(/{date_to}/g, toDate.toLocaleDateString("ar-EG"));

        await this.sendMessage(accountId, recipientTarget, message, {
          type: "document",
          url: base64data,
          caption: message,
          filename: `كشف حساب ${(customer as any).name || "عميل"}.pdf`,
        }, {
          customerId: (customer as any).id,
          type: "statement",
        });

        await this.delay(3000);
      } catch (error) {
        console.error(`❌ [Scheduler] Failed for ${(customer as any).name}:`, error);
      }
    }
  }

  private calculateNextRun(statement: any): string {
    const now = new Date();
    const [hours, minutes] = (statement.scheduleTime || "09:00").split(":").map(Number);
    const next = new Date(now);
    next.setHours(hours, minutes, 0, 0);

    if (statement.scheduleType === "daily") {
      next.setDate(next.getDate() + 1);
    } else if (statement.scheduleType === "weekly") {
      const targetDay = statement.scheduleDay || 0;
      let daysUntil = targetDay - now.getDay();
      if (daysUntil <= 0) daysUntil += 7;
      next.setDate(next.getDate() + daysUntil);
    } else if (statement.scheduleType === "monthly") {
      const targetDate = statement.scheduleDay || 1;
      next.setMonth(next.getMonth() + 1);
      next.setDate(targetDate);
    }

    return next.toISOString();
  }
}

export const whatsappService = new WhatsAppService();
