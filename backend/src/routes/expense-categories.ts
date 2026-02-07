import type { FastifyInstance, FastifyRequest } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database-factory.js';
import logger from '../config/logger.js';

interface ExpenseCategoryQuery {
  page?: string;
  limit?: string;
  search?: string;
  active?: string;
}

interface ExpenseCategoryParams {
  id: string;
}

interface CreateExpenseCategoryBody {
  name: string;
  name_en?: string;
  description?: string;
  active?: boolean;
}

interface UpdateExpenseCategoryBody {
  name?: string;
  name_en?: string;
  description?: string;
  active?: boolean;
}

export default async function expenseCategoriesRoutes(server: FastifyInstance) {
  // Get all expense categories with pagination and search
  server.get('/', { preHandler: [server.authenticate] }, async (request, reply) => {
    try {
      const { clientId, branchId } = request.user!;
      const query = request.query as any;

      const page = parseInt(query.page) || 1;
      const limit = parseInt(query.limit) || 50;
      const offset = (page - 1) * limit;
      const search = query.search || '';
      const active = query.active;

      let sql = `
        SELECT * FROM expense_categories
        WHERE client_id = ? AND is_deleted = FALSE
      `;
      const params: any[] = [clientId];

      if (branchId) {
        sql += ' AND (branch_id = ? OR branch_id IS NULL)';
        params.push(branchId);
      }

      if (search) {
        sql += ' AND (name LIKE ? OR name_en LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
      }

      if (active !== undefined) {
        sql += ' AND active = ?';
        params.push(active === 'true' ? 1 : 0);
      }

      sql += ' ORDER BY name LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const [categories] = await db.query(sql, params);

      // Get total count
      let countSql = `
        SELECT COUNT(*) as total FROM expense_categories
        WHERE client_id = ? AND is_deleted = FALSE
      `;
      const countParams: any[] = [clientId];

      if (branchId) {
        countSql += ' AND (branch_id = ? OR branch_id IS NULL)';
        countParams.push(branchId);
      }

      if (search) {
        countSql += ' AND (name LIKE ? OR name_en LIKE ?)';
        countParams.push(`%${search}%`, `%${search}%`);
      }

      if (active !== undefined) {
        countSql += ' AND active = ?';
        countParams.push(active === 'true' ? 1 : 0);
      }

      const [countResult] = await db.query(countSql, countParams);
      const total = (countResult as any)[0].total;

      return reply.send({
        data: categories,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      logger.error({ error }, 'Error fetching expense categories:');
      return reply.status(500).send({ error: 'Failed to fetch expense categories' });
    }
  });

  // Get single expense category by ID
  server.get<{ Params: ExpenseCategoryParams }>(
    '/:id',
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { clientId, branchId } = request.user!;
        const { id } = request.params;

        let sql = `
          SELECT * FROM expense_categories
          WHERE id = ? AND client_id = ? AND is_deleted = FALSE
        `;
        const params: any[] = [id, clientId];

        if (branchId) {
          sql += ' AND (branch_id = ? OR branch_id IS NULL)';
          params.push(branchId);
        }

        const [categories] = await db.query(sql, params);

        if ((categories as any[]).length === 0) {
          return reply.status(404).send({ error: 'Expense category not found' });
        }

        return reply.send({ data: (categories as any[])[0] });
      } catch (error) {
        logger.error({ error }, 'Error fetching expense category:');
        return reply.status(500).send({ error: 'Failed to fetch expense category' });
      }
    }
  );

  // Get expenses count per category
  server.get('/stats/expenses-count', { preHandler: [server.authenticate] }, async (request, reply) => {
    try {
      const { clientId, branchId } = request.user!;

      let sql = `
        SELECT 
          ec.id,
          ec.name,
          ec.name_en,
          COUNT(e.id) as expenses_count,
          COALESCE(SUM(e.amount), 0) as total_amount
        FROM expense_categories ec
        LEFT JOIN expenses e ON e.category_id = ec.id AND e.is_deleted = FALSE
        WHERE ec.client_id = ? AND ec.is_deleted = FALSE
      `;
      const params: any[] = [clientId];

      if (branchId) {
        sql += ' AND (ec.branch_id = ? OR ec.branch_id IS NULL)';
        params.push(branchId);
      }

      sql += ' GROUP BY ec.id ORDER BY total_amount DESC';

      const [stats] = await db.query(sql, params);

      return reply.send({ data: stats });
    } catch (error) {
      logger.error({ error }, 'Error fetching expense category stats:');
      return reply.status(500).send({ error: 'Failed to fetch expense category stats' });
    }
  });

  // Create new expense category
  server.post<{ Body: CreateExpenseCategoryBody }>(
    '/',
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { clientId, branchId, userId } = request.user!;
        const { name, name_en, description, active } = request.body;

        if (!name) {
          return reply.status(400).send({ error: 'Category name is required' });
        }

        const id = uuidv4();
        const now = new Date();

        await db.execute(
          `INSERT INTO expense_categories 
          (id, client_id, branch_id, name, name_en, description, active, created_by, created_at, updated_at, server_updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            clientId,
            branchId || null,
            name,
            name_en || null,
            description || null,
            active !== false ? 1 : 0,
            userId,
            now,
            now,
            now
          ]
        );

        const [newCategory] = await db.query(
          'SELECT * FROM expense_categories WHERE id = ?',
          [id]
        );

        return reply.status(201).send({ data: (newCategory as any[])[0] });
      } catch (error) {
        logger.error({ error }, 'Error creating expense category:');
        return reply.status(500).send({ error: 'Failed to create expense category' });
      }
    }
  );

  // Update expense category
  server.put<{ Params: ExpenseCategoryParams; Body: UpdateExpenseCategoryBody }>(
    '/:id',
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { clientId, branchId, userId } = request.user!;
        const { id } = request.params;
        const updateData = request.body;

        // Check if category exists
        let checkSql = `
          SELECT * FROM expense_categories
          WHERE id = ? AND client_id = ? AND is_deleted = FALSE
        `;
        const checkParams: any[] = [id, clientId];

        if (branchId) {
          checkSql += ' AND (branch_id = ? OR branch_id IS NULL)';
          checkParams.push(branchId);
        }

        const [existing] = await db.query(checkSql, checkParams);

        if ((existing as any[]).length === 0) {
          return reply.status(404).send({ error: 'Expense category not found' });
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
        if (updateData.description !== undefined) {
          updates.push('description = ?');
          values.push(updateData.description);
        }
        if (updateData.active !== undefined) {
          updates.push('active = ?');
          values.push(updateData.active ? 1 : 0);
        }

        if (updates.length === 0) {
          return reply.status(400).send({ error: 'No fields to update' });
        }

        updates.push('updated_by = ?', 'updated_at = ?', 'server_updated_at = ?', 'sync_version = sync_version + 1');
        const now = new Date();
        values.push(userId, now, now);

        values.push(id, clientId);

        let updateSql = `UPDATE expense_categories SET ${updates.join(', ')} WHERE id = ? AND client_id = ?`;

        if (branchId) {
          updateSql += ' AND (branch_id = ? OR branch_id IS NULL)';
          values.push(branchId);
        }

        await db.execute(updateSql, values);

        const [updated] = await db.query(
          'SELECT * FROM expense_categories WHERE id = ?',
          [id]
        );

        return reply.send({ data: (updated as any[])[0] });
      } catch (error) {
        logger.error({ error }, 'Error updating expense category:');
        return reply.status(500).send({ error: 'Failed to update expense category' });
      }
    }
  );

  // Delete expense category (soft delete)
  server.delete<{ Params: ExpenseCategoryParams }>(
    '/:id',
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { clientId, branchId } = request.user!;
        const { id } = request.params;

        // Check if category exists
        let checkSql = `
          SELECT * FROM expense_categories
          WHERE id = ? AND client_id = ? AND is_deleted = FALSE
        `;
        const checkParams: any[] = [id, clientId];

        if (branchId) {
          checkSql += ' AND (branch_id = ? OR branch_id IS NULL)';
          checkParams.push(branchId);
        }

        const [existing] = await db.query(checkSql, checkParams);

        if ((existing as any[]).length === 0) {
          return reply.status(404).send({ error: 'Expense category not found' });
        }

        // Check if category has expenses
        const [expenses] = await db.query(
          'SELECT COUNT(*) as count FROM expenses WHERE category_id = ? AND is_deleted = FALSE',
          [id]
        );

        if ((expenses as any[])[0].count > 0) {
          return reply.status(400).send({
            error: 'Cannot delete category with existing expenses. Please reassign or delete expenses first.'
          });
        }

        // Soft delete
        const now = new Date();
        let deleteSql = `
          UPDATE expense_categories 
          SET is_deleted = TRUE, updated_at = ?, server_updated_at = ?, sync_version = sync_version + 1
          WHERE id = ? AND client_id = ?
        `;
        const deleteParams: any[] = [now, now, id, clientId];

        if (branchId) {
          deleteSql += ' AND (branch_id = ? OR branch_id IS NULL)';
          deleteParams.push(branchId);
        }

        await db.execute(deleteSql, deleteParams);

        return reply.send({ message: 'Expense category deleted successfully' });
      } catch (error) {
        logger.error({ error }, 'Error deleting expense category:');
        return reply.status(500).send({ error: 'Failed to delete expense category' });
      }
    }
  );
}
