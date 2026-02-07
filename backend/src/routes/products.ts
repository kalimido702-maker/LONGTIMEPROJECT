import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { db } from "../config/database-factory.js";
import { logger } from "../config/logger.js";
import { RowDataPacket, ResultSetHeader } from "mysql2/promise";

interface ProductBody {
  name: string;
  barcode?: string;
  category_id?: number;
  price: number;
  cost?: number;
  stock_quantity?: number;
  min_stock?: number;
  unit?: string;
  description?: string;
  image_url?: string;
  is_active?: boolean;
}

interface ProductQueryString {
  page?: number;
  limit?: number;
  search?: string;
  category_id?: number;
  is_active?: boolean;
}

export default async function productRoutes(server: FastifyInstance) {
  // GET /api/products - List all products
  server.get<{ Querystring: ProductQueryString }>(
    "/",
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const query = request.query as any;
        const { page = 1, limit = 50, search, category_id, is_active } = query;
        const { clientId, branchId } = request.user!;
        const offset = (page - 1) * limit;

        let whereConditions = [
          "client_id = ?",
          "branch_id = ?",
          "is_deleted = 0",
        ];
        let params: any[] = [clientId, branchId];

        if (search) {
          whereConditions.push("(name LIKE ? OR barcode LIKE ?)");
          params.push(`%${search}%`, `%${search}%`);
        }

        if (category_id) {
          whereConditions.push("category_id = ?");
          params.push(category_id);
        }

        if (is_active !== undefined) {
          whereConditions.push("is_active = ?");
          params.push(is_active ? 1 : 0);
        }

        const whereClause = whereConditions.join(" AND ");

        // Get total count
        const [countRows] = await db.query<RowDataPacket[]>(
          `SELECT COUNT(*) as total FROM products WHERE ${whereClause}`,
          params
        );
        const total = countRows[0].total;

        // Get products
        const [products] = await db.query<RowDataPacket[]>(
          `SELECT p.*, pc.name as category_name 
           FROM products p 
           LEFT JOIN product_categories pc ON p.category_id = pc.id 
           WHERE ${whereClause} 
           ORDER BY p.name ASC 
           LIMIT ? OFFSET ?`,
          [...params, limit, offset]
        );

        return reply.code(200).send({
          data: products,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
          },
        });
      } catch (error) {
        logger.error({ error }, "Failed to fetch products");
        return reply.code(500).send({ error: "Failed to fetch products" });
      }
    }
  );

  // GET /api/products/:id - Get single product
  server.get<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const { clientId, branchId } = request.user!;

        const [rows] = await db.query<RowDataPacket[]>(
          `SELECT p.*, pc.name as category_name 
           FROM products p 
           LEFT JOIN product_categories pc ON p.category_id = pc.id 
           WHERE p.id = ? AND p.client_id = ? AND p.branch_id = ? AND p.is_deleted = 0`,
          [id, clientId, branchId]
        );

        if (rows.length === 0) {
          return reply.code(404).send({ error: "Product not found" });
        }

        return reply.code(200).send({ data: rows[0] });
      } catch (error) {
        logger.error({ error }, "Failed to fetch product");
        return reply.code(500).send({ error: "Failed to fetch product" });
      }
    }
  );

  // POST /api/products - Create product
  server.post<{ Body: ProductBody }>(
    "/",
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const product = request.body;
        const { clientId, branchId, userId } = request.user!;

        // Check if barcode exists
        if (product.barcode) {
          const [existing] = await db.query<RowDataPacket[]>(
            `SELECT id FROM products 
             WHERE barcode = ? AND client_id = ? AND branch_id = ? AND is_deleted = 0`,
            [product.barcode, clientId, branchId]
          );

          if (existing.length > 0) {
            return reply.code(400).send({ error: "Barcode already exists" });
          }
        }

        const [result] = await db.query<ResultSetHeader>(
          `INSERT INTO products (
            client_id, branch_id, name, barcode, category_id, 
            price, cost, stock_quantity, min_stock, unit, 
            description, image_url, is_active, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            clientId,
            branchId,
            product.name,
            product.barcode,
            product.category_id,
            product.price,
            product.cost,
            product.stock_quantity || 0,
            product.min_stock || 0,
            product.unit,
            product.description,
            product.image_url,
            product.is_active !== false ? 1 : 0,
            userId,
          ]
        );

        return reply.code(201).send({
          message: "Product created successfully",
          id: result.insertId,
        });
      } catch (error) {
        logger.error({ error }, "Failed to create product");
        return reply.code(500).send({ error: "Failed to create product" });
      }
    }
  );

  // PUT /api/products/:id - Update product
  server.put<{ Params: { id: string }; Body: ProductBody }>(
    "/:id",
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const product = request.body;
        const { clientId, branchId, userId } = request.user!;

        // Check if product exists
        const [existing] = await db.query<RowDataPacket[]>(
          `SELECT id FROM products 
           WHERE id = ? AND client_id = ? AND branch_id = ? AND is_deleted = 0`,
          [id, clientId, branchId]
        );

        if (existing.length === 0) {
          return reply.code(404).send({ error: "Product not found" });
        }

        // Check if barcode exists on other product
        if (product.barcode) {
          const [barcodeCheck] = await db.query<RowDataPacket[]>(
            `SELECT id FROM products 
             WHERE barcode = ? AND id != ? AND client_id = ? AND branch_id = ? AND is_deleted = 0`,
            [product.barcode, id, clientId, branchId]
          );

          if (barcodeCheck.length > 0) {
            return reply.code(400).send({ error: "Barcode already exists" });
          }
        }

        await db.query(
          `UPDATE products SET 
            name = ?, barcode = ?, category_id = ?, price = ?, cost = ?,
            stock_quantity = ?, min_stock = ?, unit = ?, description = ?,
            image_url = ?, is_active = ?, updated_by = ?
           WHERE id = ? AND client_id = ? AND branch_id = ?`,
          [
            product.name,
            product.barcode,
            product.category_id,
            product.price,
            product.cost,
            product.stock_quantity,
            product.min_stock,
            product.unit,
            product.description,
            product.image_url,
            product.is_active !== false ? 1 : 0,
            userId,
            id,
            clientId,
            branchId,
          ]
        );

        return reply
          .code(200)
          .send({ message: "Product updated successfully" });
      } catch (error) {
        logger.error({ error }, "Failed to update product");
        return reply.code(500).send({ error: "Failed to update product" });
      }
    }
  );

  // DELETE /api/products/:id - Soft delete product
  server.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const { clientId, branchId, userId } = request.user!;

        const [result] = await db.query<ResultSetHeader>(
          `UPDATE products SET is_deleted = 1, updated_by = ? 
           WHERE id = ? AND client_id = ? AND branch_id = ?`,
          [userId, id, clientId, branchId]
        );

        if (result.affectedRows === 0) {
          return reply.code(404).send({ error: "Product not found" });
        }

        return reply
          .code(200)
          .send({ message: "Product deleted successfully" });
      } catch (error) {
        logger.error({ error }, "Failed to delete product");
        return reply.code(500).send({ error: "Failed to delete product" });
      }
    }
  );

  // GET /api/products/barcode/:barcode - Get product by barcode
  server.get<{ Params: { barcode: string } }>(
    "/barcode/:barcode",
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { barcode } = request.params;
        const { clientId, branchId } = request.user!;

        const [rows] = await db.query<RowDataPacket[]>(
          `SELECT p.*, pc.name as category_name 
           FROM products p 
           LEFT JOIN product_categories pc ON p.category_id = pc.id 
           WHERE p.barcode = ? AND p.client_id = ? AND p.branch_id = ? AND p.is_deleted = 0`,
          [barcode, clientId, branchId]
        );

        if (rows.length === 0) {
          return reply.code(404).send({ error: "Product not found" });
        }

        return reply.code(200).send({ data: rows[0] });
      } catch (error) {
        logger.error({ error }, "Failed to fetch product by barcode");
        return reply.code(500).send({ error: "Failed to fetch product" });
      }
    }
  );

  // GET /api/products/low-stock - Get low stock products
  server.get(
    "/low-stock",
    { preHandler: [server.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { clientId, branchId } = request.user!;

        const [products] = await db.query<RowDataPacket[]>(
          `SELECT p.*, pc.name as category_name 
           FROM products p 
           LEFT JOIN product_categories pc ON p.category_id = pc.id 
           WHERE p.client_id = ? AND p.branch_id = ? 
           AND p.is_deleted = 0 
           AND p.stock_quantity <= p.min_stock 
           ORDER BY p.stock_quantity ASC`,
          [clientId, branchId]
        );

        return reply.code(200).send({ data: products });
      } catch (error) {
        logger.error({ error }, "Failed to fetch low stock products");
        return reply
          .code(500)
          .send({ error: "Failed to fetch low stock products" });
      }
    }
  );
}
