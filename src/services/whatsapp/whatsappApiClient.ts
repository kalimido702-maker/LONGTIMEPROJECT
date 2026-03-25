/**
 * WhatsApp API Client (Frontend)
 * عميل API للتواصل مع خدمة الواتساب على السيرفر
 *
 * يستبدل الاعتماد على Electron IPC بطلبات HTTP إلى السيرفر
 * يستقبل أحداث الوقت الحقيقي (QR, status) عبر WebSocket
 */

import { getFastifyClient } from "@/infrastructure/http";

// ─── Types ───────────────────────────────────────────────────────

export interface AccountState {
  status: "disconnected" | "connecting" | "connected" | "qr" | "failed";
  qrCode?: string;
  phone?: string;
  message?: string;
  error?: string;
}

export interface WhatsAppAccountData {
  id: string;
  name: string;
  phone: string;
  status: string;
  daily_limit: number;
  daily_sent: number;
  anti_spam_delay: number;
  is_active: boolean;
  last_reset_date: string;
  created_at: string;
  last_connected_at?: string;
  liveStatus: AccountState;
  isConnected: boolean;
}

export interface MediaPayload {
  type: "image" | "document" | "video";
  data: string; // base64
  filename?: string;
  caption?: string;
}

export interface MessageMetadata {
  invoiceId?: string;
  customerId?: string;
  campaignId?: string;
  type?: "invoice" | "reminder" | "campaign" | "manual" | "statement" | "payment_receipt";
}

export interface QueueStatus {
  pending: number;
  sending: number;
  sent: number;
  failed: number;
  messages: any[];
}

export interface BotSettings {
  enabled: boolean;
  allowedSenders: "all" | "customers" | "supervisors" | "salesreps";
  welcomeMessage: string;
  unknownCommandMessage: string;
}

// ─── API Client ──────────────────────────────────────────────────

const API_PREFIX = "/api/whatsapp";

class WhatsAppApiClient {
  private get client() {
    return getFastifyClient();
  }

  // ── Accounts ──────────────────────────────────────────────────

  async getAccounts(): Promise<WhatsAppAccountData[]> {
    const res = await this.client.get<{ data: WhatsAppAccountData[] }>(
      `${API_PREFIX}/accounts`,
    );
    return res.data;
  }

  async createAccount(params: {
    id?: string;
    name: string;
    phone: string;
    dailyLimit?: number;
    antiSpamDelay?: number;
  }): Promise<{ data: any; message: string }> {
    return this.client.post(`${API_PREFIX}/accounts`, params);
  }

  async updateAccount(
    accountId: string,
    updates: { name?: string; phone?: string; dailyLimit?: number; antiSpamDelay?: number },
  ): Promise<void> {
    await this.client.put(`${API_PREFIX}/accounts/${accountId}`, updates);
  }

  async deleteAccount(accountId: string): Promise<void> {
    await this.client.delete(`${API_PREFIX}/accounts/${accountId}`);
  }

  // ── Connection ────────────────────────────────────────────────

  async connect(accountId: string, phone?: string): Promise<{ success: boolean; message: string }> {
    return this.client.post(`${API_PREFIX}/accounts/${accountId}/connect`, { phone });
  }

  async disconnect(accountId: string): Promise<void> {
    await this.client.post(`${API_PREFIX}/accounts/${accountId}/disconnect`);
  }

  async getStatus(accountId: string): Promise<AccountState> {
    const res = await this.client.get<{ data: AccountState }>(
      `${API_PREFIX}/accounts/${accountId}/status`,
    );
    return res.data;
  }

  async getGroups(accountId: string): Promise<{ id: string; name: string }[]> {
    const res = await this.client.get<{ data: { id: string; name: string }[] }>(
      `${API_PREFIX}/accounts/${accountId}/groups`,
    );
    return res.data;
  }

  // ── Messages ──────────────────────────────────────────────────

  async sendMessage(params: {
    accountId: string;
    to: string;
    message: string;
    media?: MediaPayload;
    metadata?: MessageMetadata;
  }): Promise<{ data: { messageId: string }; message: string }> {
    return this.client.post(`${API_PREFIX}/messages/send`, params);
  }

  async sendDirect(params: {
    accountId: string;
    to: string;
    message: string;
    media?: MediaPayload;
  }): Promise<{ success: boolean; message: string }> {
    return this.client.post(`${API_PREFIX}/messages/send-direct`, params);
  }

  async getQueueStatus(): Promise<QueueStatus> {
    const res = await this.client.get<{ data: QueueStatus }>(
      `${API_PREFIX}/messages/queue`,
    );
    return res.data;
  }

  // ── Bot ───────────────────────────────────────────────────────

  async getBotSettings(): Promise<BotSettings> {
    const res = await this.client.get<{ data: BotSettings }>(
      `${API_PREFIX}/bot/settings`,
    );
    return res.data;
  }

  async updateBotSettings(settings: BotSettings): Promise<void> {
    await this.client.put(`${API_PREFIX}/bot/settings`, settings);
  }
}

export const whatsappApi = new WhatsAppApiClient();
