import type { FastifyInstance, FastifyRequest } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database-factory.js';
import logger from '../config/logger.js';

interface ExpenseQuery {
  page?: string;
  limit?: string;
  search?: string;
  category_id?: string;
  payment_method_id?: string;
  start_date?: string;
  end_date?: string;
}

interface ExpenseParams {
  id: string;
}

interface CreateExpenseBody {
  category_id?: string;
  amount: number;
  expense_date: string;
  payment_method_id?: string;
  description?: string;
  receipt_number?: string;
  notes?: string;
}

interface UpdateExpenseBody {
  category_id?: string;
  amount?: number;
  expense_date?: string;
  payment_method_id?: string;
  description?: string;
  receipt_number?: string;
  notes?: string;
}

export default async function expensesRoutes(server: FastifyInstance) {
  // Get all expenses with pagination and filters
  server.get('/', { preHandler: [server.authenticate] }, async (request, reply) => {
    try {
      const { clientId, branchId } = request.user!;
      const query = request.query as any;

      const page = parseInt(query.page) || 1;
      const limit = parseInt(query.limit) || 50;
      const offset = (page - 1) * limit;
      const search = query.search || '';
      const categoryId = query.category_id;
      const paymentMethodId = query.payment_method_id;
      const startDate = query.start_date;
      const endDate = query.end_date;

      let sql = `
        SELECT 
          e.*,
          ec.name as category_name,
          ec.name_en as category_name_en,
          pm.name as payment_method_name
        FROM expenses e
        LEFT JOIN expense_categories ec ON e.category_id = ec.id
        LEFT JOIN payment_methods pm ON e.payment_method_id = pm.id
        WHERE e.client_id = ? AND e.is_deleted = FALSE
      `;
      const params: any[] = [clientId];

      if (branchId) {
        sql += ' AND e.branch_id = ?';
        params.push(branchId);
      }

      if (search) {
        sql += ' AND (e.description LIKE ? OR e.receipt_number LIKE ? OR e.notes LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      if (categoryId) {
        sql += ' AND e.category_id = ?';
        params.push(categoryId);
      }

      if (paymentMethodId) {
        sql += ' AND e.payment_method_id = ?';
        params.push(paymentMethodId);
      }

      if (startDate) {
        sql += ' AND e.expense_date >= ?';
        params.push(startDate);
      }

      if (endDate) {
        sql += ' AND e.expense_date <= ?';
        params.push(endDate);
      }

      sql += ' ORDER BY e.expense_date DESC, e.created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const [expenses] = await db.query(sql, params);

      // Get total count
      let countSql = `
        SELECT COUNT(*) as total FROM expenses
        WHERE client_id = ? AND is_deleted = FALSE
      `;
      const countParams: any[] = [clientId];

      if (branchId) {
        countSql += ' AND branch_id = ?';
        countParams.push(branchId);
      }

      if (search) {
        countSql += ' AND (description LIKE ? OR receipt_number LIKE ? OR notes LIKE ?)';
        countParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      if (categoryId) {
        countSql += ' AND category_id = ?';
        countParams.push(categoryId);
      }

      if (paymentMethodId) {
        countSql += ' AND payment_method_id = ?';
        countParams.push(paymentMethodId);
      }

      if (startDate) {
        countSql += ' AND expense_date >= ?';
        countParams.push(startDate);
      }

      if (endDate) {
        countSql += ' AND expense_date <= ?';
        countParams.push(endDate);
      }

      const [countResult] = await db.query(countSql, countParams);
      const total = (countResult as any)[0].total;

      return reply.send({
        data: expenses,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      logger.error({ error }, 'Error fetching expenses:');
      return reply.status(500).send({ error: 'Failed to fetch expenses' });
    }
  });

  // Get single expense by ID
  server.get<{ Params: ExpenseParams }>(
    '/:id',
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { clientId, branchId } = request.user!;
        const { id } = request.params;

        let sql = `
          SELECT 
            e.*,
            ec.name as category_name,
            ec.name_en as category_name_en,
            pm.name as payment_method_name,
            pm.type as payment_method_type
          FROM expenses e
          LEFT JOIN expense_categories ec ON e.category_id = ec.id
          LEFT JOIN payment_methods pm ON e.payment_method_id = pm.id
          WHERE e.id = ? AND e.client_id = ? AND e.is_deleted = FALSE
        `;
        const params: any[] = [id, clientId];

        if (branchId) {
          sql += ' AND e.branch_id = ?';
          params.push(branchId);
        }

        const [expenses] = await db.query(sql, params);

        if ((expenses as any[]).length === 0) {
          return reply.status(404).send({ error: 'Expense not found' });
        }

        return reply.send({ data: (expenses as any[])[0] });
      } catch (error) {
        logger.error({ error }, 'Error fetching expense:');
        return reply.status(500).send({ error: 'Failed to fetch expense' });
      }
    }
  );

  // Get expense statistics
  server.get('/stats/summary', { preHandler: [server.authenticate] }, async (request, reply) => {
    try {
      const { clientId, branchId } = request.user!;
      const query = request.query as any;
      const startDate = query.start_date;
      const endDate = query.end_date;

      let sql = `
        SELECT 
          COUNT(*) as total_expenses,
          SUM(amount) as total_amount,
          AVG(amount) as average_amount,
          MAX(amount) as max_amount,
          MIN(amount) as min_amount
        FROM expenses
        WHERE client_id = ? AND is_deleted = FALSE
      `;
      const params: any[] = [clientId];

      if (branchId) {
        sql += ' AND branch_id = ?';
        params.push(branchId);
      }

      if (startDate) {
        sql += ' AND expense_date >= ?';
        params.push(startDate);
      }

      if (endDate) {
        sql += ' AND expense_date <= ?';
        params.push(endDate);
      }

      const [stats] = await db.query(sql, params);

      return reply.send({ data: (stats as any[])[0] });
    } catch (error) {
      logger.error({ error }, 'Error fetching expense stats:');
      return reply.status(500).send({ error: 'Failed to fetch expense stats' });
    }
  });

  // Get expenses by category
  server.get('/stats/by-category', { preHandler: [server.authenticate] }, async (request, reply) => {
    try {
      const { clientId, branchId } = request.user!;
      const query = request.query as any;
      const startDate = query.start_date;
      const endDate = query.end_date;

      let sql = `
        SELECT 
          ec.id as category_id,
          ec.name as category_name,
          ec.name_en as category_name_en,
          COUNT(e.id) as expense_count,
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

      if (startDate) {
        sql += ' AND (e.expense_date >= ? OR e.id IS NULL)';
        params.push(startDate);
      }

      if (endDate) {
        sql += ' AND (e.expense_date <= ? OR e.id IS NULL)';
        params.push(endDate);
      }

      sql += ' GROUP BY ec.id ORDER BY total_amount DESC';

      const [stats] = await db.query(sql, params);

      return reply.send({ data: stats });
    } catch (error) {
      logger.error({ error }, 'Error fetching expenses by category:');
      return reply.status(500).send({ error: 'Failed to fetch expenses by category' });
    }
  });

  // Create new expense
  server.post<{ Body: CreateExpenseBody }>(
    '/',
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { clientId, branchId, userId } = request.user!;
        const { category_id, amount, expense_date, payment_method_id, description, receipt_number, notes } = request.body;

        if (!amount || amount <= 0) {
          return reply.status(400).send({ error: 'Valid expense amount is required' });
        }

        if (!expense_date) {
          return reply.status(400).send({ error: 'Expense date is required' });
        }

        const id = uuidv4();
        const now = new Date();

        await db.execute(
          `INSERT INTO expenses 
          (id, client_id, branch_id, category_id, amount, expense_date, payment_method_id, description, receipt_number, notes, created_by, created_at, updated_at, server_updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            clientId,
            branchId || null,
            category_id || null,
            amount,
            expense_date,
            payment_method_id || null,
            description || null,
            receipt_number || null,
            notes || null,
            userId,
            now,
            now,
            now
          ]
        );

        const [newExpense] = await db.query(
          `SELECT 
            e.*,
            ec.name as category_name,
            pm.name as payment_method_name
          FROM expenses e
          LEFT JOIN expense_categories ec ON e.category_id = ec.id
          LEFT JOIN payment_methods pm ON e.payment_method_id = pm.id
          WHERE e.id = ?`,
          [id]
        );

        return reply.status(201).send({ data: (newExpense as any[])[0] });
      } catch (error) {
        logger.error({ error }, 'Error creating expense:');
        return reply.status(500).send({ error: 'Failed to create expense' });
      }
    }
  );

  // Update expense
  server.put<{ Params: ExpenseParams; Body: UpdateExpenseBody }>(
    '/:id',
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { clientId, branchId, userId } = request.user!;
        const { id } = request.params;
        const updateData = request.body;

        // Check if expense exists
        let checkSql = `
          SELECT * FROM expenses
          WHERE id = ? AND client_id = ? AND is_deleted = FALSE
        `;
        const checkParams: any[] = [id, clientId];

        if (branchId) {
          checkSql += ' AND branch_id = ?';
          checkParams.push(branchId);
        }

        const [existing] = await db.query(checkSql, checkParams);

        if ((existing as any[]).length === 0) {
          return reply.status(404).send({ error: 'Expense not found' });
        }

        const updates: string[] = [];
        const values: any[] = [];

        if (updateData.category_id !== undefined) {
          updates.push('category_id = ?');
          values.push(updateData.category_id);
        }
        if (updateData.amount !== undefined) {
          if (updateData.amount <= 0) {
            return reply.status(400).send({ error: 'Amount must be greater than 0' });
          }
          updates.push('amount = ?');
          values.push(updateData.amount);
        }
        if (updateData.expense_date !== undefined) {
          updates.push('expense_date = ?');
          values.push(updateData.expense_date);
        }
        if (updateData.payment_method_id !== undefined) {
          updates.push('payment_method_id = ?');
          values.push(updateData.payment_method_id);
        }
        if (updateData.description !== undefined) {
          updates.push('description = ?');
          values.push(updateData.description);
        }
        if (updateData.receipt_number !== undefined) {
          updates.push('receipt_number = ?');
          values.push(updateData.receipt_number);
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

        let updateSql = `UPDATE expenses SET ${updates.join(', ')} WHERE id = ? AND client_id = ?`;

        if (branchId) {
          updateSql += ' AND branch_id = ?';
          values.push(branchId);
        }

        await db.execute(updateSql, values);

        const [updated] = await db.query(
          `SELECT 
            e.*,
            ec.name as category_name,
            pm.name as payment_method_name
          FROM expenses e
          LEFT JOIN expense_categories ec ON e.category_id = ec.id
          LEFT JOIN payment_methods pm ON e.payment_method_id = pm.id
          WHERE e.id = ?`,
          [id]
        );

        return reply.send({ data: (updated as any[])[0] });
      } catch (error) {
        logger.error({ error }, 'Error updating expense:');
        return reply.status(500).send({ error: 'Failed to update expense' });
      }
    }
  );

  // Delete expense (soft delete)
  server.delete<{ Params: ExpenseParams }>(
    '/:id',
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { clientId, branchId } = request.user!;
        const { id } = request.params;

        // Check if expense exists
        let checkSql = `
          SELECT * FROM expenses
          WHERE id = ? AND client_id = ? AND is_deleted = FALSE
        `;
        const checkParams: any[] = [id, clientId];

        if (branchId) {
          checkSql += ' AND branch_id = ?';
          checkParams.push(branchId);
        }

        const [existing] = await db.query(checkSql, checkParams);

        if ((existing as any[]).length === 0) {
          return reply.status(404).send({ error: 'Expense not found' });
        }

        // Soft delete
        const now = new Date();
        let deleteSql = `
          UPDATE expenses 
          SET is_deleted = TRUE, updated_at = ?, server_updated_at = ?, sync_version = sync_version + 1
          WHERE id = ? AND client_id = ?
        `;
        const deleteParams: any[] = [now, now, id, clientId];

        if (branchId) {
          deleteSql += ' AND branch_id = ?';
          deleteParams.push(branchId);
        }

        await db.execute(deleteSql, deleteParams);

        return reply.send({ message: 'Expense deleted successfully' });
      } catch (error) {
        logger.error({ error }, 'Error deleting expense:');
        return reply.status(500).send({ error: 'Failed to delete expense' });
      }
    }
  );
}
