import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { db } from "../config/database-factory.js";
import { logger } from "../config/logger.js";
import { RowDataPacket, ResultSetHeader } from "mysql2/promise";

interface SalesRepBody {
    name: string;
    phone?: string;
    email?: string;
    supervisor_id?: string;
    commission_rate?: number;
    is_active?: boolean;
    notes?: string;
}

interface SalesRepQueryString {
    page?: number;
    limit?: number;
    search?: string;
    supervisor_id?: string;
    is_active?: boolean;
}

export async function salesRepRoutes(server: FastifyInstance) {
    // Get all sales reps
    server.get<{ Querystring: SalesRepQueryString }>(
        "/",
        {
            preHandler: [server.authenticate],
        },
        async (request, reply) => {
            try {
                const { page = 1, limit = 50, search, supervisor_id, is_active } = request.query;
                const offset = (page - 1) * limit;
                const { clientId, branchId } = request.user;

                let query = `
          SELECT sr.*, s.name as supervisor_name
          FROM sales_reps sr
          LEFT JOIN supervisors s ON sr.supervisor_id = s.id
          WHERE sr.client_id = ? AND (sr.branch_id = ? OR sr.branch_id IS NULL)
          AND sr.is_deleted = FALSE
        `;
                const params: any[] = [clientId, branchId];

                if (search) {
                    query += ` AND (sr.name LIKE ? OR sr.phone LIKE ? OR sr.email LIKE ?)`;
                    const searchTerm = `%${search}%`;
                    params.push(searchTerm, searchTerm, searchTerm);
                }

                if (supervisor_id) {
                    query += ` AND sr.supervisor_id = ?`;
                    params.push(supervisor_id);
                }

                if (is_active !== undefined) {
                    query += ` AND sr.is_active = ?`;
                    params.push(is_active);
                }

                query += ` ORDER BY sr.name ASC LIMIT ? OFFSET ?`;
                params.push(limit, offset);

                const [rows] = await db.execute<RowDataPacket[]>(query, params);

                // Get total count
                let countQuery = `
          SELECT COUNT(*) as total FROM sales_reps 
          WHERE client_id = ? AND (branch_id = ? OR branch_id IS NULL)
          AND is_deleted = FALSE
        `;
                const countParams: any[] = [clientId, branchId];

                if (search) {
                    countQuery += ` AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)`;
                    const searchTerm = `%${search}%`;
                    countParams.push(searchTerm, searchTerm, searchTerm);
                }

                if (supervisor_id) {
                    countQuery += ` AND supervisor_id = ?`;
                    countParams.push(supervisor_id);
                }

                if (is_active !== undefined) {
                    countQuery += ` AND is_active = ?`;
                    countParams.push(is_active);
                }

                const [countResult] = await db.execute<RowDataPacket[]>(countQuery, countParams);
                const total = countResult[0]?.total || 0;

                return reply.send({
                    success: true,
                    data: rows,
                    pagination: {
                        page,
                        limit,
                        total,
                        totalPages: Math.ceil(total / limit),
                    },
                });
            } catch (error: any) {
                logger.error({ error }, "Failed to get sales reps");
                return reply.code(500).send({
                    success: false,
                    error: "Failed to get sales reps",
                    message: error.message,
                });
            }
        }
    );

    // Get single sales rep
    server.get<{ Params: { id: string } }>(
        "/:id",
        {
            preHandler: [server.authenticate],
        },
        async (request, reply) => {
            try {
                const { id } = request.params;
                const { clientId, branchId } = request.user;

                const [rows] = await db.execute<RowDataPacket[]>(
                    `SELECT sr.*, s.name as supervisor_name
           FROM sales_reps sr
           LEFT JOIN supervisors s ON sr.supervisor_id = s.id
           WHERE sr.id = ? AND sr.client_id = ? AND (sr.branch_id = ? OR sr.branch_id IS NULL)
           AND sr.is_deleted = FALSE`,
                    [id, clientId, branchId]
                );

                if (rows.length === 0) {
                    return reply.code(404).send({
                        success: false,
                        error: "Sales rep not found",
                    });
                }

                return reply.send({
                    success: true,
                    data: rows[0],
                });
            } catch (error: any) {
                logger.error({ error }, "Failed to get sales rep");
                return reply.code(500).send({
                    success: false,
                    error: "Failed to get sales rep",
                    message: error.message,
                });
            }
        }
    );

    // Create sales rep
    server.post<{ Body: SalesRepBody }>(
        "/",
        {
            preHandler: [server.authenticate],
        },
        async (request, reply) => {
            try {
                const { name, phone, email, supervisor_id, commission_rate = 0, is_active = true, notes } = request.body;
                const { clientId, branchId, userId } = request.user;
                const id = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

                await db.execute(
                    `INSERT INTO sales_reps 
           (id, client_id, branch_id, supervisor_id, name, phone, email, commission_rate, is_active, notes, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [id, clientId, branchId, supervisor_id, name, phone, email, commission_rate, is_active, notes, userId]
                );

                const [rows] = await db.execute<RowDataPacket[]>(
                    `SELECT sr.*, s.name as supervisor_name
           FROM sales_reps sr
           LEFT JOIN supervisors s ON sr.supervisor_id = s.id
           WHERE sr.id = ?`,
                    [id]
                );

                logger.info({ id, name }, "Sales rep created");

                return reply.code(201).send({
                    success: true,
                    data: rows[0],
                });
            } catch (error: any) {
                logger.error({ error }, "Failed to create sales rep");
                return reply.code(500).send({
                    success: false,
                    error: "Failed to create sales rep",
                    message: error.message,
                });
            }
        }
    );

    // Update sales rep
    server.put<{ Params: { id: string }; Body: SalesRepBody }>(
        "/:id",
        {
            preHandler: [server.authenticate],
        },
        async (request, reply) => {
            try {
                const { id } = request.params;
                const { name, phone, email, supervisor_id, commission_rate, is_active, notes } = request.body;
                const { clientId, branchId, userId } = request.user;

                const [result] = await db.execute<ResultSetHeader>(
                    `UPDATE sales_reps SET
           name = COALESCE(?, name),
           phone = COALESCE(?, phone),
           email = COALESCE(?, email),
           supervisor_id = COALESCE(?, supervisor_id),
           commission_rate = COALESCE(?, commission_rate),
           is_active = COALESCE(?, is_active),
           notes = COALESCE(?, notes),
           updated_by = ?
           WHERE id = ? AND client_id = ? AND (branch_id = ? OR branch_id IS NULL)`,
                    [name, phone, email, supervisor_id, commission_rate, is_active, notes, userId, id, clientId, branchId]
                );

                if (result.affectedRows === 0) {
                    return reply.code(404).send({
                        success: false,
                        error: "Sales rep not found",
                    });
                }

                const [rows] = await db.execute<RowDataPacket[]>(
                    `SELECT sr.*, s.name as supervisor_name
           FROM sales_reps sr
           LEFT JOIN supervisors s ON sr.supervisor_id = s.id
           WHERE sr.id = ?`,
                    [id]
                );

                logger.info({ id }, "Sales rep updated");

                return reply.send({
                    success: true,
                    data: rows[0],
                });
            } catch (error: any) {
                logger.error({ error }, "Failed to update sales rep");
                return reply.code(500).send({
                    success: false,
                    error: "Failed to update sales rep",
                    message: error.message,
                });
            }
        }
    );

    // Delete sales rep (soft delete)
    server.delete<{ Params: { id: string } }>(
        "/:id",
        {
            preHandler: [server.authenticate],
        },
        async (request, reply) => {
            try {
                const { id } = request.params;
                const { clientId, branchId } = request.user;

                const [result] = await db.execute<ResultSetHeader>(
                    `UPDATE sales_reps SET is_deleted = TRUE
           WHERE id = ? AND client_id = ? AND (branch_id = ? OR branch_id IS NULL)`,
                    [id, clientId, branchId]
                );

                if (result.affectedRows === 0) {
                    return reply.code(404).send({
                        success: false,
                        error: "Sales rep not found",
                    });
                }

                logger.info({ id }, "Sales rep deleted");

                return reply.send({
                    success: true,
                    message: "Sales rep deleted successfully",
                });
            } catch (error: any) {
                logger.error({ error }, "Failed to delete sales rep");
                return reply.code(500).send({
                    success: false,
                    error: "Failed to delete sales rep",
                    message: error.message,
                });
            }
        }
    );

    // Get sales reps by supervisor
    server.get<{ Params: { supervisorId: string } }>(
        "/by-supervisor/:supervisorId",
        {
            preHandler: [server.authenticate],
        },
        async (request, reply) => {
            try {
                const { supervisorId } = request.params;
                const { clientId, branchId } = request.user;

                const [rows] = await db.execute<RowDataPacket[]>(
                    `SELECT * FROM sales_reps 
           WHERE supervisor_id = ? AND client_id = ? AND (branch_id = ? OR branch_id IS NULL)
           AND is_deleted = FALSE AND is_active = TRUE
           ORDER BY name ASC`,
                    [supervisorId, clientId, branchId]
                );

                return reply.send({
                    success: true,
                    data: rows,
                });
            } catch (error: any) {
                logger.error({ error }, "Failed to get sales reps by supervisor");
                return reply.code(500).send({
                    success: false,
                    error: "Failed to get sales reps",
                    message: error.message,
                });
            }
        }
    );
}
