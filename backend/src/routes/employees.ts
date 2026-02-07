import type { FastifyInstance, FastifyRequest } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database-factory.js';
import logger from '../config/logger.js';

interface EmployeeQuery {
  page?: string;
  limit?: string;
  search?: string;
  active?: string;
  branch_id?: string;
}

interface EmployeeParams {
  id: string;
}

interface CreateEmployeeBody {
  name: string;
  phone?: string;
  email?: string;
  position?: string;
  salary?: number;
  hire_date?: string;
  active?: boolean;
  notes?: string;
  user_id?: string;
}

interface UpdateEmployeeBody {
  name?: string;
  phone?: string;
  email?: string;
  position?: string;
  salary?: number;
  hire_date?: string;
  active?: boolean;
  notes?: string;
  user_id?: string;
}

export default async function employeesRoutes(server: FastifyInstance) {
  // Get all employees with pagination and search
  server.get('/', { preHandler: [server.authenticate] }, async (request, reply) => {
    try {
      const { clientId, branchId } = request.user!;
      const query = request.query as any;

      const page = parseInt(query.page) || 1;
      const limit = parseInt(query.limit) || 50;
      const offset = (page - 1) * limit;
      const search = query.search || '';
      const active = query.active;
      const filterBranchId = query.branch_id;

      let sql = `
        SELECT e.*, u.username, u.email as user_email
        FROM employees e
        LEFT JOIN users u ON e.user_id = u.id
        WHERE e.client_id = ? AND e.is_deleted = FALSE
      `;
      const params: any[] = [clientId];

      if (branchId) {
        sql += ' AND (e.branch_id = ? OR e.branch_id IS NULL)';
        params.push(branchId);
      }

      if (filterBranchId) {
        sql += ' AND e.branch_id = ?';
        params.push(filterBranchId);
      }

      if (search) {
        sql += ' AND (e.name LIKE ? OR e.phone LIKE ? OR e.email LIKE ? OR e.position LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
      }

      if (active !== undefined) {
        sql += ' AND e.active = ?';
        params.push(active === 'true' ? 1 : 0);
      }

      sql += ' ORDER BY e.name LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const [employees] = await db.query(sql, params);

      // Get total count
      let countSql = `
        SELECT COUNT(*) as total FROM employees
        WHERE client_id = ? AND is_deleted = FALSE
      `;
      const countParams: any[] = [clientId];

      if (branchId) {
        countSql += ' AND (branch_id = ? OR branch_id IS NULL)';
        countParams.push(branchId);
      }

      if (filterBranchId) {
        countSql += ' AND branch_id = ?';
        countParams.push(filterBranchId);
      }

      if (search) {
        countSql += ' AND (name LIKE ? OR phone LIKE ? OR email LIKE ? OR position LIKE ?)';
        countParams.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
      }

      if (active !== undefined) {
        countSql += ' AND active = ?';
        countParams.push(active === 'true' ? 1 : 0);
      }

      const [countResult] = await db.query(countSql, countParams);
      const total = (countResult as any)[0].total;

      return reply.send({
        data: employees,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      logger.error({ error }, 'Error fetching employees:');
      return reply.status(500).send({ error: 'Failed to fetch employees' });
    }
  });

  // Get single employee by ID
  server.get<{ Params: EmployeeParams }>(
    '/:id',
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { clientId, branchId } = request.user!;
        const { id } = request.params;

        let sql = `
          SELECT e.*, u.username, u.email as user_email, u.role
          FROM employees e
          LEFT JOIN users u ON e.user_id = u.id
          WHERE e.id = ? AND e.client_id = ? AND e.is_deleted = FALSE
        `;
        const params: any[] = [id, clientId];

        if (branchId) {
          sql += ' AND (e.branch_id = ? OR e.branch_id IS NULL)';
          params.push(branchId);
        }

        const [employees] = await db.query(sql, params);

        if ((employees as any[]).length === 0) {
          return reply.status(404).send({ error: 'Employee not found' });
        }

        return reply.send({ data: (employees as any[])[0] });
      } catch (error) {
        logger.error({ error }, 'Error fetching employee:');
        return reply.status(500).send({ error: 'Failed to fetch employee' });
      }
    }
  );

  // Get employee statistics
  server.get('/stats/summary', { preHandler: [server.authenticate] }, async (request, reply) => {
    try {
      const { clientId, branchId } = request.user!;

      let sql = `
        SELECT 
          COUNT(*) as total_employees,
          COUNT(CASE WHEN active = TRUE THEN 1 END) as active_employees,
          COUNT(CASE WHEN active = FALSE THEN 1 END) as inactive_employees,
          AVG(salary) as average_salary,
          SUM(salary) as total_salary
        FROM employees
        WHERE client_id = ? AND is_deleted = FALSE
      `;
      const params: any[] = [clientId];

      if (branchId) {
        sql += ' AND (branch_id = ? OR branch_id IS NULL)';
        params.push(branchId);
      }

      const [stats] = await db.query(sql, params);

      return reply.send({ data: (stats as any[])[0] });
    } catch (error) {
      logger.error({ error }, 'Error fetching employee stats:');
      return reply.status(500).send({ error: 'Failed to fetch employee stats' });
    }
  });

  // Create new employee
  server.post<{ Body: CreateEmployeeBody }>(
    '/',
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { clientId, branchId, userId } = request.user!;
        const { name, phone, email, position, salary, hire_date, active, notes, user_id } = request.body;

        if (!name) {
          return reply.status(400).send({ error: 'Employee name is required' });
        }

        const id = uuidv4();
        const now = new Date();

        await db.execute(
          `INSERT INTO employees 
          (id, client_id, branch_id, user_id, name, phone, email, position, salary, hire_date, active, notes, created_by, created_at, updated_at, server_updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            clientId,
            branchId || null,
            user_id || null,
            name,
            phone || null,
            email || null,
            position || null,
            salary || 0,
            hire_date || null,
            active !== false ? 1 : 0,
            notes || null,
            userId,
            now,
            now,
            now
          ]
        );

        const [newEmployee] = await db.query(
          'SELECT * FROM employees WHERE id = ?',
          [id]
        );

        return reply.status(201).send({ data: (newEmployee as any[])[0] });
      } catch (error) {
        logger.error({ error }, 'Error creating employee:');
        return reply.status(500).send({ error: 'Failed to create employee' });
      }
    }
  );

  // Update employee
  server.put<{ Params: EmployeeParams; Body: UpdateEmployeeBody }>(
    '/:id',
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { clientId, branchId, userId } = request.user!;
        const { id } = request.params;
        const updateData = request.body;

        // Check if employee exists
        let checkSql = `
          SELECT * FROM employees
          WHERE id = ? AND client_id = ? AND is_deleted = FALSE
        `;
        const checkParams: any[] = [id, clientId];

        if (branchId) {
          checkSql += ' AND (branch_id = ? OR branch_id IS NULL)';
          checkParams.push(branchId);
        }

        const [existing] = await db.query(checkSql, checkParams);

        if ((existing as any[]).length === 0) {
          return reply.status(404).send({ error: 'Employee not found' });
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
        if (updateData.position !== undefined) {
          updates.push('position = ?');
          values.push(updateData.position);
        }
        if (updateData.salary !== undefined) {
          updates.push('salary = ?');
          values.push(updateData.salary);
        }
        if (updateData.hire_date !== undefined) {
          updates.push('hire_date = ?');
          values.push(updateData.hire_date);
        }
        if (updateData.active !== undefined) {
          updates.push('active = ?');
          values.push(updateData.active ? 1 : 0);
        }
        if (updateData.notes !== undefined) {
          updates.push('notes = ?');
          values.push(updateData.notes);
        }
        if (updateData.user_id !== undefined) {
          updates.push('user_id = ?');
          values.push(updateData.user_id);
        }

        if (updates.length === 0) {
          return reply.status(400).send({ error: 'No fields to update' });
        }

        updates.push('updated_by = ?', 'updated_at = ?', 'server_updated_at = ?', 'sync_version = sync_version + 1');
        const now = new Date();
        values.push(userId, now, now);

        values.push(id, clientId);

        let updateSql = `UPDATE employees SET ${updates.join(', ')} WHERE id = ? AND client_id = ?`;

        if (branchId) {
          updateSql += ' AND (branch_id = ? OR branch_id IS NULL)';
          values.push(branchId);
        }

        await db.execute(updateSql, values);

        const [updated] = await db.query(
          'SELECT * FROM employees WHERE id = ?',
          [id]
        );

        return reply.send({ data: (updated as any[])[0] });
      } catch (error) {
        logger.error({ error }, 'Error updating employee:');
        return reply.status(500).send({ error: 'Failed to update employee' });
      }
    }
  );

  // Delete employee (soft delete)
  server.delete<{ Params: EmployeeParams }>(
    '/:id',
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { clientId, branchId } = request.user!;
        const { id } = request.params;

        // Check if employee exists
        let checkSql = `
          SELECT * FROM employees
          WHERE id = ? AND client_id = ? AND is_deleted = FALSE
        `;
        const checkParams: any[] = [id, clientId];

        if (branchId) {
          checkSql += ' AND (branch_id = ? OR branch_id IS NULL)';
          checkParams.push(branchId);
        }

        const [existing] = await db.query(checkSql, checkParams);

        if ((existing as any[]).length === 0) {
          return reply.status(404).send({ error: 'Employee not found' });
        }

        // Soft delete
        const now = new Date();
        let deleteSql = `
          UPDATE employees 
          SET is_deleted = TRUE, active = FALSE, updated_at = ?, server_updated_at = ?, sync_version = sync_version + 1
          WHERE id = ? AND client_id = ?
        `;
        const deleteParams: any[] = [now, now, id, clientId];

        if (branchId) {
          deleteSql += ' AND (branch_id = ? OR branch_id IS NULL)';
          deleteParams.push(branchId);
        }

        await db.execute(deleteSql, deleteParams);

        return reply.send({ message: 'Employee deleted successfully' });
      } catch (error) {
        logger.error({ error }, 'Error deleting employee:');
        return reply.status(500).send({ error: 'Failed to delete employee' });
      }
    }
  );
}
