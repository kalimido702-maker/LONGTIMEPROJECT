import { FastifyInstance } from "fastify";
import { db } from "../../config/database-factory.js";
import { logger } from "../../config/logger.js";
import { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";

// مفتاح التشفير السري - يجب أن يكون نفس المفتاح في الـ Electron
const ENCRYPTION_SECRET = "MASR-POS-2024-SECURE-KEY-@#$%^&*";

// Generate license key (format: 16 chars without dashes) with checksum
// متوافق مع خوارزمية الـ Electron
function generateLicenseKey(): string {
    // توليد 12 حرف عشوائي
    const randomPart = crypto
        .randomBytes(6)
        .toString("hex")
        .toUpperCase()
        .substring(0, 12);

    // حساب الـ checksum (آخر 4 أحرف)
    const hash = crypto
        .createHash("md5")
        .update(randomPart + ENCRYPTION_SECRET)
        .digest("hex");
    const checksum = hash.substring(0, 4).toUpperCase();

    // Return key WITHOUT dashes (16 characters)
    return randomPart + checksum;
}

async function adminLicensesRoutes(fastify: FastifyInstance) {
    // Get all licenses
    fastify.get<{
        Querystring: { page?: number; limit?: number; search?: string; status?: string; clientId?: string };
    }>("/", { preValidation: [fastify.authenticate] }, async (request, reply) => {
        const page = Number(request.query.page) || 1;
        const limit = Number(request.query.limit) || 20;
        const { search, status, clientId } = request.query;
        const offset = (page - 1) * limit;

        try {
            let whereClause = "WHERE 1=1";
            const params: (string | number)[] = [];

            if (search) {
                whereClause += " AND (l.license_key LIKE ? OR c.name LIKE ?)";
                params.push(`%${search}%`, `%${search}%`);
            }

            if (clientId) {
                whereClause += " AND l.client_id = ?";
                params.push(clientId);
            }

            if (status === "active") {
                whereClause += " AND l.is_active = TRUE AND (l.expires_at IS NULL OR l.expires_at > NOW())";
            } else if (status === "expired") {
                whereClause += " AND l.expires_at < NOW()";
            } else if (status === "unused") {
                whereClause += " AND l.device_id IS NULL";
            }

            // Get total count
            const [countResult] = await db.query<RowDataPacket[]>(
                `SELECT COUNT(*) as total FROM licenses l LEFT JOIN clients c ON l.client_id = c.id ${whereClause}`,
                params
            );
            const total = countResult[0]?.total || 0;

            // Get licenses
            const [licenses] = await db.query<RowDataPacket[]>(
                `SELECT l.*, c.name as client_name, b.name as branch_name
         FROM licenses l
         LEFT JOIN clients c ON l.client_id = c.id
         LEFT JOIN branches b ON l.branch_id = b.id
         ${whereClause}
         ORDER BY l.created_at DESC
         LIMIT ? OFFSET ?`,
                [...params, limit, offset]
            );

            return {
                data: licenses,
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
            }, "Get licenses error");

            // For any database error, return empty data to prevent frontend crash
            if (error?.code?.startsWith('ER_') || error?.sqlMessage) {
                logger.warn("Database error in licenses route, returning empty data");
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

    // Get single license
    fastify.get<{ Params: { id: string } }>(
        "/:id",
        { preValidation: [fastify.authenticate] },
        async (request, reply) => {
            const { id } = request.params;

            try {
                const [licenses] = await db.query<RowDataPacket[]>(
                    `SELECT l.*, c.name as client_name, b.name as branch_name
           FROM licenses l
           LEFT JOIN clients c ON l.client_id = c.id
           LEFT JOIN branches b ON l.branch_id = b.id
           WHERE l.id = ?`,
                    [id]
                );

                if (!licenses[0]) {
                    return reply.status(404).send({ message: "الترخيص غير موجود" });
                }

                return licenses[0];
            } catch (error) {
                logger.error({ error }, "Get license error");
                return reply.status(500).send({ message: "حدث خطأ" });
            }
        }
    );

    // Create single license
    fastify.post<{
        Body: {
            clientId: string;
            branchId?: string;
            expiresAt?: string;
            maxDevices?: number;
            notes?: string;
            // Sync settings
            syncInterval?: number;
            enableSync?: boolean;
            enableOfflineMode?: boolean;
            autoUpdate?: boolean;
        };
    }>("/", { preValidation: [fastify.authenticate] }, async (request, reply) => {
        const {
            clientId, branchId, expiresAt, maxDevices, notes,
            syncInterval, enableSync, enableOfflineMode, autoUpdate
        } = request.body;

        try {
            const id = uuidv4();
            const licenseKey = generateLicenseKey();

            await db.query<ResultSetHeader>(
                `INSERT INTO licenses (id, license_key, client_id, branch_id, expires_at, max_devices, notes, sync_interval, enable_sync, enable_offline_mode, auto_update)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    id, licenseKey, clientId, branchId || null, expiresAt || null, maxDevices || 1, notes || null,
                    syncInterval ?? 300000, // default 5 min
                    enableSync ?? true,
                    enableOfflineMode ?? false,
                    autoUpdate ?? true
                ]
            );

            logger.info({ licenseId: id, licenseKey }, "License created");

            return reply.status(201).send({
                id,
                licenseKey,
                message: "تم إنشاء الترخيص بنجاح",
            });
        } catch (error) {
            logger.error({ error }, "Create license error");
            return reply.status(500).send({ message: "حدث خطأ" });
        }
    });

    // Generate bulk licenses
    fastify.post<{
        Body: {
            clientId: string;
            count: number;
            expiresAt?: string;
            maxDevices?: number;
        };
    }>("/generate", { preValidation: [fastify.authenticate] }, async (request, reply) => {
        const { clientId, count, expiresAt, maxDevices } = request.body;

        if (count < 1 || count > 100) {
            return reply.status(400).send({ message: "يجب أن يكون العدد بين 1 و 100" });
        }

        try {
            const licenses: { id: string; licenseKey: string }[] = [];

            for (let i = 0; i < count; i++) {
                const id = uuidv4();
                const licenseKey = generateLicenseKey();

                await db.query<ResultSetHeader>(
                    `INSERT INTO licenses (id, license_key, client_id, expires_at, max_devices)
           VALUES (?, ?, ?, ?, ?)`,
                    [id, licenseKey, clientId, expiresAt, maxDevices || 1]
                );

                licenses.push({ id, licenseKey });
            }

            logger.info({ clientId, count }, "Bulk licenses generated");

            return reply.status(201).send({
                licenses,
                message: `تم إنشاء ${count} تراخيص بنجاح`,
            });
        } catch (error) {
            logger.error({ error }, "Generate licenses error");
            return reply.status(500).send({ message: "حدث خطأ" });
        }
    });

    // Renew license
    fastify.post<{
        Params: { id: string };
        Body: { months?: number; expiresAt?: string };
    }>("/:id/renew", { preValidation: [fastify.authenticate] }, async (request, reply) => {
        const { id } = request.params;
        const { months, expiresAt } = request.body;

        try {
            let newExpiresAt = expiresAt;

            if (!newExpiresAt && months) {
                // Extend from current expiry or now
                newExpiresAt = `DATE_ADD(COALESCE(expires_at, NOW()), INTERVAL ${months} MONTH)`;
                await db.query<ResultSetHeader>(
                    `UPDATE licenses SET expires_at = ${newExpiresAt}, is_active = TRUE WHERE id = ?`,
                    [id]
                );
            } else if (newExpiresAt) {
                await db.query<ResultSetHeader>(
                    `UPDATE licenses SET expires_at = ?, is_active = TRUE WHERE id = ?`,
                    [newExpiresAt, id]
                );
            }

            logger.info({ licenseId: id }, "License renewed");

            return { message: "تم تجديد الترخيص بنجاح" };
        } catch (error) {
            logger.error({ error }, "Renew license error");
            return reply.status(500).send({ message: "حدث خطأ" });
        }
    });

    // Revoke license
    fastify.post<{ Params: { id: string } }>(
        "/:id/revoke",
        { preValidation: [fastify.authenticate] },
        async (request, reply) => {
            const { id } = request.params;

            try {
                await db.query<ResultSetHeader>(
                    `UPDATE licenses SET is_active = FALSE, device_id = NULL WHERE id = ?`,
                    [id]
                );

                logger.info({ licenseId: id }, "License revoked");

                return { message: "تم إلغاء الترخيص بنجاح" };
            } catch (error) {
                logger.error({ error }, "Revoke license error");
                return reply.status(500).send({ message: "حدث خطأ" });
            }
        }
    );

    // Delete license
    fastify.delete<{ Params: { id: string } }>(
        "/:id",
        { preValidation: [fastify.authenticate] },
        async (request, reply) => {
            const { id } = request.params;

            try {
                await db.query<ResultSetHeader>(`DELETE FROM licenses WHERE id = ?`, [id]);

                logger.info({ licenseId: id }, "License deleted");

                return { message: "تم حذف الترخيص بنجاح" };
            } catch (error) {
                logger.error({ error }, "Delete license error");
                return reply.status(500).send({ message: "حدث خطأ" });
            }
        }
    );
}

export default adminLicensesRoutes;
