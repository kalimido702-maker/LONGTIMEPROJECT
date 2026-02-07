import { FastifyInstance } from "fastify";
import bcrypt from "bcrypt";
import { db } from "../config/database-factory.js";
import { logger } from "../config/logger.js";
import { RowDataPacket, ResultSetHeader } from "mysql2/promise";

// Admin login route (separate from regular users)
async function adminRoutes(fastify: FastifyInstance) {
    // Admin Login
    fastify.post<{
        Body: { username: string; password: string };
    }>("/login", async (request, reply) => {
        const { username, password } = request.body;

        try {
            let admin: RowDataPacket | undefined;

            // Try admin_users table first (may not exist yet)
            try {
                const [admins] = await db.query<RowDataPacket[]>(
                    `SELECT * FROM admin_users WHERE username = ? AND is_active = TRUE`,
                    [username]
                );
                admin = admins[0];
            } catch (tableError) {
                // Table doesn't exist, skip
                logger.debug("admin_users table not found, falling back to users table");
            }

            // If no admin found, check users table with super_admin or admin role
            if (!admin) {
                const [users] = await db.query<RowDataPacket[]>(
                    `SELECT * FROM users WHERE username = ? AND role IN ('super_admin', 'admin', 'owner') AND is_active = TRUE`,
                    [username]
                );
                admin = users[0];
            }

            if (!admin) {
                return reply.status(401).send({ message: "بيانات الدخول غير صحيحة" });
            }

            const passwordField = admin.password_hash || admin.password;
            const isValidPassword = await bcrypt.compare(password, passwordField);

            if (!isValidPassword) {
                return reply.status(401).send({ message: "بيانات الدخول غير صحيحة" });
            }

            // Parse permissions safely
            const parsePermissions = (perms: any) => {
                if (!perms) return ["*"];
                if (Array.isArray(perms)) return perms;
                if (typeof perms === 'string') {
                    try {
                        return JSON.parse(perms);
                    } catch {
                        return perms === '*' ? ["*"] : [perms];
                    }
                }
                return ["*"];
            };

            // Generate token with fields compatible with authMiddleware
            const tokenPayload = {
                type: "access" as const,  // Required by authMiddleware
                userId: admin.id,
                clientId: admin.client_id || 1,
                branchId: admin.branch_id || 1,
                role: admin.role || "super_admin",
                // Admin-specific fields
                adminId: admin.id,
                username: admin.username,
                permissions: parsePermissions(admin.permissions),
            };

            const accessToken = fastify.jwt.sign(tokenPayload, { expiresIn: "8h" });

            // Update last login
            await db.query(`UPDATE admin_users SET last_login_at = ? WHERE id = ?`, [
                new Date().toISOString(),
                admin.id,
            ]).catch(() => {
                // Ignore if table doesn't exist
            });

            logger.info({ adminId: admin.id, username }, "Admin logged in");

            return {
                accessToken,
                user: {
                    id: admin.id,
                    username: admin.username,
                    fullName: admin.full_name,
                    email: admin.email,
                    role: admin.role || "super_admin",
                    permissions: parsePermissions(admin.permissions),
                    isActive: admin.is_active,
                },
            };
        } catch (error: any) {
            logger.error({
                error: error?.message || error,
                stack: error?.stack,
                code: error?.code
            }, "Admin login error");
            return reply.status(500).send({ message: "حدث خطأ في الخادم", error: error?.message });
        }
    });

    // Dashboard Stats
    fastify.get("/dashboard", { preValidation: [fastify.authenticate] }, async (request, reply) => {
        try {
            // Safely query each table with fallback
            let clientsTotal = 0, clientsActive = 0;
            let branchesTotal = 0;
            let licensesTotal = 0, licensesActive = 0, licensesExpiring = 0;

            try {
                const [clientsResult] = await db.query<RowDataPacket[]>(
                    `SELECT COUNT(*) as total, SUM(CASE WHEN is_active = TRUE THEN 1 ELSE 0 END) as active FROM clients WHERE is_deleted = FALSE`
                );
                clientsTotal = clientsResult[0]?.total || 0;
                clientsActive = clientsResult[0]?.active || 0;
            } catch (e: any) {
                if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
                logger.warn("clients table not found");
            }

            try {
                const [branchesResult] = await db.query<RowDataPacket[]>(
                    `SELECT COUNT(*) as total FROM branches WHERE is_deleted = FALSE`
                );
                branchesTotal = branchesResult[0]?.total || 0;
            } catch (e: any) {
                if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
                logger.warn("branches table not found");
            }

            try {
                const now = new Date().toISOString();
                const weekFromNow = new Date();
                weekFromNow.setDate(weekFromNow.getDate() + 7);
                const [licensesResult] = await db.query<RowDataPacket[]>(
                    `SELECT COUNT(*) as total, 
                    SUM(CASE WHEN is_active = 1 AND (expires_at IS NULL OR expires_at > ?) THEN 1 ELSE 0 END) as active,
                    SUM(CASE WHEN expires_at BETWEEN ? AND ? THEN 1 ELSE 0 END) as expiring
             FROM licenses`, [now, now, weekFromNow.toISOString()]
                );
                licensesTotal = licensesResult[0]?.total || 0;
                licensesActive = licensesResult[0]?.active || 0;
                licensesExpiring = licensesResult[0]?.expiring || 0;
            } catch (e: any) {
                if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
                logger.warn("licenses table not found");
            }

            return {
                totalClients: clientsTotal,
                activeClients: clientsActive,
                totalBranches: branchesTotal,
                totalLicenses: licensesTotal,
                activeLicenses: licensesActive,
                expiringLicenses: licensesExpiring,
                monthlyRevenue: 0, // TODO: Calculate from payments
                connectedDevices: 0, // TODO: Get from WebSocket
            };
        } catch (error: any) {
            logger.error({ error: error?.message || error, code: error?.code }, "Dashboard stats error");
            return reply.status(500).send({ message: "حدث خطأ", error: error?.message });
        }
    });
}

export default adminRoutes;
