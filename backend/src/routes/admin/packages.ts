/**
 * Packages Admin Routes
 * CRUD operations for packages/plans management
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { db } from "../../config/database-factory.js";
import { logger } from "../../config/logger.js";
import { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { v4 as uuidv4 } from "uuid";

// All available features in the system
export const ALL_FEATURES = [
    { id: "pos", name: "نقطة البيع", path: "/" },
    { id: "customers", name: "العملاء", path: "/customers" },
    { id: "invoices", name: "الفواتير", path: "/invoices" },
    { id: "reports", name: "التقارير", path: "/reports" },
    { id: "inventory", name: "المخزون", path: "/inventory" },
    { id: "categories", name: "التصنيفات", path: "/product-categories" },
    { id: "suppliers", name: "الموردين", path: "/suppliers" },
    { id: "purchases", name: "المشتريات", path: "/purchases" },
    { id: "employees", name: "الموظفين", path: "/employees" },
    { id: "employee_advances", name: "سلف الموظفين", path: "/employee-advances" },
    { id: "employee_deductions", name: "خصومات الموظفين", path: "/employee-deductions" },
    { id: "promotions", name: "العروض", path: "/promotions" },
    { id: "installments", name: "الأقساط", path: "/installments" },
    { id: "credit", name: "الآجل", path: "/credit" },
    { id: "deposit_sources", name: "مصادر الإيداع", path: "/deposit-sources" },
    { id: "deposits", name: "الإيداعات", path: "/deposits" },
    { id: "expense_categories", name: "أنواع المصروفات", path: "/expense-categories" },
    { id: "expenses", name: "المصروفات", path: "/expenses" },
    { id: "shifts", name: "الورديات", path: "/shifts" },
    { id: "sales_returns", name: "مرتجعات المبيعات", path: "/sales-returns" },
    { id: "purchase_returns", name: "مرتجعات المشتريات", path: "/purchase-returns" },
    { id: "restaurant", name: "المطاعم", path: "/restaurant" },
    { id: "whatsapp", name: "واتساب - الحسابات", path: "/whatsapp-management" },
    { id: "whatsapp_campaigns", name: "واتساب - الحملات", path: "/whatsapp-campaigns" },
    { id: "settings", name: "الإعدادات", path: "/settings" },
    { id: "roles_permissions", name: "الصلاحيات", path: "/roles-permissions" },
];

interface Package {
    id: string;
    name: string;
    name_ar: string;
    description: string | null;
    price: number;
    duration_months: number;
    max_products: number;
    max_users: number;
    max_branches: number;
    max_whatsapp_accounts: number;
    features: string | string[];
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
}

async function adminPackagesRoutes(fastify: FastifyInstance) {
    // Get all available features
    fastify.get("/features", { preValidation: [fastify.authenticate] }, async (request, reply) => {
        return { data: ALL_FEATURES };
    });

    // Get all packages
    fastify.get<{
        Querystring: { page?: number; limit?: number; active?: string };
    }>("/", { preValidation: [fastify.authenticate] }, async (request, reply) => {
        const page = Number(request.query.page) || 1;
        const limit = Number(request.query.limit) || 20;
        const { active } = request.query;
        const offset = (page - 1) * limit;

        try {
            let whereClause = "WHERE 1=1";
            const params: (string | number)[] = [];

            if (active === "true") {
                whereClause += " AND is_active = TRUE";
            } else if (active === "false") {
                whereClause += " AND is_active = FALSE";
            }

            // Get total count
            const [countResult] = await db.query<RowDataPacket[]>(
                `SELECT COUNT(*) as total FROM packages ${whereClause}`,
                params
            );
            const total = countResult[0]?.total || 0;

            // Get packages
            const [packages] = await db.query<RowDataPacket[]>(
                `SELECT * FROM packages ${whereClause} ORDER BY price ASC LIMIT ? OFFSET ?`,
                [...params, limit, offset]
            );

            // Parse features JSON
            const parsedPackages = packages.map((pkg: any) => ({
                ...pkg,
                features: typeof pkg.features === "string" ? JSON.parse(pkg.features) : pkg.features,
            }));

            return {
                data: parsedPackages,
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            };
        } catch (error: any) {
            logger.error({ error: error?.message || error }, "Get packages error");
            return { data: [], total: 0, page: 1, limit: 20, totalPages: 0 };
        }
    });

    // Get single package
    fastify.get<{ Params: { id: string } }>("/:id", { preValidation: [fastify.authenticate] }, async (request, reply) => {
        try {
            const { id } = request.params;
            const [packages] = await db.query<RowDataPacket[]>(
                "SELECT * FROM packages WHERE id = ?",
                [id]
            );

            if (packages.length === 0) {
                return reply.code(404).send({ error: "Package not found" });
            }

            const pkg = packages[0];
            pkg.features = typeof pkg.features === "string" ? JSON.parse(pkg.features) : pkg.features;

            return { data: pkg };
        } catch (error: any) {
            logger.error({ error: error?.message || error }, "Get package error");
            return reply.code(500).send({ error: "Internal server error" });
        }
    });

    // Create package
    fastify.post<{
        Body: {
            name: string;
            name_ar: string;
            description?: string;
            price?: number;
            duration_months?: number;
            max_products?: number;
            max_users?: number;
            max_branches?: number;
            max_whatsapp_accounts?: number;
            features: string[];
            is_active?: boolean;
        };
    }>("/", { preValidation: [fastify.authenticate] }, async (request, reply) => {
        try {
            const {
                name,
                name_ar,
                description,
                price = 0,
                duration_months = 12,
                max_products = 100,
                max_users = 1,
                max_branches = 1,
                max_whatsapp_accounts = 0,
                features,
                is_active = true,
            } = request.body;

            const id = `pkg_${uuidv4().replace(/-/g, "").substring(0, 12)}`;

            await db.query(
                `INSERT INTO packages 
                (id, name, name_ar, description, price, duration_months, max_products, max_users, max_branches, max_whatsapp_accounts, features, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, name, name_ar, description || null, price, duration_months, max_products, max_users, max_branches, max_whatsapp_accounts, JSON.stringify(features), is_active]
            );

            return reply.code(201).send({
                id,
                message: "تم إنشاء الباقة بنجاح",
            });
        } catch (error: any) {
            logger.error({ error: error?.message || error }, "Create package error");
            return reply.code(500).send({ error: "Internal server error" });
        }
    });

    // Update package
    fastify.put<{
        Params: { id: string };
        Body: {
            name?: string;
            name_ar?: string;
            description?: string;
            price?: number;
            duration_months?: number;
            max_products?: number;
            max_users?: number;
            max_branches?: number;
            max_whatsapp_accounts?: number;
            features?: string[];
            is_active?: boolean;
        };
    }>("/:id", { preValidation: [fastify.authenticate] }, async (request, reply) => {
        try {
            const { id } = request.params;
            const updates = request.body;

            // Build dynamic update query
            const fields: string[] = [];
            const values: any[] = [];

            if (updates.name !== undefined) {
                fields.push("name = ?");
                values.push(updates.name);
            }
            if (updates.name_ar !== undefined) {
                fields.push("name_ar = ?");
                values.push(updates.name_ar);
            }
            if (updates.description !== undefined) {
                fields.push("description = ?");
                values.push(updates.description);
            }
            if (updates.price !== undefined) {
                fields.push("price = ?");
                values.push(updates.price);
            }
            if (updates.duration_months !== undefined) {
                fields.push("duration_months = ?");
                values.push(updates.duration_months);
            }
            if (updates.max_products !== undefined) {
                fields.push("max_products = ?");
                values.push(updates.max_products);
            }
            if (updates.max_users !== undefined) {
                fields.push("max_users = ?");
                values.push(updates.max_users);
            }
            if (updates.max_branches !== undefined) {
                fields.push("max_branches = ?");
                values.push(updates.max_branches);
            }
            if (updates.max_whatsapp_accounts !== undefined) {
                fields.push("max_whatsapp_accounts = ?");
                values.push(updates.max_whatsapp_accounts);
            }
            if (updates.features !== undefined) {
                fields.push("features = ?");
                values.push(JSON.stringify(updates.features));
            }
            if (updates.is_active !== undefined) {
                fields.push("is_active = ?");
                values.push(updates.is_active);
            }

            if (fields.length === 0) {
                return reply.code(400).send({ error: "No fields to update" });
            }

            values.push(id);

            await db.query(
                `UPDATE packages SET ${fields.join(", ")} WHERE id = ?`,
                values
            );

            return { message: "تم تحديث الباقة بنجاح" };
        } catch (error: any) {
            logger.error({ error: error?.message || error }, "Update package error");
            return reply.code(500).send({ error: "Internal server error" });
        }
    });

    // Delete package
    fastify.delete<{ Params: { id: string } }>("/:id", { preValidation: [fastify.authenticate] }, async (request, reply) => {
        try {
            const { id } = request.params;

            // Check if any licenses are using this package
            const [licenses] = await db.query<RowDataPacket[]>(
                "SELECT COUNT(*) as count FROM licenses WHERE package_id = ?",
                [id]
            );

            if (licenses[0].count > 0) {
                return reply.code(400).send({
                    error: "Cannot delete package",
                    message: `هذه الباقة مستخدمة في ${licenses[0].count} ترخيص. قم بإلغاء ربط التراخيص أولاً.`,
                });
            }

            await db.query("DELETE FROM packages WHERE id = ?", [id]);

            return { message: "تم حذف الباقة بنجاح" };
        } catch (error: any) {
            logger.error({ error: error?.message || error }, "Delete package error");
            return reply.code(500).send({ error: "Internal server error" });
        }
    });

    // Get package statistics
    fastify.get("/stats/overview", { preValidation: [fastify.authenticate] }, async (request, reply) => {
        try {
            const [packages] = await db.query<RowDataPacket[]>(
                "SELECT COUNT(*) as total, SUM(CASE WHEN is_active = TRUE THEN 1 ELSE 0 END) as active FROM packages"
            );

            const [licensesPerPackage] = await db.query<RowDataPacket[]>(
                `SELECT p.id, p.name_ar, COUNT(l.id) as license_count 
                 FROM packages p 
                 LEFT JOIN licenses l ON p.id = l.package_id 
                 GROUP BY p.id, p.name_ar`
            );

            return {
                totalPackages: packages[0]?.total || 0,
                activePackages: packages[0]?.active || 0,
                licensesPerPackage,
            };
        } catch (error: any) {
            logger.error({ error: error?.message || error }, "Get package stats error");
            return { totalPackages: 0, activePackages: 0, licensesPerPackage: [] };
        }
    });
}

export default adminPackagesRoutes;
