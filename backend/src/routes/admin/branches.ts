import { FastifyInstance } from "fastify";
import { db } from "../../config/database-factory.js";
import { logger } from "../../config/logger.js";
import { RowDataPacket, ResultSetHeader } from "mysql2/promise";

async function adminBranchesRoutes(fastify: FastifyInstance) {
    // Get all branches with pagination
    fastify.get<{
        Querystring: { page?: number; limit?: number; search?: string; clientId?: string };
    }>("/", { preValidation: [fastify.authenticate] }, async (request, reply) => {
        const page = Number(request.query.page) || 1;
        const limit = Number(request.query.limit) || 50;
        const { search, clientId } = request.query;
        const offset = (page - 1) * limit;

        try {
            let whereClause = "WHERE b.is_deleted = FALSE";
            const params: (string | number)[] = [];

            if (search) {
                whereClause += " AND (b.name LIKE ? OR c.name LIKE ?)";
                params.push(`%${search}%`, `%${search}%`);
            }

            if (clientId) {
                whereClause += " AND b.client_id = ?";
                params.push(clientId);
            }

            // Get total count
            const [countResult] = await db.query<RowDataPacket[]>(
                `SELECT COUNT(*) as total FROM branches b LEFT JOIN clients c ON b.client_id = c.id ${whereClause}`,
                params
            );
            const total = countResult[0]?.total || 0;

            // Get branches
            const [branches] = await db.query<RowDataPacket[]>(
                `SELECT b.*, c.name as client_name
         FROM branches b
         LEFT JOIN clients c ON b.client_id = c.id
         ${whereClause}
         ORDER BY b.created_at DESC
         LIMIT ? OFFSET ?`,
                [...params, limit, offset]
            );

            return {
                data: branches.map((b) => ({
                    ...b,
                    clientName: b.client_name,
                })),
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            };
        } catch (error: any) {
            // Log the full error for debugging
            logger.error({
                error: error?.message || error,
                code: error?.code,
                sqlMessage: error?.sqlMessage,
                sql: error?.sql
            }, "Get branches error");

            // For any database error, return empty data to prevent frontend crash
            if (error?.code?.startsWith('ER_') || error?.sqlMessage) {
                logger.warn("Database error in branches route, returning empty data");
                return {
                    data: [],
                    total: 0,
                    page,
                    limit,
                    totalPages: 0,
                };
            }
            return reply.status(500).send({ message: "حدث خطأ", error: error?.message });
        }
    });

    // Toggle branch status
    fastify.put<{ Params: { id: string } }>(
        "/:id/status",
        { preValidation: [fastify.authenticate] },
        async (request, reply) => {
            const { id } = request.params;

            try {
                await db.query<ResultSetHeader>(
                    `UPDATE branches SET is_active = NOT is_active WHERE id = ?`,
                    [id]
                );

                logger.info({ branchId: id }, "Branch status toggled");

                return { message: "تم تحديث حالة الفرع" };
            } catch (error) {
                logger.error({ error }, "Toggle branch status error");
                return reply.status(500).send({ message: "حدث خطأ" });
            }
        }
    );
}

export default adminBranchesRoutes;
