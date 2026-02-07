import type { FastifyInstance, FastifyRequest } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database-factory.js';
import logger from '../config/logger.js';
import type { PoolConnection } from 'mysql2/promise';

interface PurchaseQuery {
  page?: string;
  limit?: string;
  supplier_id?: string;
  payment_status?: string;
  start_date?: string;
  end_date?: string;
}

interface PurchaseParams {
  id: string;
}

interface PurchaseItem {
  product_id: string;
  quantity: number;
  unit_price: number;
  discount?: number;
  tax?: number;
}

interface CreatePurchaseBody {
  purchase_number: string;
  supplier_id?: string;
  purchase_date: string;
  items: PurchaseItem[];
  discount?: number;
  tax?: number;
  paid_amount?: number;
  notes?: string;
}

interface UpdatePurchasePaymentBody {
  paid_amount: number;
}

export default async function purchasesRoutes(server: FastifyInstance) {
  // Get all purchases with pagination and filters
  server.get('/', { preHandler: [server.authenticate] }, async (request, reply) => {
    try {
      const { clientId, branchId } = request.user!;
      const query = request.query as any;

      const page = parseInt(query.page) || 1;
      const limit = parseInt(query.limit) || 50;
      const offset = (page - 1) * limit;
      const supplierId = query.supplier_id;
      const paymentStatus = query.payment_status;
      const startDate = query.start_date;
      const endDate = query.end_date;

      let sql = `
        SELECT 
          p.*,
          s.name as supplier_name,
          s.phone as supplier_phone
        FROM purchases p
        LEFT JOIN suppliers s ON p.supplier_id = s.id
        WHERE p.client_id = ? AND p.is_deleted = FALSE
      `;
      const params: any[] = [clientId];

      if (branchId) {
        sql += ' AND p.branch_id = ?';
        params.push(branchId);
      }

      if (supplierId) {
        sql += ' AND p.supplier_id = ?';
        params.push(supplierId);
      }

      if (paymentStatus) {
        sql += ' AND p.payment_status = ?';
        params.push(paymentStatus);
      }

      if (startDate) {
        sql += ' AND p.purchase_date >= ?';
        params.push(startDate);
      }

      if (endDate) {
        sql += ' AND p.purchase_date <= ?';
        params.push(endDate);
      }

      sql += ' ORDER BY p.purchase_date DESC, p.created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const [purchases] = await db.query(sql, params);

      // Get total count
      let countSql = `
        SELECT COUNT(*) as total FROM purchases
        WHERE client_id = ? AND is_deleted = FALSE
      `;
      const countParams: any[] = [clientId];

      if (branchId) {
        countSql += ' AND branch_id = ?';
        countParams.push(branchId);
      }

      if (supplierId) {
        countSql += ' AND supplier_id = ?';
        countParams.push(supplierId);
      }

      if (paymentStatus) {
        countSql += ' AND payment_status = ?';
        countParams.push(paymentStatus);
      }

      if (startDate) {
        countSql += ' AND purchase_date >= ?';
        countParams.push(startDate);
      }

      if (endDate) {
        countSql += ' AND purchase_date <= ?';
        countParams.push(endDate);
      }

      const [countResult] = await db.query(countSql, countParams);
      const total = (countResult as any)[0].total;

      return reply.send({
        data: purchases,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      logger.error({ error }, 'Error fetching purchases:');
      return reply.status(500).send({ error: 'Failed to fetch purchases' });
    }
  });

  // Get single purchase by ID with items
  server.get<{ Params: PurchaseParams }>(
    '/:id',
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { clientId, branchId } = request.user!;
        const { id } = request.params;

        let sql = `
          SELECT 
            p.*,
            s.name as supplier_name,
            s.phone as supplier_phone,
            s.email as supplier_email
          FROM purchases p
          LEFT JOIN suppliers s ON p.supplier_id = s.id
          WHERE p.id = ? AND p.client_id = ? AND p.is_deleted = FALSE
        `;
        const params: any[] = [id, clientId];

        if (branchId) {
          sql += ' AND p.branch_id = ?';
          params.push(branchId);
        }

        const [purchases] = await db.query(sql, params);

        if ((purchases as any[]).length === 0) {
          return reply.status(404).send({ error: 'Purchase not found' });
        }

        const purchase = (purchases as any[])[0];

        // Get purchase items
        const [items] = await db.query(
          `SELECT 
            pi.*,
            p.name as product_name,
            p.barcode as product_barcode
          FROM purchase_items pi
          JOIN products p ON pi.product_id = p.id
          WHERE pi.purchase_id = ?`,
          [id]
        );

        purchase.items = items;

        return reply.send({ data: purchase });
      } catch (error) {
        logger.error({ error }, 'Error fetching purchase:');
        return reply.status(500).send({ error: 'Failed to fetch purchase' });
      }
    }
  );

  // Get purchase statistics
  server.get('/stats/summary', { preHandler: [server.authenticate] }, async (request, reply) => {
    try {
      const { clientId, branchId } = request.user!;
      const query = request.query as any;
      const startDate = query.start_date;
      const endDate = query.end_date;

      let sql = `
        SELECT 
          COUNT(*) as total_purchases,
          SUM(net_total) as total_amount,
          SUM(paid_amount) as total_paid,
          SUM(remaining_amount) as total_remaining,
          AVG(net_total) as average_purchase,
          COUNT(CASE WHEN payment_status = 'paid' THEN 1 END) as paid_count,
          COUNT(CASE WHEN payment_status = 'partial' THEN 1 END) as partial_count,
          COUNT(CASE WHEN payment_status = 'unpaid' THEN 1 END) as unpaid_count
        FROM purchases
        WHERE client_id = ? AND is_deleted = FALSE
      `;
      const params: any[] = [clientId];

      if (branchId) {
        sql += ' AND branch_id = ?';
        params.push(branchId);
      }

      if (startDate) {
        sql += ' AND purchase_date >= ?';
        params.push(startDate);
      }

      if (endDate) {
        sql += ' AND purchase_date <= ?';
        params.push(endDate);
      }

      const [stats] = await db.query(sql, params);

      return reply.send({ data: (stats as any[])[0] });
    } catch (error) {
      logger.error({ error }, 'Error fetching purchase stats:');
      return reply.status(500).send({ error: 'Failed to fetch purchase stats' });
    }
  });

  // Create new purchase with items (Transaction)
  server.post<{ Body: CreatePurchaseBody }>(
    '/',
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      const connection = await db.getConnection() as PoolConnection;

      try {
        const { clientId, branchId, userId } = request.user!;
        const { purchase_number, supplier_id, purchase_date, items, discount, tax, paid_amount, notes } = request.body;

        if (!purchase_number) {
          return reply.status(400).send({ error: 'Purchase number is required' });
        }

        if (!purchase_date) {
          return reply.status(400).send({ error: 'Purchase date is required' });
        }

        if (!items || items.length === 0) {
          return reply.status(400).send({ error: 'Purchase must have at least one item' });
        }

        // Check if purchase number already exists
        const [existing] = await connection.query(
          'SELECT id FROM purchases WHERE purchase_number = ? AND client_id = ? AND is_deleted = FALSE',
          [purchase_number, clientId]
        );

        if ((existing as any[]).length > 0) {
          return reply.status(400).send({ error: 'Purchase number already exists' });
        }

        await connection.beginTransaction();

        // Calculate totals
        let total = 0;
        for (const item of items) {
          const itemTotal = (item.quantity * item.unit_price) - (item.discount || 0) + (item.tax || 0);
          total += itemTotal;
        }

        const purchaseDiscount = discount || 0;
        const purchaseTax = tax || 0;
        const netTotal = total - purchaseDiscount + purchaseTax;
        const paidAmount = paid_amount || 0;
        const remainingAmount = netTotal - paidAmount;

        let paymentStatus: 'paid' | 'partial' | 'unpaid' = 'unpaid';
        if (paidAmount >= netTotal) {
          paymentStatus = 'paid';
        } else if (paidAmount > 0) {
          paymentStatus = 'partial';
        }

        const purchaseId = uuidv4();
        const now = new Date();

        // Insert purchase
        await connection.execute(
          `INSERT INTO purchases 
          (id, client_id, branch_id, purchase_number, supplier_id, total, discount, tax, net_total, paid_amount, remaining_amount, payment_status, purchase_date, notes, created_by, created_at, updated_at, server_updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            purchaseId,
            clientId,
            branchId || null,
            purchase_number,
            supplier_id || null,
            total,
            purchaseDiscount,
            purchaseTax,
            netTotal,
            paidAmount,
            remainingAmount,
            paymentStatus,
            purchase_date,
            notes || null,
            userId,
            now,
            now,
            now
          ]
        );

        // Insert purchase items and update stock
        for (const item of items) {
          const itemId = uuidv4();
          const itemTotal = (item.quantity * item.unit_price) - (item.discount || 0) + (item.tax || 0);

          await connection.execute(
            `INSERT INTO purchase_items 
            (id, purchase_id, product_id, quantity, unit_price, discount, tax, total)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              itemId,
              purchaseId,
              item.product_id,
              item.quantity,
              item.unit_price,
              item.discount || 0,
              item.tax || 0,
              itemTotal
            ]
          );

          // Increase product stock
          await connection.execute(
            'UPDATE products SET stock = stock + ?, updated_at = ?, server_updated_at = ? WHERE id = ?',
            [item.quantity, now, now, item.product_id]
          );
        }

        // Update supplier balance if supplier exists
        if (supplier_id) {
          await connection.execute(
            'UPDATE suppliers SET balance = balance + ?, updated_at = ?, server_updated_at = ? WHERE id = ?',
            [remainingAmount, now, now, supplier_id]
          );
        }

        await connection.commit();

        // Fetch created purchase with details
        const [newPurchase] = await db.query(
          `SELECT 
            p.*,
            s.name as supplier_name
          FROM purchases p
          LEFT JOIN suppliers s ON p.supplier_id = s.id
          WHERE p.id = ?`,
          [purchaseId]
        );

        const [purchaseItems] = await db.query(
          `SELECT 
            pi.*,
            p.name as product_name
          FROM purchase_items pi
          JOIN products p ON pi.product_id = p.id
          WHERE pi.purchase_id = ?`,
          [purchaseId]
        );

        const result = (newPurchase as any[])[0];
        result.items = purchaseItems;

        return reply.status(201).send({ data: result });
      } catch (error) {
        await connection.rollback();
        logger.error({ error }, 'Error creating purchase:');
        return reply.status(500).send({ error: 'Failed to create purchase' });
      } finally {
        connection.release();
      }
    }
  );

  // Update purchase payment
  server.put<{ Params: PurchaseParams; Body: UpdatePurchasePaymentBody }>(
    '/:id/payment',
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { clientId, branchId } = request.user!;
        const { id } = request.params;
        const { paid_amount } = request.body;

        if (paid_amount === undefined || paid_amount < 0) {
          return reply.status(400).send({ error: 'Valid paid amount is required' });
        }

        // Check if purchase exists
        let checkSql = `
          SELECT * FROM purchases
          WHERE id = ? AND client_id = ? AND is_deleted = FALSE
        `;
        const checkParams: any[] = [id, clientId];

        if (branchId) {
          checkSql += ' AND branch_id = ?';
          checkParams.push(branchId);
        }

        const [existing] = await db.query(checkSql, checkParams);

        if ((existing as any[]).length === 0) {
          return reply.status(404).send({ error: 'Purchase not found' });
        }

        const purchase = (existing as any[])[0];
        const netTotal = parseFloat(purchase.net_total);
        const oldPaidAmount = parseFloat(purchase.paid_amount);
        const newRemainingAmount = netTotal - paid_amount;

        let paymentStatus: 'paid' | 'partial' | 'unpaid' = 'unpaid';
        if (paid_amount >= netTotal) {
          paymentStatus = 'paid';
        } else if (paid_amount > 0) {
          paymentStatus = 'partial';
        }

        const now = new Date();

        // Update purchase payment
        let updateSql = `
          UPDATE purchases 
          SET paid_amount = ?, remaining_amount = ?, payment_status = ?, updated_at = ?, server_updated_at = ?, sync_version = sync_version + 1
          WHERE id = ? AND client_id = ?
        `;
        const updateParams: any[] = [paid_amount, newRemainingAmount, paymentStatus, now, now, id, clientId];

        if (branchId) {
          updateSql += ' AND branch_id = ?';
          updateParams.push(branchId);
        }

        await db.execute(updateSql, updateParams);

        // Update supplier balance if supplier exists
        if (purchase.supplier_id) {
          const balanceChange = newRemainingAmount - (netTotal - oldPaidAmount);
          await db.execute(
            'UPDATE suppliers SET balance = balance + ?, updated_at = ?, server_updated_at = ? WHERE id = ?',
            [balanceChange, now, now, purchase.supplier_id]
          );
        }

        const [updated] = await db.query(
          'SELECT * FROM purchases WHERE id = ?',
          [id]
        );

        return reply.send({ data: (updated as any[])[0] });
      } catch (error) {
        logger.error({ error }, 'Error updating purchase payment:');
        return reply.status(500).send({ error: 'Failed to update purchase payment' });
      }
    }
  );

  // Delete purchase (soft delete with stock restoration)
  server.delete<{ Params: PurchaseParams }>(
    '/:id',
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      const connection = await db.getConnection() as PoolConnection;

      try {
        const { clientId, branchId } = request.user!;
        const { id } = request.params;

        // Check if purchase exists
        let checkSql = `
          SELECT * FROM purchases
          WHERE id = ? AND client_id = ? AND is_deleted = FALSE
        `;
        const checkParams: any[] = [id, clientId];

        if (branchId) {
          checkSql += ' AND branch_id = ?';
          checkParams.push(branchId);
        }

        const [existing] = await connection.query(checkSql, checkParams);

        if ((existing as any[]).length === 0) {
          return reply.status(404).send({ error: 'Purchase not found' });
        }

        const purchase = (existing as any[])[0];

        await connection.beginTransaction();

        // Get purchase items to restore stock
        const [items] = await connection.query(
          'SELECT * FROM purchase_items WHERE purchase_id = ?',
          [id]
        );

        const now = new Date();

        // Restore product stock
        for (const item of items as any[]) {
          await connection.execute(
            'UPDATE products SET stock = stock - ?, updated_at = ?, server_updated_at = ? WHERE id = ?',
            [item.quantity, now, now, item.product_id]
          );
        }

        // Restore supplier balance if supplier exists
        if (purchase.supplier_id) {
          await connection.execute(
            'UPDATE suppliers SET balance = balance - ?, updated_at = ?, server_updated_at = ? WHERE id = ?',
            [purchase.remaining_amount, now, now, purchase.supplier_id]
          );
        }

        // Soft delete purchase
        let deleteSql = `
          UPDATE purchases 
          SET is_deleted = TRUE, updated_at = ?, server_updated_at = ?, sync_version = sync_version + 1
          WHERE id = ? AND client_id = ?
        `;
        const deleteParams: any[] = [now, now, id, clientId];

        if (branchId) {
          deleteSql += ' AND branch_id = ?';
          deleteParams.push(branchId);
        }

        await connection.execute(deleteSql, deleteParams);

        await connection.commit();

        return reply.send({ message: 'Purchase deleted successfully and stock restored' });
      } catch (error) {
        await connection.rollback();
        logger.error({ error }, 'Error deleting purchase:');
        return reply.status(500).send({ error: 'Failed to delete purchase' });
      } finally {
        connection.release();
      }
    }
  );
}
