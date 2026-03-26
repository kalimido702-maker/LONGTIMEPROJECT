import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { db, User, Role } from "@/shared/lib/indexedDB";

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  isLoading: boolean;
  can: (resource: string, action: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<Role | null>(null);

  useEffect(() => {
    const initAuth = async () => {
      await db.init();
      await db.initDefaultData();
      await db.initializeDefaultRoles(); // تهيئة الأدوار الافتراضية
      await db.migrateRolesPermissions(); // تحديث الصلاحيات للأدوار الموجودة
      await db.migrateToV12(); // Migration للبيانات القديمة

      // محاولة sync المستخدمين والأدوار من الباك إند
      await syncUsersAndRolesFromBackend();

      // التحقق من وجود مستخدم مسجل مسبقاً
      const savedUserId = localStorage.getItem("currentUserId");
      if (savedUserId) {
        const userData = await db.get<User>("users", savedUserId);
        if (userData && userData.active) {
          setUser(userData);
          // جلب صلاحيات الدور من قاعدة البيانات
          await loadUserRole(userData);
        } else {
          localStorage.removeItem("currentUserId");
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  // Sync users and roles from backend (if online)
  const syncUsersAndRolesFromBackend = async () => {
    try {
      const { getFastifyClient } = await import("@/infrastructure/http");
      const httpClient = getFastifyClient();

      // Try to fetch users from backend
      const usersResponse = await httpClient.get<any[]>("/api/admin/clients/users").catch(() => null);
      if (usersResponse && Array.isArray(usersResponse)) {
        for (const backendUser of usersResponse) {
          const localUser = await db.get<User>("users", backendUser.id);
          if (!localUser) {
            await db.add("users", {
              ...backendUser,
              password: "", // لا نخزن كلمة السر محلياً
            });
          } else {
            // تحديث بيانات المستخدم (بدون كلمة السر)
            await db.update("users", {
              ...localUser,
              ...backendUser,
              password: localUser.password, // نحتفظ بكلمة السر المحلية
            });
          }
        }
        console.log("[AuthContext] ✅ Users synced from backend:", usersResponse.length);
      }

      // Try to fetch roles from backend
      const rolesResponse = await httpClient.get<any[]>("/api/admin/clients/roles").catch(() => null);
      if (rolesResponse && Array.isArray(rolesResponse)) {
        for (const backendRole of rolesResponse) {
          const localRole = await db.get<Role>("roles", backendRole.id);
          if (!localRole) {
            await db.add("roles", backendRole);
          } else {
            // تحديث الدور بالصلاحيات الجديدة
            await db.update("roles", {
              ...localRole,
              ...backendRole,
            });
          }
        }
        console.log("[AuthContext] ✅ Roles synced from backend:", rolesResponse.length);
      }
    } catch (error) {
      // الـ Sync فشل - نستخدم البيانات المحلية
      console.warn("[AuthContext] Failed to sync users/roles (using local data):", error);
    }
  };

  const loadUserRole = async (user: User) => {
    try {
      // Prioritize roleId, fallback to role for backwards compatibility
      const roleIdToLoad = user.roleId || user.role;
      console.log(
        `[AuthContext] Loading role for user "${user.username}": ${roleIdToLoad}`
      );

      const role = await db.get<Role>("roles", roleIdToLoad);

      if (role) {
        console.log(
          `[AuthContext] Role loaded successfully:`,
          role.name,
          `(${role.id})`
        );
        console.log(`[AuthContext] Permissions:`, role.permissions);
        setUserRole(role);
      } else {
        console.error(`[AuthContext] Role not found for ID: ${roleIdToLoad}`);
        console.error(`[AuthContext] User object:`, user);
        setUserRole(null);
      }
    } catch (error) {
      console.error("[AuthContext] Error loading role:", error);
      setUserRole(null);
    }
  };

  // Hash password using SHA-256 for local storage
  const hashPassword = async (password: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + "_HPOS_SALT_2024");
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  const login = async (
    username: string,
    password: string
  ): Promise<boolean> => {
    try {
      // First try Backend API authentication
      try {
        const { getFastifyClient } = await import("@/infrastructure/http");
        const { getWebSocketClient } = await import("@/infrastructure/http");
        const httpClient = getFastifyClient();

        // Call backend login API
        const response = await httpClient.post<{
          accessToken: string;
          refreshToken: string;
          expiresIn: string;
          user: any;
        }>("/api/auth/login", {
          username, // Backend expects username field
          password,
        });

        if (response) {
          const { accessToken, refreshToken, user: backendUser } = response;

          // Store JWT tokens in FastifyClient
          httpClient.setAuth({ accessToken, refreshToken });

          // Set auth for WebSocket
          const wsClient = getWebSocketClient();
          if (wsClient && !wsClient.isConnected()) {
            wsClient.connect();
          }

          // Hash password for local fallback auth
          const passwordHash = await hashPassword(password);

          // Get or create local user record
          const users = await db.getAll<User>("users");
          let localUser = users.find((u) => u.username === username);

          if (!localUser) {
            // Create local user from backend data
            localUser = {
              id: backendUser.id || username,
              username: backendUser.username || username,
              name: backendUser.name || username,
              password: passwordHash, // Store hashed password for offline fallback
              role: backendUser.role || "cashier",
              roleId: backendUser.roleId || "cashier",
              active: true,
              createdAt: new Date().toISOString(),
            };
            await db.add("users", localUser);
          } else {
            // Update existing user with fresh password hash and backend data
            localUser = {
              ...localUser,
              password: passwordHash,
              name: backendUser.name || localUser.name,
              role: backendUser.role || localUser.role,
              roleId: backendUser.roleId || localUser.roleId,
              active: true,
            };
            await db.update("users", localUser);
          }

          setUser(localUser);
          localStorage.setItem("currentUserId", localUser.id);
          await loadUserRole(localUser);

          console.log("✅ Backend authentication successful");
          return true;
        }
      } catch (backendError: any) {
        console.warn(
          "Backend authentication failed, falling back to local:",
          backendError?.message || backendError
        );

        // Fallback to local authentication using stored password hash
        const users = await db.getAll<User>("users");
        const passwordHash = await hashPassword(password);
        const foundUser = users.find(
          (u) =>
            u.username === username &&
            u.active &&
            (u.password === passwordHash || u.password === password)
        );

        if (foundUser) {
          // Update password to hash format if it was plaintext
          if (foundUser.password === password && foundUser.password !== passwordHash) {
            foundUser.password = passwordHash;
            await db.update("users", foundUser);
          }

          setUser(foundUser);
          localStorage.setItem("currentUserId", foundUser.id);
          await loadUserRole(foundUser);
          console.log("✅ Local authentication successful (offline mode)");
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error("Login error:", error);
      return false;
    }
  };

  const logout = async () => {
    try {
      // Try to logout from backend
      const { getFastifyClient } = await import("@/infrastructure/http");
      const { getWebSocketClient } = await import("@/infrastructure/http");
      const httpClient = getFastifyClient();

      try {
        await httpClient.logout();
      } catch (error) {
        console.warn("Backend logout failed:", error);
      }

      // Disconnect WebSocket
      const wsClient = getWebSocketClient();
      if (wsClient) {
        wsClient.disconnect();
      }

      // Clear local auth
      httpClient.clearAuth();
    } catch (error) {
      console.warn("Error during logout:", error);
    }

    // Clear local state
    setUser(null);
    setUserRole(null);
    localStorage.removeItem("currentUserId");
  };

  const can = (resource: string, action: string): boolean => {
    if (!user || !userRole) return false;

    // جلب صلاحيات المورد من الدور
    const resourcePermissions = userRole.permissions[resource];
    if (!resourcePermissions) return false;

    return resourcePermissions.includes(action);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading, can }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
