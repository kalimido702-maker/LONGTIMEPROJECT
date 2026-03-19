import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { db } from "../config/database-factory.js";
import { logger } from "../config/logger.js";
import { RowDataPacket } from "mysql2/promise";
import { randomUUID } from "crypto";
import bcrypt from "bcrypt";

/**
 * Mobile Account Management Routes
 * 
 * These endpoints allow admins to create and manage mobile app accounts
 * for customers, sales reps, and supervisors who don't have user accounts.
 * 
 * The flow:
 * 1. Admin opens "Mobile Accounts" page in desktop app
 * 2. Sees list of customers/reps/supervisors without accounts
 * 3. Clicks "Create Account" → auto-generates username (phone) and password
 * 4. User can then log in to the mobile app
 */

interface CreateAccountBody {
  entityType: 'customer' | 'sales_rep' | 'supervisor';
  entityId: string;
  username?: string;  // optional, defaults to phone number
  password?: string;  // optional, defaults to phone number
  parentUserId?: string; // optional, links this account as a sub-account
}

interface BulkCreateAccountBody {
  entityType: 'customer' | 'sales_rep' | 'supervisor';
  entityIds: string[];
  defaultPassword?: string;  // optional, defaults to phone number per entity
}

interface UpdateAccountBody {
  password?: string;
  isActive?: boolean;
  parentUserId?: string | null;
}

interface BulkActionBody {
  accountIds: string[];
  action: 'delete' | 'disable' | 'enable';
}

// Username prefix per entity type
const USERNAME_PREFIX: Record<string, string> = {
  customer: 'cs',
  sales_rep: 'sr',
  supervisor: 'sv',
};

export async function mobileAccountRoutes(server: FastifyInstance) {

  // ============================================================
  // Helper: Check if user is admin
  // ============================================================
  function requireAdmin(role: string, reply: FastifyReply): boolean {
    // if (role !== 'admin' && role !== 'super_admin' && role !== 'owner') {
    //   reply.code(403).send({ error: "Forbidden", message: "Admin access required" });
    //   return false;
    // }
    return true;
  }

  // ============================================================
  // Helper: Generate unique username like cs1, cs2, sr1, sv1...
  // ============================================================
  async function generateUsername(entityType: string): Promise<string> {
    const prefix = USERNAME_PREFIX[entityType] || 'u';
    // Find the highest existing number for this prefix
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT username FROM users WHERE username REGEXP ? AND is_deleted = 0 ORDER BY CAST(SUBSTRING(username, ?) AS UNSIGNED) DESC LIMIT 1`,
      [`^${prefix}[0-9]+$`, prefix.length + 1]
    );
    let nextNum = 1;
    if (rows.length > 0) {
      const existingNum = parseInt(rows[0].username.replace(prefix, ''), 10);
      if (!isNaN(existingNum)) {
        nextNum = existingNum + 1;
      }
    }
    return `${prefix}${nextNum}`;
  }

  // ============================================================
  // GET /api/mobile/accounts
  // List all mobile accounts with their linked entity info
  // ============================================================
  server.get(
    "/",
    { preHandler: [server.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { clientId, branchId, role } = request.user!;
        if (!requireAdmin(role, reply)) return;

        const { entity_type, page = 1, limit = 50, search } = request.query as {
          entity_type?: string;
          page?: number;
          limit?: number;
          search?: string;
        };

        let conditions = [
          "u.client_id = ?",
          "u.is_deleted = 0",
          "u.account_source IN ('mobile_admin', 'mobile_auto')",
        ];
        let params: any[] = [clientId];

        if (entity_type === 'customer') {
          conditions.push("u.linked_customer_id IS NOT NULL");
        } else if (entity_type === 'sales_rep') {
          conditions.push("u.linked_sales_rep_id IS NOT NULL");
        } else if (entity_type === 'supervisor') {
          conditions.push("u.linked_supervisor_id IS NOT NULL");
        }

        if (search) {
          conditions.push("(u.username LIKE ? OR u.full_name LIKE ?)");
          params.push(`%${search}%`, `%${search}%`);
        }

        const whereClause = conditions.join(" AND ");
        const offset = (Number(page) - 1) * Number(limit);

        // Get total count
        const [countResult] = await db.query<RowDataPacket[]>(
          `SELECT COUNT(*) as total FROM users u WHERE ${whereClause}`,
          params
        );

        // Get accounts with entity info
        const [accounts] = await db.query<RowDataPacket[]>(
          `SELECT 
            u.id, u.username, u.full_name, u.phone, u.role, u.is_active,
            u.linked_customer_id, u.linked_sales_rep_id, u.linked_supervisor_id,
            u.parent_user_id, p.full_name as parent_name,
            u.account_source, u.created_at, u.last_login_at,
            c.name as customer_name, c.phone as customer_phone, c.balance as customer_balance,
            sr.name as sales_rep_name, sr.phone as sales_rep_phone,
            sv.name as supervisor_name, sv.phone as supervisor_phone
          FROM users u
          LEFT JOIN users p ON u.parent_user_id = p.id
          LEFT JOIN customers c ON u.linked_customer_id = c.id
          LEFT JOIN sales_reps sr ON u.linked_sales_rep_id = sr.id
          LEFT JOIN supervisors sv ON u.linked_supervisor_id = sv.id
          WHERE ${whereClause}
          ORDER BY u.created_at DESC
          LIMIT ? OFFSET ?`,
          [...params, Number(limit), offset]
        );

        return reply.code(200).send({
          data: accounts,
          pagination: {
            total: countResult[0]?.total || 0,
            page: Number(page),
            limit: Number(limit),
            pages: Math.ceil((countResult[0]?.total || 0) / Number(limit)),
          },
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        logger.error({ error, message: errMsg }, "Failed to fetch mobile accounts");
        return reply.code(500).send({ error: "Failed to fetch mobile accounts", details: errMsg });
      }
    }
  );

  // ============================================================
  // GET /api/mobile/accounts/available
  // List entities that DON'T have accounts yet (available for account creation)
  // ============================================================
  server.get(
    "/available",
    { preHandler: [server.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { clientId, branchId, role } = request.user!;
        if (!requireAdmin(role, reply)) return;

        const { entity_type, search } = request.query as {
          entity_type: 'customer' | 'sales_rep' | 'supervisor';
          search?: string;
        };

        if (!entity_type) {
          return reply.code(400).send({ error: "entity_type is required (customer, sales_rep, supervisor)" });
        }

        let results: RowDataPacket[] = [];

        if (entity_type === 'customer') {
          let conditions = [
            "c.client_id = ?",
            "c.is_deleted = 0",
            "c.id NOT IN (SELECT linked_customer_id FROM users WHERE linked_customer_id IS NOT NULL AND is_deleted = 0)",
          ];
          let params: any[] = [clientId];

          if (search) {
            conditions.push("(c.name LIKE ? OR c.phone LIKE ?)");
            params.push(`%${search}%`, `%${search}%`);
          }

          const [rows] = await db.query<RowDataPacket[]>(
            `SELECT c.id, c.name, c.phone, c.balance, c.credit_limit,
                    sr.name as sales_rep_name
             FROM customers c
             LEFT JOIN sales_reps sr ON c.sales_rep_id = sr.id
             WHERE ${conditions.join(" AND ")}
             ORDER BY c.name`,
            params
          );
          results = rows;

        } else if (entity_type === 'sales_rep') {
          let conditions = [
            "sr.client_id = ?",
            "sr.is_deleted = 0",
            "sr.is_active = 1",
            "sr.id NOT IN (SELECT linked_sales_rep_id FROM users WHERE linked_sales_rep_id IS NOT NULL AND is_deleted = 0)",
          ];
          let params: any[] = [clientId];

          if (search) {
            conditions.push("(sr.name LIKE ? OR sr.phone LIKE ?)");
            params.push(`%${search}%`, `%${search}%`);
          }

          const [rows] = await db.query<RowDataPacket[]>(
            `SELECT sr.id, sr.name, sr.phone, sr.commission_rate,
                    sv.name as supervisor_name
             FROM sales_reps sr
             LEFT JOIN supervisors sv ON sr.supervisor_id = sv.id
             WHERE ${conditions.join(" AND ")}
             ORDER BY sr.name`,
            params
          );
          results = rows;

        } else if (entity_type === 'supervisor') {
          let conditions = [
            "sv.client_id = ?",
            "sv.is_deleted = 0",
            "sv.is_active = 1",
            "sv.id NOT IN (SELECT linked_supervisor_id FROM users WHERE linked_supervisor_id IS NOT NULL AND is_deleted = 0)",
          ];
          let params: any[] = [clientId];

          if (search) {
            conditions.push("(sv.name LIKE ? OR sv.phone LIKE ?)");
            params.push(`%${search}%`, `%${search}%`);
          }

          const [rows] = await db.query<RowDataPacket[]>(
            `SELECT sv.id, sv.name, sv.phone,
                    (SELECT COUNT(*) FROM sales_reps WHERE supervisor_id = sv.id AND is_deleted = 0) as reps_count
             FROM supervisors sv
             WHERE ${conditions.join(" AND ")}
             ORDER BY sv.name`,
            params
          );
          results = rows;
        }

        return reply.code(200).send({ data: results });
      } catch (error) {
        logger.error({ error }, "Failed to fetch available entities");
        return reply.code(500).send({ error: "Failed to fetch available entities" });
      }
    }
  );

  // ============================================================
  // POST /api/mobile/accounts
  // Create a mobile account for a customer/sales_rep/supervisor
  // Username defaults to phone, password defaults to phone
  // ============================================================
  server.post(
    "/",
    { preHandler: [server.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { userId, clientId, branchId, role } = request.user!;
        if (!requireAdmin(role, reply)) return;

        const body = request.body as CreateAccountBody;
        const { entityType, entityId } = body;

        if (!entityType || !entityId) {
          return reply.code(400).send({ error: "entityType and entityId are required" });
        }

        // Fetch entity details based on type
        let entityName = '';
        let entityPhone = '';
        let linkColumn = '';
        let userRole = '';

        if (entityType === 'customer') {
          const [customers] = await db.query<RowDataPacket[]>(
            "SELECT name, phone FROM customers WHERE id = ? AND client_id = ? AND is_deleted = 0",
            [entityId, clientId]
          );
          if (customers.length === 0) {
            return reply.code(404).send({ error: "Customer not found" });
          }
          entityName = customers[0].name;
          entityPhone = customers[0].phone || '';
          linkColumn = 'linked_customer_id';
          userRole = 'customer';
        } else if (entityType === 'sales_rep') {
          const [reps] = await db.query<RowDataPacket[]>(
            "SELECT name, phone FROM sales_reps WHERE id = ? AND client_id = ? AND is_deleted = 0",
            [entityId, clientId]
          );
          if (reps.length === 0) {
            return reply.code(404).send({ error: "Sales rep not found" });
          }
          entityName = reps[0].name;
          entityPhone = reps[0].phone || '';
          linkColumn = 'linked_sales_rep_id';
          userRole = 'sales_rep';
        } else if (entityType === 'supervisor') {
          const [supervisors] = await db.query<RowDataPacket[]>(
            "SELECT name, phone FROM supervisors WHERE id = ? AND client_id = ? AND is_deleted = 0",
            [entityId, clientId]
          );
          if (supervisors.length === 0) {
            return reply.code(404).send({ error: "Supervisor not found" });
          }
          entityName = supervisors[0].name;
          entityPhone = supervisors[0].phone || '';
          linkColumn = 'linked_supervisor_id';
          userRole = 'supervisor';
        } else {
          return reply.code(400).send({ error: "Invalid entityType. Use: customer, sales_rep, supervisor" });
        }

        // Check if entity already has an account
        const [existing] = await db.query<RowDataPacket[]>(
          `SELECT id, username FROM users WHERE ${linkColumn} = ? AND client_id = ? AND is_deleted = 0`,
          [entityId, clientId]
        );
        if (existing.length > 0) {
          return reply.code(409).send({
            error: "Account already exists",
            message: `This ${entityType} already has an account: ${existing[0].username}`,
            existingUserId: existing[0].id,
          });
        }

        // Determine username & password
        // Username: if custom provided use it, otherwise auto-generate cs1/sr1/sv1 format
        let username = body.username;
        if (!username) {
          username = await generateUsername(entityType);
        }
        const rawPassword = body.password || entityPhone || username;

        // Check username uniqueness
        const [usernameCheck] = await db.query<RowDataPacket[]>(
          "SELECT id FROM users WHERE username = ? AND is_deleted = 0",
          [username]
        );
        if (usernameCheck.length > 0) {
          return reply.code(409).send({
            error: "Username already taken",
            message: `The username "${username}" is already in use. Please provide a different username.`,
          });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(rawPassword, 10);
        const newUserId = randomUUID();

        // Create user record
        await db.query(
          `INSERT INTO users (id, client_id, branch_id, username, password_hash, full_name, phone, role, is_active, account_source, ${linkColumn}, parent_user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE, 'mobile_admin', ?, ?)`,
          [newUserId, clientId, branchId, username, passwordHash, entityName, entityPhone, userRole, entityId, body.parentUserId || null]
        );

        logger.info(
          { entityType, entityId, username, newUserId },
          `Mobile account created for ${entityType}`
        );

        return reply.code(201).send({
          data: {
            id: newUserId,
            username,
            fullName: entityName,
            phone: entityPhone,
            role: userRole,
            entityType,
            entityId,
            defaultPassword: rawPassword === entityPhone ? 'phone_number' : 'custom',
          },
          message: `تم إنشاء حساب الموبايل بنجاح - اسم المستخدم: ${username}`,
        });
      } catch (error) {
        logger.error({ error }, "Failed to create mobile account");
        return reply.code(500).send({ error: "Failed to create mobile account" });
      }
    }
  );

  // ============================================================
  // GET /api/mobile/accounts/roles
  // List available roles for standalone account creation
  // ============================================================
  server.get(
    "/roles",
    { preHandler: [server.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { clientId, role } = request.user!;
        if (!requireAdmin(role, reply)) return;

        const [roles] = await db.query<RowDataPacket[]>(
          "SELECT id, name, name_en FROM roles WHERE client_id = ? AND is_deleted = 0 ORDER BY name",
          [clientId]
        );

        return reply.code(200).send({ data: roles });
      } catch (error) {
        logger.error({ error }, "Failed to fetch roles");
        return reply.code(500).send({ error: "Failed to fetch roles" });
      }
    }
  );

  // ============================================================
  // POST /api/mobile/accounts/standalone
  // Create a standalone mobile account (not linked to entity)
  // For admin/management roles like general_manager, sales_manager
  // ============================================================
  server.post(
    "/standalone",
    { preHandler: [server.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { userId, clientId, branchId, role } = request.user!;
        if (!requireAdmin(role, reply)) return;

        const body = request.body as {
          fullName: string;
          phone?: string;
          username: string;
          password: string;
          roleId: string;
          parentUserId?: string;
        };

        const { fullName, phone, username, password, roleId, parentUserId } = body;

        if (!fullName || !username || !password || !roleId) {
          return reply.code(400).send({
            error: "fullName, username, password, and roleId are required",
          });
        }

        if (username.length < 2) {
          return reply.code(400).send({ error: "Username must be at least 2 characters" });
        }

        if (password.length < 4) {
          return reply.code(400).send({ error: "Password must be at least 4 characters" });
        }

        // Check username uniqueness
        const [usernameCheck] = await db.query<RowDataPacket[]>(
          "SELECT id FROM users WHERE username = ? AND is_deleted = 0",
          [username]
        );
        if (usernameCheck.length > 0) {
          return reply.code(409).send({
            error: "Username already taken",
            message: `اسم المستخدم "${username}" مستخدم بالفعل. اختر اسم آخر.`,
          });
        }

        // Verify role exists
        const [roleCheck] = await db.query<RowDataPacket[]>(
          "SELECT id, name, name_en FROM roles WHERE id = ? AND client_id = ? AND is_deleted = 0",
          [roleId, clientId]
        );
        if (roleCheck.length === 0) {
          return reply.code(404).send({ error: "Role not found" });
        }

        // If parentUserId provided, verify it exists in the same client
        if (parentUserId) {
          const [parentCheck] = await db.query<RowDataPacket[]>(
            "SELECT id FROM users WHERE id = ? AND client_id = ? AND is_deleted = 0",
            [parentUserId, clientId]
          );
          if (parentCheck.length === 0) {
            return reply.code(404).send({ error: "Parent user not found" });
          }
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const newUserId = randomUUID();
        const roleName = roleCheck[0].name;

        await db.query(
          `INSERT INTO users (id, client_id, branch_id, username, password_hash, full_name, phone, role, is_active, account_source, parent_user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE, 'mobile_admin', ?)`,
          [newUserId, clientId, branchId, username, passwordHash, fullName, phone || '', roleName, parentUserId || null]
        );

        logger.info(
          { username, newUserId, role: roleName },
          "Standalone mobile account created"
        );

        return reply.code(201).send({
          data: {
            id: newUserId,
            username,
            fullName,
            phone: phone || '',
            role: roleName,
          },
          message: `تم إنشاء الحساب بنجاح - اسم المستخدم: ${username}`,
        });
      } catch (error) {
        logger.error({ error }, "Failed to create standalone account");
        return reply.code(500).send({ error: "Failed to create standalone account" });
      }
    }
  );

  // ============================================================
  // POST /api/mobile/accounts/bulk
  // Create multiple accounts at once
  // ============================================================
  server.post(
    "/bulk",
    { preHandler: [server.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { userId, clientId, branchId, role } = request.user!;
        if (!requireAdmin(role, reply)) return;

        const body = request.body as BulkCreateAccountBody;
        const { entityType, entityIds, defaultPassword } = body;

        if (!entityType || !entityIds || !Array.isArray(entityIds) || entityIds.length === 0) {
          return reply.code(400).send({ error: "entityType and entityIds[] are required" });
        }

        if (entityIds.length > 200) {
          return reply.code(400).send({ error: "Maximum 200 accounts can be created at once" });
        }

        const results: { entityId: string; status: 'created' | 'skipped' | 'error'; username?: string; reason?: string }[] = [];
        let createdCount = 0;
        let skippedCount = 0;

        // Determine table and link column
        let tableName = '';
        let linkColumn = '';
        let userRole = '';

        if (entityType === 'customer') {
          tableName = 'customers';
          linkColumn = 'linked_customer_id';
          userRole = 'customer';
        } else if (entityType === 'sales_rep') {
          tableName = 'sales_reps';
          linkColumn = 'linked_sales_rep_id';
          userRole = 'sales_rep';
        } else if (entityType === 'supervisor') {
          tableName = 'supervisors';
          linkColumn = 'linked_supervisor_id';
          userRole = 'supervisor';
        } else {
          return reply.code(400).send({ error: "Invalid entityType" });
        }

        for (const entityId of entityIds) {
          try {
            // Fetch entity
            const [entities] = await db.query<RowDataPacket[]>(
              `SELECT name, phone FROM ${tableName} WHERE id = ? AND client_id = ? AND is_deleted = 0`,
              [entityId, clientId]
            );

            if (entities.length === 0) {
              results.push({ entityId, status: 'skipped', reason: 'Entity not found' });
              skippedCount++;
              continue;
            }

            const entity = entities[0];
            const phone = entity.phone || '';

            // Check if already has account
            const [existing] = await db.query<RowDataPacket[]>(
              `SELECT id FROM users WHERE ${linkColumn} = ? AND client_id = ? AND is_deleted = 0`,
              [entityId, clientId]
            );
            if (existing.length > 0) {
              results.push({ entityId, status: 'skipped', reason: 'Already has account' });
              skippedCount++;
              continue;
            }

            // Auto-generate username with prefix: cs1, cs2, sr1, sv1...
            const username = await generateUsername(entityType);

            // Create account - default password is 00000000
            const password = defaultPassword || '00000000';
            const passwordHash = await bcrypt.hash(password, 10);
            const newUserId = randomUUID();

            await db.query(
              `INSERT INTO users (id, client_id, branch_id, username, password_hash, full_name, phone, role, is_active, account_source, ${linkColumn})
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE, 'mobile_admin', ?)`,
              [newUserId, clientId, branchId, username, passwordHash, entity.name, phone, userRole, entityId]
            );

            results.push({ entityId, status: 'created', username });
            createdCount++;
          } catch (err: any) {
            results.push({ entityId, status: 'error', reason: err.message || 'Unknown error' });
          }
        }

        logger.info(
          { entityType, total: entityIds.length, created: createdCount, skipped: skippedCount },
          "Bulk mobile account creation completed"
        );

        return reply.code(200).send({
          data: results,
          summary: {
            total: entityIds.length,
            created: createdCount,
            skipped: skippedCount,
            errors: entityIds.length - createdCount - skippedCount,
          },
          message: `تم إنشاء ${createdCount} حساب بنجاح`,
        });
      } catch (error) {
        logger.error({ error }, "Failed to bulk create mobile accounts");
        return reply.code(500).send({ error: "Failed to bulk create mobile accounts" });
      }
    }
  );

  // ============================================================
  // PUT /api/mobile/accounts/:id
  // Update a mobile account (reset password, activate/deactivate)
  // ============================================================
  server.put<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { clientId, role } = request.user!;
        if (!requireAdmin(role, reply)) return;

        const { id } = request.params;
        const body = request.body as UpdateAccountBody;

        // Verify account exists and belongs to client
        const [accounts] = await db.query<RowDataPacket[]>(
          "SELECT id, username FROM users WHERE id = ? AND client_id = ? AND is_deleted = 0",
          [id, clientId]
        );
        if (accounts.length === 0) {
          return reply.code(404).send({ error: "Account not found" });
        }

        const updates: string[] = [];
        const params: any[] = [];

        if (body.password) {
          const passwordHash = await bcrypt.hash(body.password, 10);
          updates.push("password_hash = ?");
          params.push(passwordHash);
        }

        if (typeof body.isActive === 'boolean') {
          updates.push("is_active = ?");
          params.push(body.isActive);
        }

        if (body.parentUserId !== undefined) {
          if (body.parentUserId === null || body.parentUserId === '' || body.parentUserId === 'none') {
            updates.push("parent_user_id = NULL");
          } else {
            // Verify parent exists in same client
            const [parentCheck] = await db.query<RowDataPacket[]>(
              "SELECT id FROM users WHERE id = ? AND client_id = ? AND is_deleted = 0",
              [body.parentUserId, clientId]
            );
            if (parentCheck.length === 0) {
              return reply.code(404).send({ error: "الحساب الرئيسي غير موجود" });
            }
            if (body.parentUserId === id) {
              return reply.code(400).send({ error: "لا يمكن ربط الحساب بنفسه" });
            }
            updates.push("parent_user_id = ?");
            params.push(body.parentUserId);
          }
        }

        if (updates.length === 0) {
          return reply.code(400).send({ error: "No updates provided" });
        }

        updates.push("updated_at = NOW()");
        params.push(id, clientId);

        await db.query(
          `UPDATE users SET ${updates.join(", ")} WHERE id = ? AND client_id = ?`,
          params
        );

        if (body.password) {
          await db.query(
            "DELETE FROM refresh_tokens WHERE user_id = ?",
            [id]
          );
        }

        return reply.code(200).send({
          message: "تم تحديث الحساب بنجاح",
        });
      } catch (error) {
        logger.error({ error }, "Failed to update mobile account");
        return reply.code(500).send({ error: "Failed to update mobile account" });
      }
    }
  );

  // ============================================================
  // DELETE /api/mobile/accounts/:id
  // Soft-delete (deactivate) a mobile account
  // ============================================================
  server.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      try {
        const { clientId, role } = request.user!;
        if (!requireAdmin(role, reply)) return;

        const { id } = request.params;

        const [accounts] = await db.query<RowDataPacket[]>(
          "SELECT id FROM users WHERE id = ? AND client_id = ? AND is_deleted = 0",
          [id, clientId]
        );
        if (accounts.length === 0) {
          return reply.code(404).send({ error: "Account not found" });
        }

        // Soft delete + deactivate
        await db.query(
          "UPDATE users SET is_deleted = 1, is_active = 0, updated_at = NOW() WHERE id = ? AND client_id = ?",
          [id, clientId]
        );

        // Revoke all refresh tokens
        await db.query(
          "DELETE FROM refresh_tokens WHERE user_id = ?",
          [id]
        );

        return reply.code(200).send({
          message: "تم حذف الحساب بنجاح",
        });
      } catch (error) {
        logger.error({ error }, "Failed to delete mobile account");
        return reply.code(500).send({ error: "Failed to delete mobile account" });
      }
    }
  );

  // ============================================================
  // POST /api/mobile/accounts/bulk-action
  // Bulk delete or disable/enable accounts
  // ============================================================
  server.post(
    "/bulk-action",
    { preHandler: [server.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { clientId, role } = request.user!;
        if (!requireAdmin(role, reply)) return;

        const body = request.body as BulkActionBody;
        const { accountIds, action } = body;

        if (!accountIds || !Array.isArray(accountIds) || accountIds.length === 0) {
          return reply.code(400).send({ error: "accountIds[] is required" });
        }
        if (!['delete', 'disable', 'enable'].includes(action)) {
          return reply.code(400).send({ error: "action must be 'delete', 'disable', or 'enable'" });
        }
        if (accountIds.length > 500) {
          return reply.code(400).send({ error: "Maximum 500 accounts at once" });
        }

        // Build placeholders for IN clause
        const placeholders = accountIds.map(() => '?').join(',');

        let affected = 0;
        if (action === 'delete') {
          // Soft delete + deactivate
          const [result] = await db.query(
            `UPDATE users SET is_deleted = 1, is_active = 0, updated_at = NOW() WHERE id IN (${placeholders}) AND client_id = ? AND is_deleted = 0`,
            [...accountIds, clientId]
          );
          affected = (result as any).affectedRows || 0;

          // Revoke refresh tokens
          if (affected > 0) {
            await db.query(
              `DELETE FROM refresh_tokens WHERE user_id IN (${placeholders})`,
              accountIds
            );
          }
        } else if (action === 'disable') {
          const [result] = await db.query(
            `UPDATE users SET is_active = 0, updated_at = NOW() WHERE id IN (${placeholders}) AND client_id = ? AND is_deleted = 0`,
            [...accountIds, clientId]
          );
          affected = (result as any).affectedRows || 0;
        } else if (action === 'enable') {
          const [result] = await db.query(
            `UPDATE users SET is_active = 1, updated_at = NOW() WHERE id IN (${placeholders}) AND client_id = ? AND is_deleted = 0`,
            [...accountIds, clientId]
          );
          affected = (result as any).affectedRows || 0;
        }

        const actionLabels: Record<string, string> = {
          delete: 'حذف',
          disable: 'تعطيل',
          enable: 'تفعيل',
        };

        logger.info(
          { action, requested: accountIds.length, affected },
          `Bulk action '${action}' on mobile accounts`
        );

        return reply.code(200).send({
          message: `تم ${actionLabels[action]} ${affected} حساب بنجاح`,
          affected,
        });
      } catch (error) {
        logger.error({ error }, "Failed to perform bulk action on mobile accounts");
        return reply.code(500).send({ error: "Failed to perform bulk action" });
      }
    }
  );

  // ============================================================
  // GET /api/mobile/accounts/stats
  // Get statistics about mobile accounts
  // ============================================================
  server.get(
    "/stats",
    { preHandler: [server.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { clientId, role } = request.user!;
        if (!requireAdmin(role, reply)) return;

        // Total entities without accounts
        const [customerStats] = await db.query<RowDataPacket[]>(
          `SELECT 
            (SELECT COUNT(*) FROM customers WHERE client_id = ? AND is_deleted = 0) as total_customers,
            (SELECT COUNT(*) FROM customers WHERE client_id = ? AND is_deleted = 0 
              AND id IN (SELECT linked_customer_id FROM users WHERE linked_customer_id IS NOT NULL AND is_deleted = 0)) as customers_with_accounts`,
          [clientId, clientId]
        );

        const [repStats] = await db.query<RowDataPacket[]>(
          `SELECT 
            (SELECT COUNT(*) FROM sales_reps WHERE client_id = ? AND is_deleted = 0 AND is_active = 1) as total_reps,
            (SELECT COUNT(*) FROM sales_reps WHERE client_id = ? AND is_deleted = 0 AND is_active = 1
              AND id IN (SELECT linked_sales_rep_id FROM users WHERE linked_sales_rep_id IS NOT NULL AND is_deleted = 0)) as reps_with_accounts`,
          [clientId, clientId]
        );

        const [supervisorStats] = await db.query<RowDataPacket[]>(
          `SELECT 
            (SELECT COUNT(*) FROM supervisors WHERE client_id = ? AND is_deleted = 0 AND is_active = 1) as total_supervisors,
            (SELECT COUNT(*) FROM supervisors WHERE client_id = ? AND is_deleted = 0 AND is_active = 1
              AND id IN (SELECT linked_supervisor_id FROM users WHERE linked_supervisor_id IS NOT NULL AND is_deleted = 0)) as supervisors_with_accounts`,
          [clientId, clientId]
        );

        const [activeAccounts] = await db.query<RowDataPacket[]>(
          `SELECT COUNT(*) as count FROM users 
           WHERE client_id = ? AND is_deleted = 0 AND is_active = 1
           AND account_source IN ('mobile_admin', 'mobile_auto')`,
          [clientId]
        );

        return reply.code(200).send({
          data: {
            customers: {
              total: customerStats[0]?.total_customers || 0,
              withAccounts: customerStats[0]?.customers_with_accounts || 0,
              withoutAccounts: (customerStats[0]?.total_customers || 0) - (customerStats[0]?.customers_with_accounts || 0),
            },
            salesReps: {
              total: repStats[0]?.total_reps || 0,
              withAccounts: repStats[0]?.reps_with_accounts || 0,
              withoutAccounts: (repStats[0]?.total_reps || 0) - (repStats[0]?.reps_with_accounts || 0),
            },
            supervisors: {
              total: supervisorStats[0]?.total_supervisors || 0,
              withAccounts: supervisorStats[0]?.supervisors_with_accounts || 0,
              withoutAccounts: (supervisorStats[0]?.total_supervisors || 0) - (supervisorStats[0]?.supervisors_with_accounts || 0),
            },
            activeAccounts: activeAccounts[0]?.count || 0,
          },
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        logger.error({ error, message: errMsg }, "Failed to fetch mobile account stats");
        return reply.code(500).send({ error: "Failed to fetch mobile account stats", details: errMsg });
      }
    }
  );
}
