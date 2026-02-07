import React, { useState, useEffect, ReactNode } from "react";
import { Loader2, Shield, AlertTriangle } from "lucide-react";
import LicenseActivation from "@/pages/settings/LicenseActivation";

interface LicenseGuardProps {
  children: ReactNode;
}

/**
 * مكون حماية الترخيص
 * يتحقق من صلاحية الترخيص قبل السماح بالوصول للتطبيق
 */
const LicenseGuard: React.FC<LicenseGuardProps> = ({ children }) => {
  const [status, setStatus] = useState<"loading" | "valid" | "invalid">(
    "loading"
  );
  const [errorMessage, setErrorMessage] = useState<string>("");

  // Check if running in Electron
  const isElectron =
    typeof window !== "undefined" && window.electronAPI?.license;

  useEffect(() => {
    checkLicense();
  }, []);

  const checkLicense = async () => {
    setStatus("loading");

    try {
      if (isElectron) {
        const result = await window.electronAPI.license.verify();

        if (result.valid) {
          setStatus("valid");
        } else {
          setStatus("invalid");
          setErrorMessage(result.message);
        }
      } else {
        // في وضع التطوير (المتصفح)، نسمح بالوصول
        console.log("🔓 Development mode: License check skipped");
        setStatus("valid");
      }
    } catch (error: any) {
      console.error("License check error:", error);

      // ⚠️ مهم: في حالة حدوث خطأ (مثل عدم وجود انترنت)
      // نحاول التحقق من وجود ترخيص محلي
      if (isElectron) {
        try {
          // محاولة الحصول على بيانات الترخيص المحلية
          const syncData = await window.electronAPI.license.getSyncCredentials();
          if (syncData?.success && syncData?.syncToken) {
            // يوجد ترخيص محلي صالح - نسمح بالعمل offline
            console.log("✅ Found valid local license, allowing offline operation");
            setStatus("valid");
            return;
          }
        } catch (e) {
          console.warn("Failed to check local license:", e);
        }
      }

      // لا يوجد ترخيص محلي
      setStatus("invalid");
      setErrorMessage("حدث خطأ أثناء التحقق من الترخيص. تأكد من الاتصال بالإنترنت.");
    }
  };

  // Loading state
  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-6">
            <Shield className="h-10 w-10 text-primary animate-pulse" />
          </div>
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-4" />
          <p className="text-lg text-muted-foreground">
            جاري التحقق من الترخيص...
          </p>
        </div>
      </div>
    );
  }

  // Invalid license - show activation page
  if (status === "invalid") {
    return <LicenseActivation />;
  }

  // Valid license - render children
  return <>{children}</>;
};

export default LicenseGuard;
