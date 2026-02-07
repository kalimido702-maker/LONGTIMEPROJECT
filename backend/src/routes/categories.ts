import type { FastifyInstance, FastifyRequest } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database-factory.js';
import logger from '../config/logger.js';

interface CategoryQuery {
  page?: string;
  limit?: string;
  search?: string;
  active?: string;
}

interface CategoryParams {
  id: string;
}

interface CreateCategoryBody {
  name_ar: string;
  name_en?: string;
  description?: string;
  color?: string;
  active?: boolean;
}

interface UpdateCategoryBody {
  name_ar?: string;
  name_en?: string;
  description?: string;
  color?: string;
  active?: boolean;
}

export default async function categoriesRoutes(server: FastifyInstance) {
  // Get all categories with pagination and search
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
        SELECT * FROM product_categories
        WHERE client_id = ? AND is_deleted = FALSE
      `;
      const params: any[] = [clientId];

      if (branchId) {
        sql += ' AND (branch_id = ? OR branch_id IS NULL)';
        params.push(branchId);
      }

      if (search) {
        sql += ' AND (name_ar LIKE ? OR name_en LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
      }

      if (active !== undefined) {
        sql += ' AND active = ?';
        params.push(active === 'true' ? 1 : 0);
      }

      sql += ' ORDER BY name_ar LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const [categories] = await db.query(sql, params);

      // Get total count
      let countSql = `
        SELECT COUNT(*) as total FROM product_categories
        WHERE client_id = ? AND is_deleted = FALSE
      `;
      const countParams: any[] = [clientId];

      if (branchId) {
        countSql += ' AND (branch_id = ? OR branch_id IS NULL)';
        countParams.push(branchId);
      }

      if (search) {
        countSql += ' AND (name_ar LIKE ? OR name_en LIKE ?)';
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
      logger.error({ error }, 'Error fetching categories:');
      return reply.status(500).send({ error: 'Failed to fetch categories' });
    }
  });

  // Get single category by ID
  server.get<{ Params: CategoryParams }>(
    '/:id',
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { clientId, branchId } = request.user!;
        const { id } = request.params;

        let sql = `
          SELECT * FROM product_categories
          WHERE id = ? AND client_id = ? AND is_deleted = FALSE
        `;
        const params: any[] = [id, clientId];

        if (branchId) {
          sql += ' AND (branch_id = ? OR branch_id IS NULL)';
          params.push(branchId);
        }

        const [categories] = await db.query(sql, params);

        if ((categories as any[]).length === 0) {
          return reply.status(404).send({ error: 'Category not found' });
        }

        return reply.send({ data: (categories as any[])[0] });
      } catch (error) {
        logger.error({ error }, 'Error fetching category:');
        return reply.status(500).send({ error: 'Failed to fetch category' });
      }
    }
  );

  // Get products count per category
  server.get('/stats/products-count', { preHandler: [server.authenticate] }, async (request, reply) => {
    try {
      const { clientId, branchId } = request.user!;

      let sql = `
        SELECT 
          pc.id,
          pc.name_ar,
          pc.name_en,
          COUNT(p.id) as products_count
        FROM product_categories pc
        LEFT JOIN products p ON p.category_id = pc.id AND p.is_deleted = FALSE
        WHERE pc.client_id = ? AND pc.is_deleted = FALSE
      `;
      const params: any[] = [clientId];

      if (branchId) {
        sql += ' AND (pc.branch_id = ? OR pc.branch_id IS NULL)';
        params.push(branchId);
      }

      sql += ' GROUP BY pc.id ORDER BY products_count DESC';

      const [stats] = await db.query(sql, params);

      return reply.send({ data: stats });
    } catch (error) {
      logger.error({ error }, 'Error fetching category stats:');
      return reply.status(500).send({ error: 'Failed to fetch category stats' });
    }
  });

  // Create new category
  server.post<{ Body: CreateCategoryBody }>(
    '/',
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { clientId, branchId, userId } = request.user!;
        const { name_ar, name_en, description, color, active } = request.body;

        if (!name_ar) {
          return reply.status(400).send({ error: 'Arabic name is required' });
        }

        const id = uuidv4();
        const now = new Date();

        await db.execute(
          `INSERT INTO product_categories 
          (id, client_id, branch_id, name_ar, name_en, description, color, active, created_at, updated_at, server_updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            clientId,
            branchId || null,
            name_ar,
            name_en || null,
            description || null,
            color || null,
            active !== false ? 1 : 0,
            now,
            now,
            now
          ]
        );

        const [newCategory] = await db.query(
          'SELECT * FROM product_categories WHERE id = ?',
          [id]
        );

        return reply.status(201).send({ data: (newCategory as any[])[0] });
      } catch (error) {
        logger.error({ error }, 'Error creating category:');
        return reply.status(500).send({ error: 'Failed to create category' });
      }
    }
  );

  // Update category
  server.put<{ Params: CategoryParams; Body: UpdateCategoryBody }>(
    '/:id',
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { clientId, branchId, userId } = request.user!;
        const { id } = request.params;
        const updateData = request.body;

        // Check if category exists and belongs to client
        let checkSql = `
          SELECT * FROM product_categories
          WHERE id = ? AND client_id = ? AND is_deleted = FALSE
        `;
        const checkParams: any[] = [id, clientId];

        if (branchId) {
          checkSql += ' AND (branch_id = ? OR branch_id IS NULL)';
          checkParams.push(branchId);
        }

        const [existing] = await db.query(checkSql, checkParams);

        if ((existing as any[]).length === 0) {
          return reply.status(404).send({ error: 'Category not found' });
        }

        const updates: string[] = [];
        const values: any[] = [];

        if (updateData.name_ar !== undefined) {
          updates.push('name_ar = ?');
          values.push(updateData.name_ar);
        }
        if (updateData.name_en !== undefined) {
          updates.push('name_en = ?');
          values.push(updateData.name_en);
        }
        if (updateData.description !== undefined) {
          updates.push('description = ?');
          values.push(updateData.description);
        }
        if (updateData.color !== undefined) {
          updates.push('color = ?');
          values.push(updateData.color);
        }
        if (updateData.active !== undefined) {
          updates.push('active = ?');
          values.push(updateData.active ? 1 : 0);
        }

        if (updates.length === 0) {
          return reply.status(400).send({ error: 'No fields to update' });
        }

        updates.push('updated_at = ?', 'server_updated_at = ?', 'sync_version = sync_version + 1');
        const now = new Date();
        values.push(now, now);

        values.push(id, clientId);

        let updateSql = `UPDATE product_categories SET ${updates.join(', ')} WHERE id = ? AND client_id = ?`;

        if (branchId) {
          updateSql += ' AND (branch_id = ? OR branch_id IS NULL)';
          values.push(branchId);
        }

        await db.execute(updateSql, values);

        const [updated] = await db.query(
          'SELECT * FROM product_categories WHERE id = ?',
          [id]
        );

        return reply.send({ data: (updated as any[])[0] });
      } catch (error) {
        logger.error({ error }, 'Error updating category:');
        return reply.status(500).send({ error: 'Failed to update category' });
      }
    }
  );

  // Delete category (soft delete)
  server.delete<{ Params: CategoryParams }>(
    '/:id',
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { clientId, branchId } = request.user!;
        const { id } = request.params;

        // Check if category exists
        let checkSql = `
          SELECT * FROM product_categories
          WHERE id = ? AND client_id = ? AND is_deleted = FALSE
        `;
        const checkParams: any[] = [id, clientId];

        if (branchId) {
          checkSql += ' AND (branch_id = ? OR branch_id IS NULL)';
          checkParams.push(branchId);
        }

        const [existing] = await db.query(checkSql, checkParams);

        if ((existing as any[]).length === 0) {
          return reply.status(404).send({ error: 'Category not found' });
        }

        // Check if category has products
        const [products] = await db.query(
          'SELECT COUNT(*) as count FROM products WHERE category_id = ? AND is_deleted = FALSE',
          [id]
        );

        if ((products as any[])[0].count > 0) {
          return reply.status(400).send({
            error: 'Cannot delete category with existing products. Please reassign or delete products first.'
          });
        }

        // Soft delete
        const now = new Date();
        let deleteSql = `
          UPDATE product_categories 
          SET is_deleted = TRUE, updated_at = ?, server_updated_at = ?, sync_version = sync_version + 1
          WHERE id = ? AND client_id = ?
        `;
        const deleteParams: any[] = [now, now, id, clientId];

        if (branchId) {
          deleteSql += ' AND (branch_id = ? OR branch_id IS NULL)';
          deleteParams.push(branchId);
        }

        await db.execute(deleteSql, deleteParams);

        return reply.send({ message: 'Category deleted successfully' });
      } catch (error) {
        logger.error({ error }, 'Error deleting category:');
        return reply.status(500).send({ error: 'Failed to delete category' });
      }
    }
  );
}
