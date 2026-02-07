import { FastifyInstance } from "fastify";
import { db } from "../../config/database-factory.js";
import { logger } from "../../config/logger.js";
import { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { v4 as uuidv4 } from "uuid";

async function adminClientsRoutes(fastify: FastifyInstance) {
    // Get all clients with pagination
    fastify.get<{
        Querystring: { page?: number; limit?: number; search?: string; status?: string };
    }>("/", { preValidation: [fastify.authenticate] }, async (request, reply) => {
        const page = Number(request.query.page) || 1;
        const limit = Number(request.query.limit) || 20;
        const { search, status } = request.query;
        const offset = (page - 1) * limit;

        try {
            let whereClause = "WHERE c.is_deleted = FALSE";
            const params: (string | number)[] = [];

            if (search) {
                whereClause += " AND (c.name LIKE ? OR c.email LIKE ? OR c.phone LIKE ?)";
                params.push(`%${search}%`, `%${search}%`, `%${search}%`);
            }

            if (status === "active") {
                whereClause += " AND c.is_active = TRUE";
            } else if (status === "inactive") {
                whereClause += " AND c.is_active = FALSE";
            }

            // Get total count
            const [countResult] = await db.query<RowDataPacket[]>(
                `SELECT COUNT(*) as total FROM clients c ${whereClause}`,
                params
            );
            const total = countResult[0]?.total || 0;

            // Get clients with branch and license counts
            const [clients] = await db.query<RowDataPacket[]>(
                `SELECT c.*,
                (SELECT COUNT(*) FROM branches WHERE client_id = c.id AND is_deleted = FALSE) as branches_count,
                (SELECT COUNT(*) FROM licenses WHERE client_id = c.id) as licenses_count
         FROM clients c
         ${whereClause}
         ORDER BY c.created_at DESC
         LIMIT ? OFFSET ?`,
                [...params, limit, offset]
            );

            return {
                data: clients,
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
            }, "Get clients error");

            // For any database error, return empty data to prevent frontend crash
            if (error?.code?.startsWith('ER_') || error?.sqlMessage) {
                logger.warn("Database error in clients route, returning empty data");
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

    // Get single client
    fastify.get<{ Params: { id: string } }>(
        "/:id",
        { preValidation: [fastify.authenticate] },
        async (request, reply) => {
            const { id } = request.params;

            try {
                const [clients] = await db.query<RowDataPacket[]>(
                    `SELECT c.*,
                  (SELECT COUNT(*) FROM branches WHERE client_id = c.id AND is_deleted = FALSE) as branches_count,
                  (SELECT COUNT(*) FROM licenses WHERE client_id = c.id) as licenses_count,
                  (SELECT COUNT(*) FROM invoices WHERE client_id = c.id AND is_deleted = FALSE) as invoices_count,
                  (SELECT COALESCE(SUM(net_total), 0) FROM invoices WHERE client_id = c.id AND is_deleted = FALSE) as total_sales
           FROM clients c
           WHERE c.id = ?`,
                    [id]
                );

                if (!clients[0]) {
                    return reply.status(404).send({ message: "التاجر غير موجود" });
                }

                return clients[0];
            } catch (error) {
                logger.error({ error }, "Get client error");
                return reply.status(500).send({ message: "حدث خطأ" });
            }
        }
    );

    // Create client
    fastify.post<{
        Body: {
            name: string;
            nameEn?: string;
            email?: string;
            phone?: string;
            address?: string;
            taxNumber?: string;
            subscriptionPlan?: string;
            maxBranches?: number;
            maxDevices?: number;
        };
    }>("/", { preValidation: [fastify.authenticate] }, async (request, reply) => {
        const { name, nameEn, email, phone, address, taxNumber, subscriptionPlan, maxBranches, maxDevices } =
            request.body;

        try {
            const id = uuidv4();

            await db.query<ResultSetHeader>(
                `INSERT INTO clients (id, name, name_en, email, phone, address, tax_number, subscription_plan, max_branches, max_devices)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, name, nameEn, email, phone, address, taxNumber, subscriptionPlan || "basic", maxBranches || 1, maxDevices || 1]
            );

            // Create main branch
            const branchId = uuidv4();
            await db.query<ResultSetHeader>(
                `INSERT INTO branches (id, client_id, name, is_main) VALUES (?, ?, ?, TRUE)`,
                [branchId, id, "الفرع الرئيسي"]
            );

            logger.info({ clientId: id }, "Client created");

            return reply.status(201).send({ id, message: "تم إنشاء التاجر بنجاح" });
        } catch (error) {
            logger.error({ error }, "Create client error");
            return reply.status(500).send({ message: "حدث خطأ" });
        }
    });

    // Update client
    fastify.put<{
        Params: { id: string };
        Body: {
            name?: string;
            nameEn?: string;
            email?: string;
            phone?: string;
            address?: string;
            taxNumber?: string;
            subscriptionPlan?: string;
            maxBranches?: number;
            maxDevices?: number;
        };
    }>("/:id", { preValidation: [fastify.authenticate] }, async (request, reply) => {
        const { id } = request.params;
        const updates = request.body;

        try {
            const fields: string[] = [];
            const values: (string | number)[] = [];

            if (updates.name) {
                fields.push("name = ?");
                values.push(updates.name);
            }
            if (updates.nameEn !== undefined) {
                fields.push("name_en = ?");
                values.push(updates.nameEn);
            }
            if (updates.email !== undefined) {
                fields.push("email = ?");
                values.push(updates.email);
            }
            if (updates.phone !== undefined) {
                fields.push("phone = ?");
                values.push(updates.phone);
            }
            if (updates.address !== undefined) {
                fields.push("address = ?");
                values.push(updates.address);
            }
            if (updates.taxNumber !== undefined) {
                fields.push("tax_number = ?");
                values.push(updates.taxNumber);
            }
            if (updates.subscriptionPlan) {
                fields.push("subscription_plan = ?");
                values.push(updates.subscriptionPlan);
            }
            if (updates.maxBranches !== undefined) {
                fields.push("max_branches = ?");
                values.push(updates.maxBranches);
            }
            if (updates.maxDevices !== undefined) {
                fields.push("max_devices = ?");
                values.push(updates.maxDevices);
            }

            if (fields.length === 0) {
                return reply.status(400).send({ message: "لا توجد بيانات للتحديث" });
            }

            values.push(id);

            await db.query<ResultSetHeader>(
                `UPDATE clients SET ${fields.join(", ")} WHERE id = ?`,
                values
            );

            logger.info({ clientId: id }, "Client updated");

            return { message: "تم تحديث التاجر بنجاح" };
        } catch (error) {
            logger.error({ error }, "Update client error");
            return reply.status(500).send({ message: "حدث خطأ" });
        }
    });

    // Toggle client status
    fastify.put<{ Params: { id: string } }>(
        "/:id/status",
        { preValidation: [fastify.authenticate] },
        async (request, reply) => {
            const { id } = request.params;

            try {
                await db.query<ResultSetHeader>(
                    `UPDATE clients SET is_active = NOT is_active WHERE id = ?`,
                    [id]
                );

                logger.info({ clientId: id }, "Client status toggled");

                return { message: "تم تحديث حالة التاجر" };
            } catch (error) {
                logger.error({ error }, "Toggle client status error");
                return reply.status(500).send({ message: "حدث خطأ" });
            }
        }
    );

    // Delete client (soft delete)
    fastify.delete<{ Params: { id: string } }>(
        "/:id",
        { preValidation: [fastify.authenticate] },
        async (request, reply) => {
            const { id } = request.params;

            try {
                await db.query<ResultSetHeader>(
                    `UPDATE clients SET is_deleted = TRUE WHERE id = ?`,
                    [id]
                );

                logger.info({ clientId: id }, "Client deleted");

                return { message: "تم حذف التاجر بنجاح" };
            } catch (error) {
                logger.error({ error }, "Delete client error");
                return reply.status(500).send({ message: "حدث خطأ" });
            }
        }
    );

    // Get client stats
    fastify.get<{ Params: { id: string } }>(
        "/:id/stats",
        { preValidation: [fastify.authenticate] },
        async (request, reply) => {
            const { id } = request.params;

            try {
                const [stats] = await db.query<RowDataPacket[]>(
                    `SELECT 
            (SELECT COUNT(*) FROM invoices WHERE client_id = ? AND is_deleted = FALSE) as total_invoices,
            (SELECT COALESCE(SUM(net_total), 0) FROM invoices WHERE client_id = ? AND is_deleted = FALSE) as total_sales,
            (SELECT COUNT(*) FROM products WHERE client_id = ? AND is_deleted = FALSE) as total_products,
            (SELECT COUNT(*) FROM customers WHERE client_id = ? AND is_deleted = FALSE) as total_customers,
            (SELECT COUNT(*) FROM branches WHERE client_id = ? AND is_deleted = FALSE AND is_active = TRUE) as active_branches,
            (SELECT COUNT(*) FROM licenses WHERE client_id = ? AND is_active = TRUE) as active_licenses`,
                    [id, id, id, id, id, id]
                );

                return stats[0] || {};
            } catch (error) {
                logger.error({ error }, "Get client stats error");
                return reply.status(500).send({ message: "حدث خطأ" });
            }
        }
    );

    // ==================== Users Sync Endpoints ====================

    /**
     * GET /api/admin/clients/users
     * Get all users for the authenticated client (for frontend sync)
     */
    fastify.get(
        "/users",
        { preValidation: [fastify.authenticate] },
        async (request, reply) => {
            try {
                const { clientId, branchId } = (request as any).user || {};

                if (!clientId) {
                    return reply.status(401).send({ message: "Unauthorized" });
                }

                const [users] = await db.query<RowDataPacket[]>(
                    `SELECT id, username, full_name as name, email, phone, role, role_id, 
                            is_active, created_at, updated_at
                     FROM users 
                     WHERE client_id = ? AND is_deleted = FALSE
                     ORDER BY created_at DESC`,
                    [clientId]
                );

                // Return users without passwords
                return users.map((user: any) => ({
                    ...user,
                    password: undefined, // Never send passwords
                }));
            } catch (error: any) {
                logger.error({ error }, "Get users for sync error");
                return reply.status(500).send({ message: "حدث خطأ", error: error?.message });
            }
        }
    );

    /**
     * GET /api/admin/roles
     * Get all roles for the authenticated client (for frontend sync)
     */
    fastify.get(
        "/roles",
        { preValidation: [fastify.authenticate] },
        async (request, reply) => {
            try {
                const { clientId } = (request as any).user || {};

                // First try client-specific roles
                let roles: RowDataPacket[] = [];

                if (clientId) {
                    const [clientRoles] = await db.query<RowDataPacket[]>(
                        `SELECT id, name, description, permissions, is_system, created_at, updated_at
                         FROM roles 
                         WHERE (client_id = ? OR client_id IS NULL) AND is_deleted = FALSE
                         ORDER BY is_system DESC, name ASC`,
                        [clientId]
                    );
                    roles = clientRoles;
                } else {
                    // Fallback to system roles only
                    const [systemRoles] = await db.query<RowDataPacket[]>(
                        `SELECT id, name, description, permissions, is_system, created_at, updated_at
                         FROM roles 
                         WHERE client_id IS NULL AND is_deleted = FALSE
                         ORDER BY is_system DESC, name ASC`
                    );
                    roles = systemRoles;
                }

                // Parse permissions JSON if needed
                return roles.map((role: any) => ({
                    ...role,
                    permissions: typeof role.permissions === 'string'
                        ? JSON.parse(role.permissions)
                        : role.permissions,
                }));
            } catch (error: any) {
                logger.error({ error }, "Get roles for sync error");

                // If roles table doesn't exist, return default roles
                if (error?.code === 'ER_NO_SUCH_TABLE') {
                    return [
                        { id: 'owner', name: 'المالك', permissions: {}, is_system: true },
                        { id: 'admin', name: 'مدير', permissions: {}, is_system: true },
                        { id: 'cashier', name: 'كاشير', permissions: {}, is_system: true },
                    ];
                }

                return reply.status(500).send({ message: "حدث خطأ", error: error?.message });
            }
        }
    );
}

export default adminClientsRoutes;
