import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { db } from "../config/database-factory.js";
import { logger } from "../config/logger.js";
import { RowDataPacket, ResultSetHeader } from "mysql2/promise";

interface SupervisorBody {
    name: string;
    phone?: string;
    email?: string;
    is_active?: boolean;
    notes?: string;
}

interface SupervisorQueryString {
    page?: number;
    limit?: number;
    search?: string;
    is_active?: boolean;
}

export async function supervisorRoutes(server: FastifyInstance) {
    // Get all supervisors
    server.get<{ Querystring: SupervisorQueryString }>(
        "/",
        {
            preHandler: [server.authenticate],
        },
        async (request, reply) => {
            try {
                const { page = 1, limit = 50, search, is_active } = request.query;
                const offset = (page - 1) * limit;
                const { clientId, branchId } = request.user;

                let query = `
          SELECT * FROM supervisors 
          WHERE client_id = ? AND (branch_id = ? OR branch_id IS NULL)
          AND is_deleted = FALSE
        `;
                const params: any[] = [clientId, branchId];

                if (search) {
                    query += ` AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)`;
                    const searchTerm = `%${search}%`;
                    params.push(searchTerm, searchTerm, searchTerm);
                }

                if (is_active !== undefined) {
                    query += ` AND is_active = ?`;
                    params.push(is_active);
                }

                query += ` ORDER BY name ASC LIMIT ? OFFSET ?`;
                params.push(limit, offset);

                const [rows] = await db.execute<RowDataPacket[]>(query, params);

                // Get total count
                let countQuery = `
          SELECT COUNT(*) as total FROM supervisors 
          WHERE client_id = ? AND (branch_id = ? OR branch_id IS NULL)
          AND is_deleted = FALSE
        `;
                const countParams: any[] = [clientId, branchId];

                if (search) {
                    countQuery += ` AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)`;
                    const searchTerm = `%${search}%`;
                    countParams.push(searchTerm, searchTerm, searchTerm);
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
                logger.error({ error }, "Failed to get supervisors");
                return reply.code(500).send({
                    success: false,
                    error: "Failed to get supervisors",
                    message: error.message,
                });
            }
        }
    );

    // Get single supervisor
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
                    `SELECT * FROM supervisors 
           WHERE id = ? AND client_id = ? AND (branch_id = ? OR branch_id IS NULL)
           AND is_deleted = FALSE`,
                    [id, clientId, branchId]
                );

                if (rows.length === 0) {
                    return reply.code(404).send({
                        success: false,
                        error: "Supervisor not found",
                    });
                }

                return reply.send({
                    success: true,
                    data: rows[0],
                });
            } catch (error: any) {
                logger.error({ error }, "Failed to get supervisor");
                return reply.code(500).send({
                    success: false,
                    error: "Failed to get supervisor",
                    message: error.message,
                });
            }
        }
    );

    // Create supervisor
    server.post<{ Body: SupervisorBody }>(
        "/",
        {
            preHandler: [server.authenticate],
        },
        async (request, reply) => {
            try {
                const { name, phone, email, is_active = true, notes } = request.body;
                const { clientId, branchId, userId } = request.user;
                const id = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

                await db.execute(
                    `INSERT INTO supervisors 
           (id, client_id, branch_id, name, phone, email, is_active, notes, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [id, clientId, branchId, name, phone, email, is_active, notes, userId]
                );

                const [rows] = await db.execute<RowDataPacket[]>(
                    `SELECT * FROM supervisors WHERE id = ?`,
                    [id]
                );

                logger.info({ id, name }, "Supervisor created");

                return reply.code(201).send({
                    success: true,
                    data: rows[0],
                });
            } catch (error: any) {
                logger.error({ error }, "Failed to create supervisor");
                return reply.code(500).send({
                    success: false,
                    error: "Failed to create supervisor",
                    message: error.message,
                });
            }
        }
    );

    // Update supervisor
    server.put<{ Params: { id: string }; Body: SupervisorBody }>(
        "/:id",
        {
            preHandler: [server.authenticate],
        },
        async (request, reply) => {
            try {
                const { id } = request.params;
                const { name, phone, email, is_active, notes } = request.body;
                const { clientId, branchId, userId } = request.user;

                const [result] = await db.execute<ResultSetHeader>(
                    `UPDATE supervisors SET
           name = COALESCE(?, name),
           phone = COALESCE(?, phone),
           email = COALESCE(?, email),
           is_active = COALESCE(?, is_active),
           notes = COALESCE(?, notes),
           updated_by = ?
           WHERE id = ? AND client_id = ? AND (branch_id = ? OR branch_id IS NULL)`,
                    [name, phone, email, is_active, notes, userId, id, clientId, branchId]
                );

                if (result.affectedRows === 0) {
                    return reply.code(404).send({
                        success: false,
                        error: "Supervisor not found",
                    });
                }

                const [rows] = await db.execute<RowDataPacket[]>(
                    `SELECT * FROM supervisors WHERE id = ?`,
                    [id]
                );

                logger.info({ id }, "Supervisor updated");

                return reply.send({
                    success: true,
                    data: rows[0],
                });
            } catch (error: any) {
                logger.error({ error }, "Failed to update supervisor");
                return reply.code(500).send({
                    success: false,
                    error: "Failed to update supervisor",
                    message: error.message,
                });
            }
        }
    );

    // Delete supervisor (soft delete)
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
                    `UPDATE supervisors SET is_deleted = TRUE
           WHERE id = ? AND client_id = ? AND (branch_id = ? OR branch_id IS NULL)`,
                    [id, clientId, branchId]
                );

                if (result.affectedRows === 0) {
                    return reply.code(404).send({
                        success: false,
                        error: "Supervisor not found",
                    });
                }

                logger.info({ id }, "Supervisor deleted");

                return reply.send({
                    success: true,
                    message: "Supervisor deleted successfully",
                });
            } catch (error: any) {
                logger.error({ error }, "Failed to delete supervisor");
                return reply.code(500).send({
                    success: false,
                    error: "Failed to delete supervisor",
                    message: error.message,
                });
            }
        }
    );
}
