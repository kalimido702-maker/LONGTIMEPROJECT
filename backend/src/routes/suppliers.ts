import type { FastifyInstance, FastifyRequest } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database-factory.js';
import logger from '../config/logger.js';

interface SupplierQuery {
  page?: string;
  limit?: string;
  search?: string;
}

interface SupplierParams {
  id: string;
}

interface CreateSupplierBody {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  tax_number?: string;
  credit_limit?: number;
  payment_terms?: number;
  notes?: string;
}

interface UpdateSupplierBody {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  tax_number?: string;
  credit_limit?: number;
  payment_terms?: number;
  notes?: string;
}

export default async function suppliersRoutes(server: FastifyInstance) {
  // Get all suppliers with pagination and search
  server.get('/', { preHandler: [server.authenticate] }, async (request, reply) => {
    try {
      const { clientId, branchId } = request.user!;
      const query = request.query as any;

      const page = parseInt(query.page) || 1;
      const limit = parseInt(query.limit) || 50;
      const offset = (page - 1) * limit;
      const search = query.search || '';

      let sql = `
        SELECT * FROM suppliers
        WHERE client_id = ? AND is_deleted = FALSE
      `;
      const params: any[] = [clientId];

      if (branchId) {
        sql += ' AND (branch_id = ? OR branch_id IS NULL)';
        params.push(branchId);
      }

      if (search) {
        sql += ' AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      sql += ' ORDER BY name LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const [suppliers] = await db.query(sql, params);

      // Get total count
      let countSql = `
        SELECT COUNT(*) as total FROM suppliers
        WHERE client_id = ? AND is_deleted = FALSE
      `;
      const countParams: any[] = [clientId];

      if (branchId) {
        countSql += ' AND (branch_id = ? OR branch_id IS NULL)';
        countParams.push(branchId);
      }

      if (search) {
        countSql += ' AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)';
        countParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      const [countResult] = await db.query(countSql, countParams);
      const total = (countResult as any)[0].total;

      return reply.send({
        data: suppliers,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      logger.error({ error }, 'Error fetching suppliers:');
      return reply.status(500).send({ error: 'Failed to fetch suppliers' });
    }
  });

  // Get single supplier by ID
  server.get<{ Params: SupplierParams }>(
    '/:id',
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { clientId, branchId } = request.user!;
        const { id } = request.params;

        let sql = `
          SELECT * FROM suppliers
          WHERE id = ? AND client_id = ? AND is_deleted = FALSE
        `;
        const params: any[] = [id, clientId];

        if (branchId) {
          sql += ' AND (branch_id = ? OR branch_id IS NULL)';
          params.push(branchId);
        }

        const [suppliers] = await db.query(sql, params);

        if ((suppliers as any[]).length === 0) {
          return reply.status(404).send({ error: 'Supplier not found' });
        }

        return reply.send({ data: (suppliers as any[])[0] });
      } catch (error) {
        logger.error({ error }, 'Error fetching supplier:');
        return reply.status(500).send({ error: 'Failed to fetch supplier' });
      }
    }
  );

  // Get supplier balance
  server.get<{ Params: SupplierParams }>(
    '/:id/balance',
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { clientId, branchId } = request.user!;
        const { id } = request.params;

        let sql = `
          SELECT 
            s.balance,
            s.credit_limit,
            (s.credit_limit - s.balance) as available_credit
          FROM suppliers s
          WHERE s.id = ? AND s.client_id = ? AND s.is_deleted = FALSE
        `;
        const params: any[] = [id, clientId];

        if (branchId) {
          sql += ' AND (s.branch_id = ? OR s.branch_id IS NULL)';
          params.push(branchId);
        }

        const [result] = await db.query(sql, params);

        if ((result as any[]).length === 0) {
          return reply.status(404).send({ error: 'Supplier not found' });
        }

        return reply.send({ data: (result as any[])[0] });
      } catch (error) {
        logger.error({ error }, 'Error fetching supplier balance:');
        return reply.status(500).send({ error: 'Failed to fetch supplier balance' });
      }
    }
  );

  // Get supplier purchase statistics
  server.get<{ Params: SupplierParams }>(
    '/:id/stats',
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { clientId, branchId } = request.user!;
        const { id } = request.params;

        let sql = `
          SELECT 
            COUNT(*) as total_purchases,
            SUM(net_total) as total_amount,
            SUM(paid_amount) as total_paid,
            SUM(remaining_amount) as total_remaining,
            AVG(net_total) as average_purchase
          FROM purchases
          WHERE supplier_id = ? AND client_id = ? AND is_deleted = FALSE
        `;
        const params: any[] = [id, clientId];

        if (branchId) {
          sql += ' AND branch_id = ?';
          params.push(branchId);
        }

        const [stats] = await db.query(sql, params);

        return reply.send({ data: (stats as any[])[0] });
      } catch (error) {
        logger.error({ error }, 'Error fetching supplier stats:');
        return reply.status(500).send({ error: 'Failed to fetch supplier stats' });
      }
    }
  );

  // Create new supplier
  server.post<{ Body: CreateSupplierBody }>(
    '/',
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { clientId, branchId, userId } = request.user!;
        const { name, phone, email, address, tax_number, credit_limit, payment_terms, notes } = request.body;

        if (!name) {
          return reply.status(400).send({ error: 'Supplier name is required' });
        }

        // Check if phone already exists
        if (phone) {
          const [existing] = await db.query(
            'SELECT id FROM suppliers WHERE phone = ? AND client_id = ? AND is_deleted = FALSE',
            [phone, clientId]
          );

          if ((existing as any[]).length > 0) {
            return reply.status(400).send({ error: 'Phone number already exists' });
          }
        }

        const id = uuidv4();
        const now = new Date();

        await db.execute(
          `INSERT INTO suppliers 
          (id, client_id, branch_id, name, phone, email, address, tax_number, credit_limit, balance, payment_terms, notes, created_by, created_at, updated_at, server_updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            clientId,
            branchId || null,
            name,
            phone || null,
            email || null,
            address || null,
            tax_number || null,
            credit_limit || 0,
            payment_terms || 0,
            notes || null,
            userId,
            now,
            now,
            now
          ]
        );

        const [newSupplier] = await db.query(
          'SELECT * FROM suppliers WHERE id = ?',
          [id]
        );

        return reply.status(201).send({ data: (newSupplier as any[])[0] });
      } catch (error) {
        logger.error({ error }, 'Error creating supplier:');
        return reply.status(500).send({ error: 'Failed to create supplier' });
      }
    }
  );

  // Update supplier
  server.put<{ Params: SupplierParams; Body: UpdateSupplierBody }>(
    '/:id',
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { clientId, branchId, userId } = request.user!;
        const { id } = request.params;
        const updateData = request.body;

        // Check if supplier exists
        let checkSql = `
          SELECT * FROM suppliers
          WHERE id = ? AND client_id = ? AND is_deleted = FALSE
        `;
        const checkParams: any[] = [id, clientId];

        if (branchId) {
          checkSql += ' AND (branch_id = ? OR branch_id IS NULL)';
          checkParams.push(branchId);
        }

        const [existing] = await db.query(checkSql, checkParams);

        if ((existing as any[]).length === 0) {
          return reply.status(404).send({ error: 'Supplier not found' });
        }

        // Check if phone already exists (for different supplier)
        if (updateData.phone) {
          const [phoneCheck] = await db.query(
            'SELECT id FROM suppliers WHERE phone = ? AND id != ? AND client_id = ? AND is_deleted = FALSE',
            [updateData.phone, id, clientId]
          );

          if ((phoneCheck as any[]).length > 0) {
            return reply.status(400).send({ error: 'Phone number already exists' });
          }
        }

        const updates: string[] = [];
        const values: any[] = [];

        if (updateData.name !== undefined) {
          updates.push('name = ?');
          values.push(updateData.name);
        }
        if (updateData.phone !== undefined) {
          updates.push('phone = ?');
          values.push(updateData.phone);
        }
        if (updateData.email !== undefined) {
          updates.push('email = ?');
          values.push(updateData.email);
        }
        if (updateData.address !== undefined) {
          updates.push('address = ?');
          values.push(updateData.address);
        }
        if (updateData.tax_number !== undefined) {
          updates.push('tax_number = ?');
          values.push(updateData.tax_number);
        }
        if (updateData.credit_limit !== undefined) {
          updates.push('credit_limit = ?');
          values.push(updateData.credit_limit);
        }
        if (updateData.payment_terms !== undefined) {
          updates.push('payment_terms = ?');
          values.push(updateData.payment_terms);
        }
        if (updateData.notes !== undefined) {
          updates.push('notes = ?');
          values.push(updateData.notes);
        }

        if (updates.length === 0) {
          return reply.status(400).send({ error: 'No fields to update' });
        }

        updates.push('updated_by = ?', 'updated_at = ?', 'server_updated_at = ?', 'sync_version = sync_version + 1');
        const now = new Date();
        values.push(userId, now, now);

        values.push(id, clientId);

        let updateSql = `UPDATE suppliers SET ${updates.join(', ')} WHERE id = ? AND client_id = ?`;

        if (branchId) {
          updateSql += ' AND (branch_id = ? OR branch_id IS NULL)';
          values.push(branchId);
        }

        await db.execute(updateSql, values);

        const [updated] = await db.query(
          'SELECT * FROM suppliers WHERE id = ?',
          [id]
        );

        return reply.send({ data: (updated as any[])[0] });
      } catch (error) {
        logger.error({ error }, 'Error updating supplier:');
        return reply.status(500).send({ error: 'Failed to update supplier' });
      }
    }
  );

  // Delete supplier (soft delete)
  server.delete<{ Params: SupplierParams }>(
    '/:id',
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { clientId, branchId } = request.user!;
        const { id } = request.params;

        // Check if supplier exists
        let checkSql = `
          SELECT * FROM suppliers
          WHERE id = ? AND client_id = ? AND is_deleted = FALSE
        `;
        const checkParams: any[] = [id, clientId];

        if (branchId) {
          checkSql += ' AND (branch_id = ? OR branch_id IS NULL)';
          checkParams.push(branchId);
        }

        const [existing] = await db.query(checkSql, checkParams);

        if ((existing as any[]).length === 0) {
          return reply.status(404).send({ error: 'Supplier not found' });
        }

        // Check if supplier has purchases
        const [purchases] = await db.query(
          'SELECT COUNT(*) as count FROM purchases WHERE supplier_id = ? AND is_deleted = FALSE',
          [id]
        );

        if ((purchases as any[])[0].count > 0) {
          return reply.status(400).send({
            error: 'Cannot delete supplier with existing purchases'
          });
        }

        // Soft delete
        const now = new Date();
        let deleteSql = `
          UPDATE suppliers 
          SET is_deleted = TRUE, updated_at = ?, server_updated_at = ?, sync_version = sync_version + 1
          WHERE id = ? AND client_id = ?
        `;
        const deleteParams: any[] = [now, now, id, clientId];

        if (branchId) {
          deleteSql += ' AND (branch_id = ? OR branch_id IS NULL)';
          deleteParams.push(branchId);
        }

        await db.execute(deleteSql, deleteParams);

        return reply.send({ message: 'Supplier deleted successfully' });
      } catch (error) {
        logger.error({ error }, 'Error deleting supplier:');
        return reply.status(500).send({ error: 'Failed to delete supplier' });
      }
    }
  );
}
