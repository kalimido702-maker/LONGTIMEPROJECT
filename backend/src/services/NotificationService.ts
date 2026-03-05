import admin from "firebase-admin";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { randomUUID } from "crypto";
import { RowDataPacket } from "mysql2/promise";
import { db } from "../config/database-factory.js";
import { logger } from "../config/logger.js";

// Notification types
export type NotificationType =
  | "invoice"
  | "payment"
  | "return"
  | "info"
  | "promo"
  | "reminder";

export interface NotificationPayload {
  clientId: string;
  branchId?: string | null;
  userId?: string | null;
  customerId?: string | null;
  title: string;
  body: string;
  type: NotificationType;
  referenceId?: string | null;
  referenceType?: string | null;
  data?: Record<string, string>;
}

class NotificationService {
  private initialized = false;

  /**
   * Initialize Firebase Admin SDK with service account
   */
  initialize(): void {
    if (this.initialized) return;

    // Look for service account key in multiple locations
    const possiblePaths = [
      resolve(process.cwd(), "data/firebase-service-account.json"),
      resolve(process.cwd(), "../data/firebase-service-account.json"),
      resolve(process.cwd(), "firebase-service-account.json"),
    ];

    let serviceAccountPath: string | null = null;
    for (const p of possiblePaths) {
      if (existsSync(p)) {
        serviceAccountPath = p;
        break;
      }
    }

    if (!serviceAccountPath) {
      logger.warn(
        "Firebase service account key not found. Push notifications will be disabled. " +
          "Place firebase-service-account.json in backend/data/"
      );
      return;
    }

    try {
      const serviceAccount = JSON.parse(
        readFileSync(serviceAccountPath, "utf8")
      );

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });

      this.initialized = true;
      logger.info("Firebase Admin SDK initialized successfully");
    } catch (error) {
      logger.error({ error }, "Failed to initialize Firebase Admin SDK");
    }
  }

  /**
   * Check if push notifications are available
   */
  isEnabled(): boolean {
    return this.initialized;
  }

  // ─────────────────────────────────────────────────────────────
  // Core: Save notification to DB + send push
  // ─────────────────────────────────────────────────────────────

  /**
   * Create a notification record in DB and send push notification
   */
  async sendNotification(payload: NotificationPayload): Promise<void> {
    const {
      clientId,
      branchId,
      userId,
      customerId,
      title,
      body,
      type,
      referenceId,
      referenceType,
      data,
    } = payload;

    // 1. Save to notifications table
    const notificationId = randomUUID();
    try {
      await db.query(
        `INSERT INTO notifications (id, client_id, branch_id, user_id, customer_id, title, body, type, reference_id, reference_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          notificationId,
          clientId,
          branchId || null,
          userId || null,
          customerId || null,
          title,
          body,
          type,
          referenceId || null,
          referenceType || null,
        ]
      );
    } catch (error) {
      logger.error({ error, payload }, "Failed to save notification to DB");
      // Continue — still try to send push even if DB fails
    }

    // 2. Send push notification via FCM
    if (!this.initialized) return;

    try {
      const tokens = await this.getTargetTokens(
        clientId,
        branchId,
        userId,
        customerId
      );

      if (tokens.length === 0) {
        logger.debug(
          { clientId, userId, customerId },
          "No FCM tokens found for notification target"
        );
        return;
      }

      await this.sendPushToTokens(tokens, title, body, {
        type,
        referenceId: referenceId || "",
        referenceType: referenceType || "",
        notificationId,
        ...data,
      });
    } catch (error) {
      logger.error({ error }, "Failed to send push notification");
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Business-level notification helpers
  // ─────────────────────────────────────────────────────────────

  /**
   * Notify customer about a new invoice
   */
  async notifyNewInvoice(
    invoice: Record<string, any>,
    clientId: string,
    branchId?: string | null
  ): Promise<void> {
    const customerId = invoice.customer_id || invoice.customerId;
    if (!customerId) return; // Walk-in customer, no notification

    const total =
      invoice.total || invoice.total_amount || invoice.totalAmount || 0;
    const invoiceNumber =
      invoice.invoice_number || invoice.invoiceNumber || invoice.id;
    const customerName = invoice.customer_name || invoice.customerName || '';

    await this.sendNotification({
      clientId,
      branchId,
      customerId,
      title: "فاتورة جديدة",
      body: `العميل ${customerName} - تم إصدار فاتورة رقم ${invoiceNumber} بقيمة ${Number(total).toFixed(2)} جنيه`,
      type: "invoice",
      referenceId: invoice.id,
      referenceType: "invoice",
    });

    logger.info(
      { invoiceId: invoice.id, customerId },
      "New invoice notification sent"
    );
  }

  /**
   * Notify customer about a payment received
   */
  async notifyNewPayment(
    payment: Record<string, any>,
    clientId: string,
    branchId?: string | null
  ): Promise<void> {
    const customerId = payment.customer_id || payment.customerId;
    if (!customerId) return;

    const amount = payment.amount || 0;
    const customerName = payment.customer_name || payment.customerName || '';

    await this.sendNotification({
      clientId,
      branchId,
      customerId,
      title: "تم استلام دفعة",
      body: `العميل ${customerName} - تم استلام دفعة بقيمة ${Number(amount).toFixed(2)} جنيه`,
      type: "payment",
      referenceId: payment.id,
      referenceType: "payment",
    });

    logger.info(
      { paymentId: payment.id, customerId },
      "New payment notification sent"
    );
  }

  /**
   * Notify customer about a sales return
   */
  async notifyNewReturn(
    salesReturn: Record<string, any>,
    clientId: string,
    branchId?: string | null
  ): Promise<void> {
    const customerId = salesReturn.customer_id || salesReturn.customerId;
    if (!customerId) return;

    const total =
      salesReturn.total || salesReturn.total_amount || salesReturn.totalAmount || 0;
    const customerName = salesReturn.customer_name || salesReturn.customerName || '';

    await this.sendNotification({
      clientId,
      branchId,
      customerId,
      title: "مرتجع مبيعات",
      body: `العميل ${customerName} - تم تسجيل مرتجع بقيمة ${Number(total).toFixed(2)} جنيه`,
      type: "return",
      referenceId: salesReturn.id,
      referenceType: "sales_return",
    });

    logger.info(
      { returnId: salesReturn.id, customerId },
      "Sales return notification sent"
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────────────────────

  /**
   * Get FCM tokens for the target user/customer
   * Also sends to the customer's sales rep and their supervisor
   * Priority: userId > customerId > all users in branch
   */
  private async getTargetTokens(
    clientId: string,
    branchId?: string | null,
    userId?: string | null,
    customerId?: string | null
  ): Promise<string[]> {
    try {
      let tokens: string[] = [];

      if (userId) {
        // Direct user target
        const [rows] = await db.query<RowDataPacket[]>(
          "SELECT token FROM fcm_tokens WHERE user_id = ? AND client_id = ? AND is_active = 1",
          [userId, clientId]
        );
        tokens = rows.map((r) => r.token);
      } else if (customerId) {
        // Find user(s) linked to this customer
        const [users] = await db.query<RowDataPacket[]>(
          "SELECT id FROM users WHERE linked_customer_id = ? AND client_id = ?",
          [customerId, clientId]
        );

        if (users.length > 0) {
          const userIds = users.map((u) => u.id);
          const placeholders = userIds.map(() => "?").join(",");
          const [rows] = await db.query<RowDataPacket[]>(
            `SELECT token FROM fcm_tokens WHERE user_id IN (${placeholders}) AND client_id = ? AND is_active = 1`,
            [...userIds, clientId]
          );
          tokens = rows.map((r) => r.token);
        }

        // Also notify the sales rep and supervisor assigned to this customer
        const repSupervisorTokens = await this.getRepAndSupervisorTokens(
          clientId,
          customerId
        );
        tokens.push(...repSupervisorTokens);
      }

      return [...new Set(tokens)]; // Deduplicate
    } catch (error) {
      logger.error({ error }, "Failed to fetch FCM tokens");
      return [];
    }
  }

  /**
   * Get FCM tokens for the sales rep and supervisor linked to a customer
   * Customer → sales_rep_id → supervisor_id
   * Then find users linked to those reps/supervisors via linked_sales_rep_id / linked_supervisor_id
   */
  private async getRepAndSupervisorTokens(
    clientId: string,
    customerId: string
  ): Promise<string[]> {
    try {
      const tokens: string[] = [];

      // 1. Get the customer's sales_rep_id
      const [customerRows] = await db.query<RowDataPacket[]>(
        "SELECT sales_rep_id FROM customers WHERE id = ? AND client_id = ?",
        [customerId, clientId]
      );

      const salesRepId = customerRows[0]?.sales_rep_id;
      if (!salesRepId) return tokens;

      // 2. Get the sales rep's supervisor_id
      const [repRows] = await db.query<RowDataPacket[]>(
        "SELECT supervisor_id FROM sales_reps WHERE id = ? AND client_id = ?",
        [salesRepId, clientId]
      );
      const supervisorId = repRows[0]?.supervisor_id;

      // 3. Find user accounts linked to this sales rep
      const [repUsers] = await db.query<RowDataPacket[]>(
        "SELECT id FROM users WHERE linked_sales_rep_id = ? AND client_id = ? AND is_active = 1",
        [salesRepId, clientId]
      );

      // 4. Find user accounts linked to the supervisor (if exists)
      let supervisorUsers: RowDataPacket[] = [];
      if (supervisorId) {
        const [supRows] = await db.query<RowDataPacket[]>(
          "SELECT id FROM users WHERE linked_supervisor_id = ? AND client_id = ? AND is_active = 1",
          [supervisorId, clientId]
        );
        supervisorUsers = supRows;
      }

      // 5. Collect all user IDs and fetch their FCM tokens
      const allUserIds = [
        ...repUsers.map((u) => u.id),
        ...supervisorUsers.map((u) => u.id),
      ];

      if (allUserIds.length > 0) {
        const placeholders = allUserIds.map(() => "?").join(",");
        const [tokenRows] = await db.query<RowDataPacket[]>(
          `SELECT token FROM fcm_tokens WHERE user_id IN (${placeholders}) AND client_id = ? AND is_active = 1`,
          [...allUserIds, clientId]
        );
        tokens.push(...tokenRows.map((r) => r.token));
      }

      logger.debug(
        { customerId, salesRepId, supervisorId, tokenCount: tokens.length },
        "Fetched sales rep & supervisor tokens for customer notification"
      );

      return tokens;
    } catch (error) {
      logger.error(
        { error, customerId },
        "Failed to fetch rep/supervisor FCM tokens"
      );
      return [];
    }
  }

  /**
   * Send push notification to multiple FCM tokens
   * Handles token cleanup for invalid tokens
   */
  private async sendPushToTokens(
    tokens: string[],
    title: string,
    body: string,
    data: Record<string, string>
  ): Promise<void> {
    if (tokens.length === 0) return;

    // Firebase v1 API: use sendEachForMulticast
    const message: admin.messaging.MulticastMessage = {
      tokens,
      notification: {
        title,
        body,
      },
      data,
      android: {
        priority: "high",
        notification: {
          channelId: "mypos_notifications",
          sound: "default",
          clickAction: "FLUTTER_NOTIFICATION_CLICK",
        },
      },
      apns: {
        payload: {
          aps: {
            alert: { title, body },
            sound: "default",
            badge: 1,
          },
        },
      },
    };

    try {
      const response = await admin.messaging().sendEachForMulticast(message);

      logger.info(
        {
          successCount: response.successCount,
          failureCount: response.failureCount,
          totalTokens: tokens.length,
        },
        "FCM multicast result"
      );

      // Clean up invalid tokens
      if (response.failureCount > 0) {
        const invalidTokens: string[] = [];
        response.responses.forEach((resp, idx) => {
          if (resp.error) {
            const code = resp.error.code;
            // These error codes mean the token is permanently invalid
            if (
              code === "messaging/invalid-registration-token" ||
              code === "messaging/registration-token-not-registered"
            ) {
              invalidTokens.push(tokens[idx]);
            }
            logger.warn(
              { token: tokens[idx].substring(0, 20) + "...", error: code },
              "FCM send failed for token"
            );
          }
        });

        // Remove invalid tokens from DB
        if (invalidTokens.length > 0) {
          const placeholders = invalidTokens.map(() => "?").join(",");
          await db.query(
            `DELETE FROM fcm_tokens WHERE token IN (${placeholders})`,
            invalidTokens
          );
          logger.info(
            { count: invalidTokens.length },
            "Removed invalid FCM tokens"
          );
        }
      }
    } catch (error) {
      logger.error({ error }, "FCM sendEachForMulticast failed");
    }
  }

  /**
   * Send notification to all mobile users of a specific client/branch
   * Useful for broadcast messages
   */
  async broadcastToClient(
    clientId: string,
    branchId: string | null,
    title: string,
    body: string,
    type: NotificationType = "info",
    data?: Record<string, string>
  ): Promise<void> {
    try {
      // Get all active tokens for this client/branch
      let query: string;
      let params: any[];

      if (branchId) {
        query =
          "SELECT DISTINCT token FROM fcm_tokens WHERE client_id = ? AND (branch_id = ? OR branch_id IS NULL) AND is_active = 1";
        params = [clientId, branchId];
      } else {
        query =
          "SELECT DISTINCT token FROM fcm_tokens WHERE client_id = ? AND is_active = 1";
        params = [clientId];
      }

      const [rows] = await db.query<RowDataPacket[]>(query, params);
      const tokens = rows.map((r: any) => r.token);

      if (tokens.length === 0) return;

      await this.sendPushToTokens(tokens, title, body, {
        type,
        ...data,
      });

      logger.info(
        { clientId, branchId, tokenCount: tokens.length },
        "Broadcast notification sent"
      );
    } catch (error) {
      logger.error({ error }, "Failed to broadcast notification");
    }
  }
}

export const notificationService = new NotificationService();
