import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { db } from "../config/database-factory.js";
import { logger } from "../config/logger.js";
import { RowDataPacket, ResultSetHeader } from "mysql2/promise";

interface InvoiceItem {
  product_id: number;
  quantity: number;
  unit_price: number;
  discount?: number;
  tax?: number;
}

interface InvoiceBody {
  invoice_number: string;
  invoice_date: string;
  customer_id?: number;
  total_amount: number;
  discount_amount?: number;
  tax_amount?: number;
  paid_amount?: number;
  payment_method?: string;
  notes?: string;
  items: InvoiceItem[];
}

interface InvoiceQueryString {
  page?: number;
  limit?: number;
  search?: string;
  customer_id?: number;
  from_date?: string;
  to_date?: string;
  payment_status?: string;
}

export default async function invoiceRoutes(server: FastifyInstance) {
  // GET /api/invoices - List all invoices
  server.get<{ Querystring: InvoiceQueryString }>(
    "/",
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const query = request.query as any;
        const {
          page = 1,
          limit = 50,
          search,
          customer_id,
          from_date,
          to_date,
          payment_status,
        } = query;
        const { clientId, branchId } = request.user!;
        const offset = (page - 1) * limit;

        let whereConditions = [
          "i.client_id = ?",
          "i.branch_id = ?",
          "i.is_deleted = 0",
        ];
        let params: any[] = [clientId, branchId];

        if (search) {
          whereConditions.push("i.invoice_number LIKE ?");
          params.push(`%${search}%`);
        }

        if (customer_id) {
          whereConditions.push("i.customer_id = ?");
          params.push(customer_id);
        }

        if (from_date) {
          whereConditions.push("i.invoice_date >= ?");
          params.push(from_date);
        }

        if (to_date) {
          whereConditions.push("i.invoice_date <= ?");
          params.push(to_date);
        }

        if (payment_status === "paid") {
          whereConditions.push("i.paid_amount >= i.total_amount");
        } else if (payment_status === "partial") {
          whereConditions.push(
            "i.paid_amount > 0 AND i.paid_amount < i.total_amount"
          );
        } else if (payment_status === "unpaid") {
          whereConditions.push("i.paid_amount = 0");
        }

        const whereClause = whereConditions.join(" AND ");

        // Get total count
        const [countRows] = await db.query<RowDataPacket[]>(
          `SELECT COUNT(*) as total FROM invoices i WHERE ${whereClause}`,
          params
        );
        const total = countRows[0].total;

        // Get invoices
        const [invoices] = await db.query<RowDataPacket[]>(
          `SELECT i.*, c.name as customer_name,
                  (i.total_amount - i.paid_amount) as remaining_amount
           FROM invoices i 
           LEFT JOIN customers c ON i.customer_id = c.id 
           WHERE ${whereClause} 
           ORDER BY i.invoice_date DESC, i.created_at DESC 
           LIMIT ? OFFSET ?`,
          [...params, limit, offset]
        );

        return reply.code(200).send({
          data: invoices,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
          },
        });
      } catch (error) {
        logger.error({ error }, "Failed to fetch invoices");
        return reply.code(500).send({ error: "Failed to fetch invoices" });
      }
    }
  );

  // GET /api/invoices/:id - Get single invoice with items
  server.get<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const { clientId, branchId } = request.user!;

        // Get invoice
        const [invoices] = await db.query<RowDataPacket[]>(
          `SELECT i.*, c.name as customer_name, c.phone as customer_phone,
                  (i.total_amount - i.paid_amount) as remaining_amount
           FROM invoices i 
           LEFT JOIN customers c ON i.customer_id = c.id 
           WHERE i.id = ? AND i.client_id = ? AND i.branch_id = ? AND i.is_deleted = 0`,
          [id, clientId, branchId]
        );

        if (invoices.length === 0) {
          return reply.code(404).send({ error: "Invoice not found" });
        }

        // Get invoice items
        const [items] = await db.query<RowDataPacket[]>(
          `SELECT ii.*, p.name as product_name, p.barcode 
           FROM invoice_items ii 
           LEFT JOIN products p ON ii.product_id = p.id 
           WHERE ii.invoice_id = ? AND ii.client_id = ? AND ii.branch_id = ?`,
          [id, clientId, branchId]
        );

        return reply.code(200).send({
          data: {
            ...invoices[0],
            items,
          },
        });
      } catch (error) {
        logger.error({ error }, "Failed to fetch invoice");
        return reply.code(500).send({ error: "Failed to fetch invoice" });
      }
    }
  );

  // POST /api/invoices - Create invoice
  server.post<{ Body: InvoiceBody }>(
    "/",
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      const connection = await db.getConnection();

      try {
        const invoice = request.body;
        const { clientId, branchId, userId } = request.user!;

        await connection.beginTransaction();

        // Check if invoice number exists
        const [existing] = await connection.query<RowDataPacket[]>(
          `SELECT id FROM invoices 
           WHERE invoice_number = ? AND client_id = ? AND branch_id = ? AND is_deleted = 0`,
          [invoice.invoice_number, clientId, branchId]
        );

        if (existing.length > 0) {
          await connection.rollback();
          connection.release();
          return reply
            .code(400)
            .send({ error: "Invoice number already exists" });
        }

        // Insert invoice
        const [invoiceResult] = await connection.query<ResultSetHeader>(
          `INSERT INTO invoices (
            client_id, branch_id, invoice_number, invoice_date, customer_id,
            total_amount, discount_amount, tax_amount, paid_amount,
            payment_method, notes, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            clientId,
            branchId,
            invoice.invoice_number,
            invoice.invoice_date,
            invoice.customer_id,
            invoice.total_amount,
            invoice.discount_amount || 0,
            invoice.tax_amount || 0,
            invoice.paid_amount || 0,
            invoice.payment_method,
            invoice.notes,
            userId,
          ]
        );

        const invoiceId = invoiceResult.insertId;

        // Insert invoice items
        for (const item of invoice.items) {
          const itemTotal =
            item.quantity * item.unit_price -
            (item.discount || 0) +
            (item.tax || 0);

          await connection.query(
            `INSERT INTO invoice_items (
              client_id, branch_id, invoice_id, product_id, quantity,
              unit_price, discount, tax, total_price
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              clientId,
              branchId,
              invoiceId,
              item.product_id,
              item.quantity,
              item.unit_price,
              item.discount || 0,
              item.tax || 0,
              itemTotal,
            ]
          );

          // Update product stock
          await connection.query(
            `UPDATE products 
             SET stock_quantity = stock_quantity - ? 
             WHERE id = ? AND client_id = ? AND branch_id = ?`,
            [item.quantity, item.product_id, clientId, branchId]
          );
        }

        // Update customer balance if partial payment
        if (
          invoice.customer_id &&
          (invoice.paid_amount || 0) < invoice.total_amount
        ) {
          const remainingAmount =
            invoice.total_amount - (invoice.paid_amount || 0);
          await connection.query(
            `UPDATE customers 
             SET current_balance = current_balance + ? 
             WHERE id = ? AND client_id = ? AND branch_id = ?`,
            [remainingAmount, invoice.customer_id, clientId, branchId]
          );
        }

        await connection.commit();
        connection.release();

        return reply.code(201).send({
          message: "Invoice created successfully",
          id: invoiceId,
        });
      } catch (error) {
        await connection.rollback();
        connection.release();
        logger.error({ error }, "Failed to create invoice");
        return reply.code(500).send({ error: "Failed to create invoice" });
      }
    }
  );

  // PUT /api/invoices/:id/payment - Update invoice payment
  server.put<{
    Params: { id: string };
    Body: { paid_amount: number; payment_method?: string };
  }>(
    "/:id/payment",
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      const connection = await db.getConnection();

      try {
        const { id } = request.params;
        const { paid_amount, payment_method } = request.body;
        const { clientId, branchId } = request.user!;

        await connection.beginTransaction();

        // Get current invoice
        const [invoices] = await connection.query<RowDataPacket[]>(
          `SELECT customer_id, total_amount, paid_amount 
           FROM invoices 
           WHERE id = ? AND client_id = ? AND branch_id = ? AND is_deleted = 0`,
          [id, clientId, branchId]
        );

        if (invoices.length === 0) {
          await connection.rollback();
          connection.release();
          return reply.code(404).send({ error: "Invoice not found" });
        }

        const invoice = invoices[0];
        const oldPaidAmount = invoice.paid_amount;
        const paymentDiff = paid_amount - oldPaidAmount;

        // Update invoice
        await connection.query(
          `UPDATE invoices 
           SET paid_amount = ?, payment_method = ? 
           WHERE id = ? AND client_id = ? AND branch_id = ?`,
          [paid_amount, payment_method, id, clientId, branchId]
        );

        // Update customer balance
        if (invoice.customer_id) {
          const balanceChange =
            invoice.total_amount -
            oldPaidAmount -
            (invoice.total_amount - paid_amount);
          await connection.query(
            `UPDATE customers 
             SET current_balance = current_balance - ? 
             WHERE id = ? AND client_id = ? AND branch_id = ?`,
            [balanceChange, invoice.customer_id, clientId, branchId]
          );
        }

        await connection.commit();
        connection.release();

        return reply
          .code(200)
          .send({ message: "Payment updated successfully" });
      } catch (error) {
        await connection.rollback();
        connection.release();
        logger.error({ error }, "Failed to update payment");
        return reply.code(500).send({ error: "Failed to update payment" });
      }
    }
  );

  // DELETE /api/invoices/:id - Soft delete invoice
  server.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      const connection = await db.getConnection();

      try {
        const { id } = request.params;
        const { clientId, branchId, userId } = request.user!;

        await connection.beginTransaction();

        // Get invoice with items
        const [invoices] = await connection.query<RowDataPacket[]>(
          `SELECT customer_id, total_amount, paid_amount 
           FROM invoices 
           WHERE id = ? AND client_id = ? AND branch_id = ? AND is_deleted = 0`,
          [id, clientId, branchId]
        );

        if (invoices.length === 0) {
          await connection.rollback();
          connection.release();
          return reply.code(404).send({ error: "Invoice not found" });
        }

        const invoice = invoices[0];

        // Get items to restore stock
        const [items] = await connection.query<RowDataPacket[]>(
          `SELECT product_id, quantity 
           FROM invoice_items 
           WHERE invoice_id = ? AND client_id = ? AND branch_id = ?`,
          [id, clientId, branchId]
        );

        // Restore product stock
        for (const item of items) {
          await connection.query(
            `UPDATE products 
             SET stock_quantity = stock_quantity + ? 
             WHERE id = ? AND client_id = ? AND branch_id = ?`,
            [item.quantity, item.product_id, clientId, branchId]
          );
        }

        // Update customer balance
        if (invoice.customer_id) {
          const remainingAmount = invoice.total_amount - invoice.paid_amount;
          if (remainingAmount > 0) {
            await connection.query(
              `UPDATE customers 
               SET current_balance = current_balance - ? 
               WHERE id = ? AND client_id = ? AND branch_id = ?`,
              [remainingAmount, invoice.customer_id, clientId, branchId]
            );
          }
        }

        // Soft delete invoice
        await connection.query(
          `UPDATE invoices 
           SET is_deleted = 1, updated_by = ? 
           WHERE id = ? AND client_id = ? AND branch_id = ?`,
          [userId, id, clientId, branchId]
        );

        await connection.commit();
        connection.release();

        return reply
          .code(200)
          .send({ message: "Invoice deleted successfully" });
      } catch (error) {
        await connection.rollback();
        connection.release();
        logger.error({ error }, "Failed to delete invoice");
        return reply.code(500).send({ error: "Failed to delete invoice" });
      }
    }
  );

  // GET /api/invoices/stats/summary - Get invoice statistics
  server.get(
    "/stats/summary",
    { preHandler: [server.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { clientId, branchId } = request.user!;

        const [stats] = await db.query<RowDataPacket[]>(
          `SELECT 
            COUNT(*) as total_invoices,
            SUM(total_amount) as total_sales,
            SUM(paid_amount) as total_paid,
            SUM(total_amount - paid_amount) as total_remaining,
            AVG(total_amount) as average_invoice
           FROM invoices 
           WHERE client_id = ? AND branch_id = ? AND is_deleted = 0`,
          [clientId, branchId]
        );

        return reply.code(200).send({ data: stats[0] });
      } catch (error) {
        logger.error({ error }, "Failed to fetch invoice stats");
        return reply.code(500).send({ error: "Failed to fetch invoice stats" });
      }
    }
  );
}
