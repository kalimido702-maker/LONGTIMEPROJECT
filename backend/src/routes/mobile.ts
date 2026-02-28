import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { db } from "../config/database-factory.js";
import { logger } from "../config/logger.js";
import { RowDataPacket } from "mysql2/promise";
import { randomUUID } from "crypto";

/**
 * Mobile API Routes
 * 
 * These endpoints are designed specifically for the mobile app.
 * They add role-based data scoping:
 * - customer: sees only their own invoices/payments/returns
 * - sales_rep/salesman: sees only their assigned customers' data
 * - supervisor: sees data based on their permissions
 * - admin: sees everything
 * 
 * Business Rules:
 * - Only delivered invoices are shown to customers/reps
 * - Customer is linked via users.linked_customer_id
 * - Sales rep customers are linked via customers.sales_rep_id
 */

interface MobileQueryString {
  page?: number;
  limit?: number;
  search?: string;
  from_date?: string;
  to_date?: string;
  payment_status?: string;
  customer_id?: string;
}

export async function mobileRoutes(server: FastifyInstance) {

  // ============================================================
  // Helper: Get customer scoping WHERE clause based on user role
  // ============================================================
  async function getCustomerScope(
    userId: string,
    clientId: string,
    branchId: string,
    role: string,
    tableAlias: string = '',
    customerIdColumn: string = 'customer_id'
  ): Promise<{ conditions: string[]; params: any[] }> {
    const prefix = tableAlias ? `${tableAlias}.` : '';
    const conditions: string[] = [];
    const params: any[] = [];

    if (role === 'customer') {
      // Customer: find their linked customer record
      const [users] = await db.query<RowDataPacket[]>(
        "SELECT linked_customer_id FROM users WHERE id = ? AND client_id = ?",
        [userId, clientId]
      );

      if (users.length > 0 && users[0].linked_customer_id) {
        conditions.push(`${prefix}${customerIdColumn} = ?`);
        params.push(users[0].linked_customer_id);
      } else {
        // No linked customer — show nothing
        conditions.push("1 = 0");
      }
    } else if (role === 'sales_rep' || role === 'salesman' || role === 'salesRep') {
      // Sales rep: show only their assigned customers
      conditions.push(`${prefix}${customerIdColumn} IN (
        SELECT id FROM customers 
        WHERE sales_rep_id = ? AND client_id = ? AND branch_id = ? AND is_deleted = 0
      )`);
      params.push(userId, clientId, branchId);
    }
    // admin/supervisor: no additional filtering (sees everything in client+branch)

    return { conditions, params };
  }

  // ============================================================
  // GET /api/mobile/dashboard
  // Returns: balance, invoice count, total sales, total paid, total remaining
  // ============================================================
  server.get(
    "/dashboard",
    { preHandler: [server.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { userId, clientId, branchId, role } = request.user!;
        const scope = await getCustomerScope(userId, clientId, branchId, role, 'i');

        let whereConditions = [
          "i.client_id = ?",
          "i.branch_id = ?",
          "i.is_deleted = 0",
        ];
        let params: any[] = [clientId, branchId];

        // Only delivered invoices for mobile
        whereConditions.push("i.delivery_status = 'delivered'");

        if (scope.conditions.length > 0) {
          whereConditions.push(...scope.conditions);
          params.push(...scope.params);
        }

        const whereClause = whereConditions.join(" AND ");

        // Invoice stats
        const [stats] = await db.query<RowDataPacket[]>(
          `SELECT 
            COUNT(*) as total_invoices,
            COALESCE(SUM(i.total_amount), 0) as total_sales,
            COALESCE(SUM(i.paid_amount), 0) as total_paid,
            COALESCE(SUM(i.total_amount - i.paid_amount), 0) as total_remaining
          FROM invoices i
          WHERE ${whereClause}`,
          params
        );

        // Customer balance (if customer role)
        let customerBalance = null;
        if (role === 'customer') {
          const [users] = await db.query<RowDataPacket[]>(
            "SELECT linked_customer_id FROM users WHERE id = ?",
            [userId]
          );
          if (users.length > 0 && users[0].linked_customer_id) {
            const [balanceRows] = await db.query<RowDataPacket[]>(
              `SELECT current_balance, credit_limit, bonus_balance, name, phone
              FROM customers 
              WHERE id = ? AND client_id = ? AND branch_id = ? AND is_deleted = 0`,
              [users[0].linked_customer_id, clientId, branchId]
            );
            if (balanceRows.length > 0) {
              customerBalance = balanceRows[0];
            }
          }
        }

        // Payment stats (same scope)
        let payWhereConditions = [
          "p.client_id = ?",
          "p.branch_id = ?",
          "p.is_deleted = 0",
        ];
        let payParams: any[] = [clientId, branchId];

        const payScope = await getCustomerScope(userId, clientId, branchId, role, 'p');
        if (payScope.conditions.length > 0) {
          payWhereConditions.push(...payScope.conditions);
          payParams.push(...payScope.params);
        }

        const payWhereClause = payWhereConditions.join(" AND ");
        const [payStats] = await db.query<RowDataPacket[]>(
          `SELECT 
            COUNT(*) as total_payments,
            COALESCE(SUM(p.amount), 0) as total_payment_amount
          FROM payments p
          WHERE ${payWhereClause}`,
          payParams
        );

        // Returns stats
        let retWhereConditions = [
          "sr.client_id = ?",
          "sr.branch_id = ?",
          "sr.is_deleted = 0",
        ];
        let retParams: any[] = [clientId, branchId];

        const retScope = await getCustomerScope(userId, clientId, branchId, role, 'sr');
        if (retScope.conditions.length > 0) {
          retWhereConditions.push(...retScope.conditions);
          retParams.push(...retScope.params);
        }

        const retWhereClause = retWhereConditions.join(" AND ");
        const [retStats] = await db.query<RowDataPacket[]>(
          `SELECT 
            COUNT(*) as total_returns,
            COALESCE(SUM(sr.total), 0) as total_return_amount
          FROM sales_returns sr
          WHERE ${retWhereClause}`,
          retParams
        );

        return reply.code(200).send({
          data: {
            invoices: stats[0],
            payments: payStats[0],
            returns: retStats[0],
            customer: customerBalance,
          },
        });
      } catch (error) {
        logger.error({ error }, "Failed to fetch mobile dashboard");
        return reply.code(500).send({ error: "Failed to fetch dashboard" });
      }
    }
  );

  // ============================================================
  // GET /api/mobile/invoices
  // Delivered invoices only, scoped by role
  // ============================================================
  server.get<{ Querystring: MobileQueryString }>(
    "/invoices",
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const query = request.query as any;
        const { page = 1, limit = 50, search, from_date, to_date, payment_status } = query;
        const { userId, clientId, branchId, role } = request.user!;
        const offset = (page - 1) * limit;

        let whereConditions = [
          "i.client_id = ?",
          "i.branch_id = ?",
          "i.is_deleted = 0",
          "i.delivery_status = 'delivered'", // Only delivered invoices
        ];
        let params: any[] = [clientId, branchId];

        // Role-based scoping
        const scope = await getCustomerScope(userId, clientId, branchId, role, 'i');
        if (scope.conditions.length > 0) {
          whereConditions.push(...scope.conditions);
          params.push(...scope.params);
        }

        // Filters
        if (search) {
          whereConditions.push("(i.invoice_number LIKE ? OR c.name LIKE ?)");
          params.push(`%${search}%`, `%${search}%`);
        }
        if (from_date) {
          whereConditions.push("i.created_at >= ?");
          params.push(from_date);
        }
        if (to_date) {
          whereConditions.push("i.created_at <= ?");
          params.push(to_date);
        }
        if (payment_status === "paid") {
          whereConditions.push("i.paid_amount >= i.total_amount");
        } else if (payment_status === "unpaid") {
          whereConditions.push("i.paid_amount < i.total_amount");
        }

        if (query.customer_id) {
          whereConditions.push("i.customer_id = ?");
          params.push(query.customer_id);
        }

        const whereClause = whereConditions.join(" AND ");

        // Count
        const [countRows] = await db.query<RowDataPacket[]>(
          `SELECT COUNT(*) as total FROM invoices i
           LEFT JOIN customers c ON i.customer_id = c.id
           WHERE ${whereClause}`,
          params
        );
        const total = countRows[0].total;

        // Get invoices
        const [invoices] = await db.query<RowDataPacket[]>(
          `SELECT i.*, c.name as customer_name, c.phone as customer_phone,
                  (i.total_amount - i.paid_amount) as remaining_amount
           FROM invoices i
           LEFT JOIN customers c ON i.customer_id = c.id
           WHERE ${whereClause}
           ORDER BY i.created_at DESC
           LIMIT ? OFFSET ?`,
          [...params, Number(limit), Number(offset)]
        );

        return reply.code(200).send({
          data: invoices,
          pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) },
        });
      } catch (error) {
        logger.error({ error }, "Failed to fetch mobile invoices");
        return reply.code(500).send({ error: "Failed to fetch invoices" });
      }
    }
  );

  // ============================================================
  // GET /api/mobile/invoices/:id
  // Single invoice with items
  // ============================================================
  server.get<{ Params: { id: string } }>(
    "/invoices/:id",
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const { userId, clientId, branchId, role } = request.user!;

        let whereConditions = [
          "i.id = ?",
          "i.client_id = ?",
          "i.branch_id = ?",
          "i.is_deleted = 0",
        ];
        let params: any[] = [id, clientId, branchId];

        const scope = await getCustomerScope(userId, clientId, branchId, role, 'i');
        if (scope.conditions.length > 0) {
          whereConditions.push(...scope.conditions);
          params.push(...scope.params);
        }

        const whereClause = whereConditions.join(" AND ");

        const [invoices] = await db.query<RowDataPacket[]>(
          `SELECT i.*, c.name as customer_name, c.phone as customer_phone,
                  (i.total_amount - i.paid_amount) as remaining_amount
           FROM invoices i
           LEFT JOIN customers c ON i.customer_id = c.id
           WHERE ${whereClause}`,
          params
        );

        if (invoices.length === 0) {
          return reply.code(404).send({ error: "Invoice not found" });
        }

        // Get items - try items_json first (from migration 023), fallback to invoice_items table
        let items: any[] = [];
        const invoice = invoices[0];

        if (invoice.items_json) {
          try {
            items = typeof invoice.items_json === 'string' 
              ? JSON.parse(invoice.items_json) 
              : invoice.items_json;
          } catch { }
        }

        if (items.length === 0) {
          const [itemRows] = await db.query<RowDataPacket[]>(
            `SELECT ii.*, p.name as product_name, p.barcode
             FROM invoice_items ii
             LEFT JOIN products p ON ii.product_id = p.id
             WHERE ii.invoice_id = ? AND ii.client_id = ?`,
            [id, clientId]
          );
          items = itemRows;
        }

        return reply.code(200).send({
          data: { ...invoice, items },
        });
      } catch (error) {
        logger.error({ error }, "Failed to fetch mobile invoice");
        return reply.code(500).send({ error: "Failed to fetch invoice" });
      }
    }
  );

  // ============================================================
  // GET /api/mobile/payments
  // Payments (سندات قبض) scoped by role
  // ============================================================
  server.get<{ Querystring: MobileQueryString }>(
    "/payments",
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const query = request.query as any;
        const { page = 1, limit = 50, search, from_date, to_date } = query;
        const { userId, clientId, branchId, role } = request.user!;
        const offset = (page - 1) * limit;

        let whereConditions = [
          "p.client_id = ?",
          "p.branch_id = ?",
          "p.is_deleted = 0",
        ];
        let params: any[] = [clientId, branchId];

        const scope = await getCustomerScope(userId, clientId, branchId, role, 'p');
        if (scope.conditions.length > 0) {
          whereConditions.push(...scope.conditions);
          params.push(...scope.params);
        }

        if (search) {
          whereConditions.push("(p.customer_name LIKE ? OR p.notes LIKE ? OR c.name LIKE ?)");
          params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (from_date) {
          whereConditions.push("p.payment_date >= ?");
          params.push(from_date);
        }
        if (to_date) {
          whereConditions.push("p.payment_date <= ?");
          params.push(to_date);
        }
        if (query.customer_id) {
          whereConditions.push("p.customer_id = ?");
          params.push(query.customer_id);
        }

        const whereClause = whereConditions.join(" AND ");

        const [countRows] = await db.query<RowDataPacket[]>(
          `SELECT COUNT(*) as total FROM payments p
           LEFT JOIN customers c ON p.customer_id = c.id
           WHERE ${whereClause}`,
          params
        );
        const total = countRows[0].total;

        const [payments] = await db.query<RowDataPacket[]>(
          `SELECT p.*, 
                  COALESCE(p.customer_name, c.name) as customer_name,
                  COALESCE(p.user_name, u.full_name) as user_name,
                  COALESCE(p.payment_method_name, pm.name) as payment_method_name
           FROM payments p
           LEFT JOIN customers c ON p.customer_id = c.id
           LEFT JOIN users u ON p.created_by = u.id
           LEFT JOIN payment_methods pm ON p.payment_method_id = pm.id
           WHERE ${whereClause}
           ORDER BY p.payment_date DESC, p.created_at DESC
           LIMIT ? OFFSET ?`,
          [...params, Number(limit), Number(offset)]
        );

        return reply.code(200).send({
          data: payments,
          pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) },
        });
      } catch (error) {
        logger.error({ error }, "Failed to fetch mobile payments");
        return reply.code(500).send({ error: "Failed to fetch payments" });
      }
    }
  );

  // ============================================================
  // GET /api/mobile/returns
  // Sales returns scoped by role
  // ============================================================
  server.get<{ Querystring: MobileQueryString }>(
    "/returns",
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const query = request.query as any;
        const { page = 1, limit = 50, search, from_date, to_date } = query;
        const { userId, clientId, branchId, role } = request.user!;
        const offset = (page - 1) * limit;

        let whereConditions = [
          "sr.client_id = ?",
          "sr.branch_id = ?",
          "sr.is_deleted = 0",
        ];
        let params: any[] = [clientId, branchId];

        const scope = await getCustomerScope(userId, clientId, branchId, role, 'sr');
        if (scope.conditions.length > 0) {
          whereConditions.push(...scope.conditions);
          params.push(...scope.params);
        }

        if (search) {
          whereConditions.push("(sr.return_number LIKE ? OR c.name LIKE ?)");
          params.push(`%${search}%`, `%${search}%`);
        }
        if (from_date) {
          whereConditions.push("sr.return_date >= ?");
          params.push(from_date);
        }
        if (to_date) {
          whereConditions.push("sr.return_date <= ?");
          params.push(to_date);
        }
        if (query.customer_id) {
          whereConditions.push("sr.customer_id = ?");
          params.push(query.customer_id);
        }

        const whereClause = whereConditions.join(" AND ");

        const [countRows] = await db.query<RowDataPacket[]>(
          `SELECT COUNT(*) as total FROM sales_returns sr
           LEFT JOIN customers c ON sr.customer_id = c.id
           WHERE ${whereClause}`,
          params
        );
        const total = countRows[0].total;

        const [returns] = await db.query<RowDataPacket[]>(
          `SELECT sr.*, c.name as customer_name
           FROM sales_returns sr
           LEFT JOIN customers c ON sr.customer_id = c.id
           WHERE ${whereClause}
           ORDER BY sr.return_date DESC, sr.created_at DESC
           LIMIT ? OFFSET ?`,
          [...params, Number(limit), Number(offset)]
        );

        return reply.code(200).send({
          data: returns,
          pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) },
        });
      } catch (error) {
        logger.error({ error }, "Failed to fetch mobile returns");
        return reply.code(500).send({ error: "Failed to fetch returns" });
      }
    }
  );

  // ============================================================
  // GET /api/mobile/account-statement
  // كشف حساب - Chronological debit/credit with running balance
  // ============================================================
  server.get<{ Querystring: MobileQueryString }>(
    "/account-statement",
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const query = request.query as any;
        const { from_date, to_date, customer_id } = query;
        const { userId, clientId, branchId, role } = request.user!;

        // Determine target customer
        let targetCustomerId = customer_id;

        if (role === 'customer') {
          const [users] = await db.query<RowDataPacket[]>(
            "SELECT linked_customer_id FROM users WHERE id = ?",
            [userId]
          );
          if (users.length === 0 || !users[0].linked_customer_id) {
            return reply.code(200).send({ data: { entries: [], totals: { debit: 0, credit: 0, balance: 0 } } });
          }
          targetCustomerId = users[0].linked_customer_id;
        }

        if (!targetCustomerId && (role === 'sales_rep' || role === 'salesman' || role === 'salesRep')) {
          // Sales rep without specific customer — return error
          return reply.code(400).send({ error: "customer_id is required for sales reps" });
        }

        // Build entries from invoices (debits) — only delivered
        let invoiceWhere = [
          "i.client_id = ?",
          "i.branch_id = ?",
          "i.is_deleted = 0",
          "i.delivery_status = 'delivered'",
        ];
        let invoiceParams: any[] = [clientId, branchId];

        if (targetCustomerId) {
          invoiceWhere.push("i.customer_id = ?");
          invoiceParams.push(targetCustomerId);
        } else {
          // Admin with no filter — add role scope
          const scope = await getCustomerScope(userId, clientId, branchId, role, 'i');
          if (scope.conditions.length > 0) {
            invoiceWhere.push(...scope.conditions);
            invoiceParams.push(...scope.params);
          }
        }

        if (from_date) { invoiceWhere.push("i.created_at >= ?"); invoiceParams.push(from_date); }
        if (to_date) { invoiceWhere.push("i.created_at <= ?"); invoiceParams.push(to_date); }

        const [invoices] = await db.query<RowDataPacket[]>(
          `SELECT 
            i.id, 'invoice' as type, 
            CONCAT('فاتورة ', COALESCE(i.invoice_number, i.id)) as description,
            i.total_amount as debit, 0 as credit,
            i.invoice_number as reference_number,
            c.name as customer_name,
            i.created_at as date
          FROM invoices i
          LEFT JOIN customers c ON i.customer_id = c.id
          WHERE ${invoiceWhere.join(" AND ")}`,
          invoiceParams
        );

        // Build entries from payments (credits)
        let payWhere = ["p.client_id = ?", "p.branch_id = ?", "p.is_deleted = 0"];
        let payParams: any[] = [clientId, branchId];

        if (targetCustomerId) {
          payWhere.push("p.customer_id = ?");
          payParams.push(targetCustomerId);
        } else {
          const scope = await getCustomerScope(userId, clientId, branchId, role, 'p');
          if (scope.conditions.length > 0) {
            payWhere.push(...scope.conditions);
            payParams.push(...scope.params);
          }
        }

        if (from_date) { payWhere.push("p.payment_date >= ?"); payParams.push(from_date); }
        if (to_date) { payWhere.push("p.payment_date <= ?"); payParams.push(to_date); }

        const [payments] = await db.query<RowDataPacket[]>(
          `SELECT 
            p.id, 'payment' as type,
            CONCAT('سند قبض ', COALESCE(p.reference_number, p.id)) as description,
            0 as debit, p.amount as credit,
            p.reference_number,
            COALESCE(p.customer_name, c.name) as customer_name,
            COALESCE(p.payment_date, p.created_at) as date
          FROM payments p
          LEFT JOIN customers c ON p.customer_id = c.id
          WHERE ${payWhere.join(" AND ")}`,
          payParams
        );

        // Build entries from returns (credits)
        let retWhere = ["sr.client_id = ?", "sr.branch_id = ?", "sr.is_deleted = 0"];
        let retParams: any[] = [clientId, branchId];

        if (targetCustomerId) {
          retWhere.push("sr.customer_id = ?");
          retParams.push(targetCustomerId);
        } else {
          const scope = await getCustomerScope(userId, clientId, branchId, role, 'sr');
          if (scope.conditions.length > 0) {
            retWhere.push(...scope.conditions);
            retParams.push(...scope.params);
          }
        }

        if (from_date) { retWhere.push("sr.return_date >= ?"); retParams.push(from_date); }
        if (to_date) { retWhere.push("sr.return_date <= ?"); retParams.push(to_date); }

        const [returns] = await db.query<RowDataPacket[]>(
          `SELECT 
            sr.id, 'return' as type,
            CONCAT('مرتجع ', COALESCE(sr.return_number, sr.id)) as description,
            0 as debit, sr.total as credit,
            sr.return_number as reference_number,
            c.name as customer_name,
            COALESCE(sr.return_date, sr.created_at) as date
          FROM sales_returns sr
          LEFT JOIN customers c ON sr.customer_id = c.id
          WHERE ${retWhere.join(" AND ")}`,
          retParams
        );

        // Combine and sort by date
        const allEntries = [...invoices, ...payments, ...returns]
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // Calculate running balance
        let runningBalance = 0;
        const entries = allEntries.map((entry) => {
          runningBalance += Number(entry.debit || 0) - Number(entry.credit || 0);
          return {
            ...entry,
            debit: Number(entry.debit || 0),
            credit: Number(entry.credit || 0),
            balance: runningBalance,
          };
        });

        // Totals
        const totalDebit = entries.reduce((sum, e) => sum + e.debit, 0);
        const totalCredit = entries.reduce((sum, e) => sum + e.credit, 0);

        return reply.code(200).send({
          data: {
            entries: entries.reverse(), // Latest first
            totals: {
              debit: totalDebit,
              credit: totalCredit,
              balance: runningBalance,
            },
          },
        });
      } catch (error) {
        logger.error({ error }, "Failed to fetch account statement");
        return reply.code(500).send({ error: "Failed to fetch account statement" });
      }
    }
  );

  // ============================================================
  // GET /api/mobile/customers
  // For sales reps/supervisors: list their assigned customers
  // ============================================================
  server.get<{ Querystring: MobileQueryString }>(
    "/customers",
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const query = request.query as any;
        const { page = 1, limit = 50, search } = query;
        const { userId, clientId, branchId, role } = request.user!;
        const offset = (page - 1) * limit;

        let whereConditions = [
          "c.client_id = ?",
          "c.branch_id = ?",
          "c.is_deleted = 0",
          "c.is_active = 1",
        ];
        let params: any[] = [clientId, branchId];

        // Role scoping
        if (role === 'customer') {
          // Customer shouldn't list other customers
          return reply.code(200).send({ data: [], pagination: { page: 1, limit, total: 0, pages: 0 } });
        } else if (role === 'sales_rep' || role === 'salesman' || role === 'salesRep') {
          whereConditions.push("c.sales_rep_id = ?");
          params.push(userId);
        }

        if (search) {
          whereConditions.push("(c.name LIKE ? OR c.phone LIKE ?)");
          params.push(`%${search}%`, `%${search}%`);
        }

        const whereClause = whereConditions.join(" AND ");

        const [countRows] = await db.query<RowDataPacket[]>(
          `SELECT COUNT(*) as total FROM customers c WHERE ${whereClause}`,
          params
        );
        const total = countRows[0].total;

        const [customers] = await db.query<RowDataPacket[]>(
          `SELECT c.id, c.name, c.phone, c.address, c.current_balance, c.credit_limit,
                  c.bonus_balance, c.previous_statement
           FROM customers c
           WHERE ${whereClause}
           ORDER BY c.name ASC
           LIMIT ? OFFSET ?`,
          [...params, Number(limit), Number(offset)]
        );

        return reply.code(200).send({
          data: customers,
          pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) },
        });
      } catch (error) {
        logger.error({ error }, "Failed to fetch mobile customers");
        return reply.code(500).send({ error: "Failed to fetch customers" });
      }
    }
  );

  // ============================================================
  // POST /api/mobile/fcm-token
  // Register/update FCM device token for push notifications
  // ============================================================
  server.post<{ Body: { token: string; device_type?: string; device_name?: string } }>(
    "/fcm-token",
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { token, device_type, device_name } = request.body;
        const { userId, clientId, branchId } = request.user!;

        if (!token) {
          return reply.code(400).send({ error: "Token is required" });
        }

        // Upsert: delete old token for this device, insert new one
        await db.query(
          "DELETE FROM fcm_tokens WHERE user_id = ? AND token = ?",
          [userId, token]
        );

        await db.query(
          `INSERT INTO fcm_tokens (id, user_id, client_id, branch_id, token, device_type, device_name)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [randomUUID(), userId, clientId, branchId, token, device_type || 'android', device_name || null]
        );

        return reply.code(200).send({ message: "FCM token registered" });
      } catch (error) {
        logger.error({ error }, "Failed to register FCM token");
        return reply.code(500).send({ error: "Failed to register token" });
      }
    }
  );

  // ============================================================
  // DELETE /api/mobile/fcm-token
  // Remove FCM token on logout
  // ============================================================
  server.delete<{ Body: { token: string } }>(
    "/fcm-token",
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { token } = request.body;
        const { userId } = request.user!;

        await db.query(
          "DELETE FROM fcm_tokens WHERE user_id = ? AND token = ?",
          [userId, token]
        );

        return reply.code(200).send({ message: "FCM token removed" });
      } catch (error) {
        logger.error({ error }, "Failed to remove FCM token");
        return reply.code(500).send({ error: "Failed to remove token" });
      }
    }
  );

  // ============================================================
  // GET /api/mobile/notifications
  // Get user notifications
  // ============================================================
  server.get<{ Querystring: { page?: number; limit?: number } }>(
    "/notifications",
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const query = request.query as any;
        const { page = 1, limit = 50 } = query;
        const { userId, clientId, branchId, role } = request.user!;
        const offset = (page - 1) * limit;

        let targetUserId = userId;
        let targetCustomerId: string | null = null;

        if (role === 'customer') {
          const [users] = await db.query<RowDataPacket[]>(
            "SELECT linked_customer_id FROM users WHERE id = ?",
            [userId]
          );
          if (users.length > 0 && users[0].linked_customer_id) {
            targetCustomerId = users[0].linked_customer_id;
          }
        }

        let whereConditions = [
          "n.client_id = ?",
          `(n.user_id = ? ${targetCustomerId ? 'OR n.customer_id = ?' : ''} OR n.user_id IS NULL)`,
        ];
        let params: any[] = [clientId, targetUserId];
        if (targetCustomerId) {
          params.push(targetCustomerId);
        }

        const whereClause = whereConditions.join(" AND ");

        const [countRows] = await db.query<RowDataPacket[]>(
          `SELECT COUNT(*) as total FROM notifications n WHERE ${whereClause}`,
          params
        );
        const total = countRows[0].total;

        const [notifications] = await db.query<RowDataPacket[]>(
          `SELECT * FROM notifications n
           WHERE ${whereClause}
           ORDER BY n.created_at DESC
           LIMIT ? OFFSET ?`,
          [...params, Number(limit), Number(offset)]
        );

        // Count unread
        const [unreadRows] = await db.query<RowDataPacket[]>(
          `SELECT COUNT(*) as unread FROM notifications n WHERE ${whereClause} AND n.is_read = 0`,
          params
        );

        return reply.code(200).send({
          data: notifications,
          unread: unreadRows[0].unread,
          pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) },
        });
      } catch (error) {
        logger.error({ error }, "Failed to fetch notifications");
        return reply.code(500).send({ error: "Failed to fetch notifications" });
      }
    }
  );

  // ============================================================
  // PUT /api/mobile/notifications/:id/read
  // Mark notification as read
  // ============================================================
  server.put<{ Params: { id: string } }>(
    "/notifications/:id/read",
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { id } = request.params;
        await db.query("UPDATE notifications SET is_read = 1 WHERE id = ?", [id]);
        return reply.code(200).send({ message: "Notification marked as read" });
      } catch (error) {
        logger.error({ error }, "Failed to mark notification as read");
        return reply.code(500).send({ error: "Failed to update notification" });
      }
    }
  );

  // ============================================================
  // PUT /api/mobile/notifications/read-all
  // Mark all notifications as read
  // ============================================================
  server.put(
    "/notifications/read-all",
    { preHandler: [server.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { userId, clientId } = request.user!;
        await db.query(
          "UPDATE notifications SET is_read = 1 WHERE client_id = ? AND (user_id = ? OR user_id IS NULL)",
          [clientId, userId]
        );
        return reply.code(200).send({ message: "All notifications marked as read" });
      } catch (error) {
        logger.error({ error }, "Failed to mark all notifications as read");
        return reply.code(500).send({ error: "Failed to update notifications" });
      }
    }
  );

  // ============================================================
  // GET /api/mobile/profile
  // Get current user profile + linked customer info
  // ============================================================
  server.get(
    "/profile",
    { preHandler: [server.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { userId, clientId, branchId, role } = request.user!;

        const [users] = await db.query<RowDataPacket[]>(
          `SELECT id, username, full_name, email, phone, role, linked_customer_id
           FROM users WHERE id = ? AND client_id = ?`,
          [userId, clientId]
        );

        if (users.length === 0) {
          return reply.code(404).send({ error: "User not found" });
        }

        const user = users[0];
        let customer = null;

        if (user.linked_customer_id) {
          const [customers] = await db.query<RowDataPacket[]>(
            `SELECT id, name, phone, address, current_balance, credit_limit, bonus_balance
             FROM customers WHERE id = ? AND client_id = ?`,
            [user.linked_customer_id, clientId]
          );
          if (customers.length > 0) {
            customer = customers[0];
          }
        }

        return reply.code(200).send({
          data: {
            ...user,
            customer,
          },
        });
      } catch (error) {
        logger.error({ error }, "Failed to fetch profile");
        return reply.code(500).send({ error: "Failed to fetch profile" });
      }
    }
  );
}
