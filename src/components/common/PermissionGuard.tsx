import React, { ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  hasPermission,
  hasAnyPermission,
  Permission,
  Role,
} from "@/lib/permissions";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface PermissionGuardProps {
  children: ReactNode;
  permission?: Permission;
  permissions?: Permission[];
  requireAll?: boolean; // إذا كان true، يتطلب جميع الصلاحيات. إذا كان false، يكفي صلاحية واحدة
  fallback?: ReactNode;
  showAlert?: boolean; // إذا كان true، يعرض رسالة تنبيه بدلاً من إخفاء المحتوى
}

export function PermissionGuard({
  children,
  permission,
  permissions,
  requireAll = false,
  fallback = null,
  showAlert = false,
}: PermissionGuardProps) {
  const { user } = useAuth();

  if (!user) {
    if (showAlert) {
      return (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>غير مصرح</AlertTitle>
          <AlertDescription>
            يجب تسجيل الدخول للوصول إلى هذه الميزة
          </AlertDescription>
        </Alert>
      );
    }
    return <>{fallback}</>;
  }

  const userRole = user.role as Role;
  let hasAccess = false;

  if (permission) {
    // التحقق من صلاحية واحدة
    hasAccess = hasPermission(userRole, permission);
  } else if (permissions && permissions.length > 0) {
    // التحقق من مجموعة صلاحيات
    if (requireAll) {
      // يتطلب جميع الصلاحيات
      hasAccess = permissions.every((p) => hasPermission(userRole, p));
    } else {
      // يكفي صلاحية واحدة
      hasAccess = hasAnyPermission(userRole, permissions);
    }
  } else {
    // إذا لم يتم تحديد أي صلاحيات، السماح بالوصول
    hasAccess = true;
  }

  if (!hasAccess) {
    if (showAlert) {
      return (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>غير مصرح</AlertTitle>
          <AlertDescription>
            ليس لديك الصلاحية للوصول إلى هذه الميزة
          </AlertDescription>
        </Alert>
      );
    }
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

// Hook للتحقق من الصلاحيات
export function usePermission() {
  const { user } = useAuth();

  const checkPermission = (permission: Permission): boolean => {
    if (!user) return false;
    return hasPermission(user.role as Role, permission);
  };

  const checkAnyPermission = (permissions: Permission[]): boolean => {
    if (!user) return false;
    return hasAnyPermission(user.role as Role, permissions);
  };

  const checkAllPermissions = (permissions: Permission[]): boolean => {
    if (!user) return false;
    return permissions.every((p) => hasPermission(user.role as Role, p));
  };

  return {
    can: checkPermission,
    canAny: checkAnyPermission,
    canAll: checkAllPermissions,
    userRole: user?.role as Role | undefined,
  };
}
