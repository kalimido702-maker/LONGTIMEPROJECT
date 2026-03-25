import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { db } from "../config/database-factory.js";
import { logger } from "../config/logger.js";
import { RowDataPacket, ResultSetHeader } from "mysql2/promise";

interface CustomerBody {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  tax_number?: string;
  credit_limit?: number;
  current_balance?: number;
  notes?: string;
  is_active?: boolean;
  // New fields
  sales_rep_id?: string;
  bonus_balance?: number;
  previous_statement?: number;
  loyalty_points?: number;
  national_id?: string;
}

interface CustomerQueryString {
  page?: number;
  limit?: number;
  search?: string;
  is_active?: boolean;
}

export default async function customerRoutes(server: FastifyInstance) {
  // GET /api/customers - List all customers
  server.get<{ Querystring: CustomerQueryString }>(
    "/",
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const query = request.query as any;
        const { page = 1, limit = 50, search, is_active } = query;
        const { clientId, branchId } = request.user!;
        const offset = (page - 1) * limit;

        let whereConditions = [
          "client_id = ?",
          "branch_id = ?",
          "is_deleted = 0",
        ];
        let params: any[] = [clientId, branchId];

        if (search) {
          whereConditions.push("(name LIKE ? OR phone LIKE ? OR email LIKE ?)");
          params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        if (is_active !== undefined) {
          whereConditions.push("is_active = ?");
          params.push(is_active ? 1 : 0);
        }

        const whereClause = whereConditions.join(" AND ");

        // Get total count
        const [countRows] = await db.query<RowDataPacket[]>(
          `SELECT COUNT(*) as total FROM customers WHERE ${whereClause}`,
          params
        );
        const total = countRows[0].total;

        // Get customers
        const [customers] = await db.query<RowDataPacket[]>(
          `SELECT * FROM customers 
           WHERE ${whereClause} 
           ORDER BY name ASC 
           LIMIT ? OFFSET ?`,
          [...params, limit, offset]
        );

        return reply.code(200).send({
          data: customers,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
          },
        });
      } catch (error) {
        logger.error({ error }, "Failed to fetch customers");
        return reply.code(500).send({ error: "Failed to fetch customers" });
      }
    }
  );

  // GET /api/customers/:id - Get single customer
  server.get<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const { clientId, branchId } = request.user!;

        const [rows] = await db.query<RowDataPacket[]>(
          `SELECT * FROM customers 
           WHERE id = ? AND client_id = ? AND branch_id = ? AND is_deleted = 0`,
          [id, clientId, branchId]
        );

        if (rows.length === 0) {
          return reply.code(404).send({ error: "Customer not found" });
        }

        return reply.code(200).send({ data: rows[0] });
      } catch (error) {
        logger.error({ error }, "Failed to fetch customer");
        return reply.code(500).send({ error: "Failed to fetch customer" });
      }
    }
  );

  // POST /api/customers - Create customer
  server.post<{ Body: CustomerBody }>(
    "/",
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const customer = request.body;
        const { clientId, branchId, userId } = request.user!;

        // Check if phone exists
        if (customer.phone) {
          const [existing] = await db.query<RowDataPacket[]>(
            `SELECT id FROM customers 
             WHERE phone = ? AND client_id = ? AND branch_id = ? AND is_deleted = 0`,
            [customer.phone, clientId, branchId]
          );

          if (existing.length > 0) {
            return reply
              .code(400)
              .send({ error: "Phone number already exists" });
          }
        }

        const [result] = await db.query<ResultSetHeader>(
          `INSERT INTO customers (
            client_id, branch_id, name, phone, email, address,
            tax_number, credit_limit, current_balance, notes, is_active,
            sales_rep_id, bonus_balance, previous_statement, loyalty_points, national_id,
            created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            clientId,
            branchId,
            customer.name,
            customer.phone,
            customer.email,
            customer.address,
            customer.tax_number,
            customer.credit_limit || 0,
            customer.current_balance || 0,
            customer.notes,
            customer.is_active !== false ? 1 : 0,
            customer.sales_rep_id || null,
            customer.bonus_balance || 0,
            customer.previous_statement || 0,
            customer.loyalty_points || 0,
            customer.national_id || null,
            userId,
          ]
        );

        return reply.code(201).send({
          message: "Customer created successfully",
          id: result.insertId,
        });
      } catch (error) {
        logger.error({ error }, "Failed to create customer");
        return reply.code(500).send({ error: "Failed to create customer" });
      }
    }
  );

  // PUT /api/customers/:id - Update customer
  server.put<{ Params: { id: string }; Body: CustomerBody }>(
    "/:id",
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const customer = request.body;
        const { clientId, branchId, userId } = request.user!;

        // Check if customer exists
        const [existing] = await db.query<RowDataPacket[]>(
          `SELECT id FROM customers 
           WHERE id = ? AND client_id = ? AND branch_id = ? AND is_deleted = 0`,
          [id, clientId, branchId]
        );

        if (existing.length === 0) {
          return reply.code(404).send({ error: "Customer not found" });
        }

        // Check if phone exists on other customer
        if (customer.phone) {
          const [phoneCheck] = await db.query<RowDataPacket[]>(
            `SELECT id FROM customers 
             WHERE phone = ? AND id != ? AND client_id = ? AND branch_id = ? AND is_deleted = 0`,
            [customer.phone, id, clientId, branchId]
          );

          if (phoneCheck.length > 0) {
            return reply
              .code(400)
              .send({ error: "Phone number already exists" });
          }
        }

        await db.query(
          `UPDATE customers SET 
            name = ?, phone = ?, email = ?, address = ?, tax_number = ?,
            credit_limit = ?, current_balance = ?, notes = ?, is_active = ?,
            sales_rep_id = ?, bonus_balance = ?, previous_statement = ?, loyalty_points = ?, national_id = ?,
            updated_by = ?
           WHERE id = ? AND client_id = ? AND branch_id = ?`,
          [
            customer.name,
            customer.phone,
            customer.email,
            customer.address,
            customer.tax_number,
            customer.credit_limit,
            customer.current_balance,
            customer.notes,
            customer.is_active !== false ? 1 : 0,
            customer.sales_rep_id || null,
            customer.bonus_balance || 0,
            customer.previous_statement || 0,
            customer.loyalty_points || 0,
            customer.national_id || null,
            userId,
            id,
            clientId,
            branchId,
          ]
        );

        return reply
          .code(200)
          .send({ message: "Customer updated successfully" });
      } catch (error) {
        logger.error({ error }, "Failed to update customer");
        return reply.code(500).send({ error: "Failed to update customer" });
      }
    }
  );

  // DELETE /api/customers/:id - Soft delete customer
  server.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const { clientId, branchId, userId } = request.user!;

        const [result] = await db.query<ResultSetHeader>(
          `UPDATE customers SET is_deleted = 1, updated_by = ? 
           WHERE id = ? AND client_id = ? AND branch_id = ?`,
          [userId, id, clientId, branchId]
        );

        if (result.affectedRows === 0) {
          return reply.code(404).send({ error: "Customer not found" });
        }

        return reply
          .code(200)
          .send({ message: "Customer deleted successfully" });
      } catch (error) {
        logger.error({ error }, "Failed to delete customer");
        return reply.code(500).send({ error: "Failed to delete customer" });
      }
    }
  );

  // GET /api/customers/:id/balance - Get customer balance
  server.get<{ Params: { id: string } }>(
    "/:id/balance",
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const { clientId, branchId } = request.user!;

        const [rows] = await db.query<RowDataPacket[]>(
          `SELECT current_balance, credit_limit 
           FROM customers 
           WHERE id = ? AND client_id = ? AND branch_id = ? AND is_deleted = 0`,
          [id, clientId, branchId]
        );

        if (rows.length === 0) {
          return reply.code(404).send({ error: "Customer not found" });
        }

        return reply.code(200).send({
          data: {
            current_balance: rows[0].current_balance,
            credit_limit: rows[0].credit_limit,
            available_credit: rows[0].credit_limit - rows[0].current_balance,
          },
        });
      } catch (error) {
        logger.error({ error }, "Failed to fetch customer balance");
        return reply
          .code(500)
          .send({ error: "Failed to fetch customer balance" });
      }
    }
  );

  // GET /api/customers/with-location - Get all customers that have lat/lng set
  // For admin purposes to see which customers have location data
  server.get(
    "/with-location",
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { clientId, branchId } = request.user!;

        const [customers] = await db.query<RowDataPacket[]>(
          `SELECT id, name, phone, address, latitude, longitude, address_text,
                  customer_type, national_id, credit_limit, current_balance, bonus_balance,
                  previous_statement, sales_rep_id, class, whatsapp_group_id,
                  invoice_group_id, collection_group_id, loyalty_points, created_at, notes
           FROM customers
           WHERE client_id = ?
             AND branch_id = ?
             AND is_deleted = 0
             AND latitude IS NOT NULL
             AND longitude IS NOT NULL
           ORDER BY name ASC`,
          [clientId, branchId]
        );

        return reply.code(200).send({
          data: customers,
          total: customers.length,
        });
      } catch (error) {
        logger.error({ error }, "Failed to fetch customers with location");
        return reply.code(500).send({ error: "Failed to fetch customers with location" });
      }
    }
  );
}
