import type { FastifyInstance, FastifyRequest } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database-factory.js';
import logger from '../config/logger.js';

interface PaymentMethodQuery {
  page?: string;
  limit?: string;
  active?: string;
}

interface PaymentMethodParams {
  id: string;
}

interface CreatePaymentMethodBody {
  name: string;
  name_en?: string;
  type?: 'cash' | 'card' | 'transfer' | 'wallet' | 'other';
  active?: boolean;
  sort_order?: number;
}

interface UpdatePaymentMethodBody {
  name?: string;
  name_en?: string;
  type?: 'cash' | 'card' | 'transfer' | 'wallet' | 'other';
  active?: boolean;
  sort_order?: number;
}

export default async function paymentMethodsRoutes(server: FastifyInstance) {
  // Get all payment methods
  server.get('/', { preHandler: [server.authenticate] }, async (request, reply) => {
    try {
      const { clientId, branchId } = request.user!;
      const query = request.query as any;

      const page = parseInt(query.page) || 1;
      const limit = parseInt(query.limit) || 50;
      const offset = (page - 1) * limit;
      const active = query.active;

      let sql = `
        SELECT * FROM payment_methods
        WHERE client_id = ? AND is_deleted = FALSE
      `;
      const params: any[] = [clientId];

      if (branchId) {
        sql += ' AND (branch_id = ? OR branch_id IS NULL)';
        params.push(branchId);
      }

      if (active !== undefined) {
        sql += ' AND active = ?';
        params.push(active === 'true' ? 1 : 0);
      }

      sql += ' ORDER BY sort_order, name LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const [methods] = await db.query(sql, params);

      // Get total count
      let countSql = `
        SELECT COUNT(*) as total FROM payment_methods
        WHERE client_id = ? AND is_deleted = FALSE
      `;
      const countParams: any[] = [clientId];

      if (branchId) {
        countSql += ' AND (branch_id = ? OR branch_id IS NULL)';
        countParams.push(branchId);
      }

      if (active !== undefined) {
        countSql += ' AND active = ?';
        countParams.push(active === 'true' ? 1 : 0);
      }

      const [countResult] = await db.query(countSql, countParams);
      const total = (countResult as any)[0].total;

      return reply.send({
        data: methods,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      logger.error({ error }, 'Error fetching payment methods:');
      return reply.status(500).send({ error: 'Failed to fetch payment methods' });
    }
  });

  // Get single payment method by ID
  server.get<{ Params: PaymentMethodParams }>(
    '/:id',
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { clientId, branchId } = request.user!;
        const { id } = request.params;

        let sql = `
          SELECT * FROM payment_methods
          WHERE id = ? AND client_id = ? AND is_deleted = FALSE
        `;
        const params: any[] = [id, clientId];

        if (branchId) {
          sql += ' AND (branch_id = ? OR branch_id IS NULL)';
          params.push(branchId);
        }

        const [methods] = await db.query(sql, params);

        if ((methods as any[]).length === 0) {
          return reply.status(404).send({ error: 'Payment method not found' });
        }

        return reply.send({ data: (methods as any[])[0] });
      } catch (error) {
        logger.error({ error }, 'Error fetching payment method:');
        return reply.status(500).send({ error: 'Failed to fetch payment method' });
      }
    }
  );

  // Create new payment method
  server.post<{ Body: CreatePaymentMethodBody }>(
    '/',
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { clientId, branchId, userId } = request.user!;
        const { name, name_en, type, active, sort_order } = request.body;

        if (!name) {
          return reply.status(400).send({ error: 'Payment method name is required' });
        }

        const id = uuidv4();
        const now = new Date();

        await db.execute(
          `INSERT INTO payment_methods 
          (id, client_id, branch_id, name, name_en, type, active, sort_order, created_by, created_at, updated_at, server_updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            clientId,
            branchId || null,
            name,
            name_en || null,
            type || 'cash',
            active !== false ? 1 : 0,
            sort_order || 0,
            userId,
            now,
            now,
            now
          ]
        );

        const [newMethod] = await db.query(
          'SELECT * FROM payment_methods WHERE id = ?',
          [id]
        );

        return reply.status(201).send({ data: (newMethod as any[])[0] });
      } catch (error) {
        logger.error({ error }, 'Error creating payment method:');
        return reply.status(500).send({ error: 'Failed to create payment method' });
      }
    }
  );

  // Update payment method
  server.put<{ Params: PaymentMethodParams; Body: UpdatePaymentMethodBody }>(
    '/:id',
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { clientId, branchId, userId } = request.user!;
        const { id } = request.params;
        const updateData = request.body;

        // Check if payment method exists
        let checkSql = `
          SELECT * FROM payment_methods
          WHERE id = ? AND client_id = ? AND is_deleted = FALSE
        `;
        const checkParams: any[] = [id, clientId];

        if (branchId) {
          checkSql += ' AND (branch_id = ? OR branch_id IS NULL)';
          checkParams.push(branchId);
        }

        const [existing] = await db.query(checkSql, checkParams);

        if ((existing as any[]).length === 0) {
          return reply.status(404).send({ error: 'Payment method not found' });
        }

        const updates: string[] = [];
        const values: any[] = [];

        if (updateData.name !== undefined) {
          updates.push('name = ?');
          values.push(updateData.name);
        }
        if (updateData.name_en !== undefined) {
          updates.push('name_en = ?');
          values.push(updateData.name_en);
        }
        if (updateData.type !== undefined) {
          updates.push('type = ?');
          values.push(updateData.type);
        }
        if (updateData.active !== undefined) {
          updates.push('active = ?');
          values.push(updateData.active ? 1 : 0);
        }
        if (updateData.sort_order !== undefined) {
          updates.push('sort_order = ?');
          values.push(updateData.sort_order);
        }

        if (updates.length === 0) {
          return reply.status(400).send({ error: 'No fields to update' });
        }

        updates.push('updated_by = ?', 'updated_at = ?', 'server_updated_at = ?', 'sync_version = sync_version + 1');
        const now = new Date();
        values.push(userId, now, now);

        values.push(id, clientId);

        let updateSql = `UPDATE payment_methods SET ${updates.join(', ')} WHERE id = ? AND client_id = ?`;

        if (branchId) {
          updateSql += ' AND (branch_id = ? OR branch_id IS NULL)';
          values.push(branchId);
        }

        await db.execute(updateSql, values);

        const [updated] = await db.query(
          'SELECT * FROM payment_methods WHERE id = ?',
          [id]
        );

        return reply.send({ data: (updated as any[])[0] });
      } catch (error) {
        logger.error({ error }, 'Error updating payment method:');
        return reply.status(500).send({ error: 'Failed to update payment method' });
      }
    }
  );

  // Delete payment method (soft delete)
  server.delete<{ Params: PaymentMethodParams }>(
    '/:id',
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { clientId, branchId } = request.user!;
        const { id } = request.params;

        // Check if payment method exists
        let checkSql = `
          SELECT * FROM payment_methods
          WHERE id = ? AND client_id = ? AND is_deleted = FALSE
        `;
        const checkParams: any[] = [id, clientId];

        if (branchId) {
          checkSql += ' AND (branch_id = ? OR branch_id IS NULL)';
          checkParams.push(branchId);
        }

        const [existing] = await db.query(checkSql, checkParams);

        if ((existing as any[]).length === 0) {
          return reply.status(404).send({ error: 'Payment method not found' });
        }

        // Soft delete
        const now = new Date();
        let deleteSql = `
          UPDATE payment_methods 
          SET is_deleted = TRUE, updated_at = ?, server_updated_at = ?, sync_version = sync_version + 1
          WHERE id = ? AND client_id = ?
        `;
        const deleteParams: any[] = [now, now, id, clientId];

        if (branchId) {
          deleteSql += ' AND (branch_id = ? OR branch_id IS NULL)';
          deleteParams.push(branchId);
        }

        await db.execute(deleteSql, deleteParams);

        return reply.send({ message: 'Payment method deleted successfully' });
      } catch (error) {
        logger.error({ error }, 'Error deleting payment method:');
        return reply.status(500).send({ error: 'Failed to delete payment method' });
      }
    }
  );
}
