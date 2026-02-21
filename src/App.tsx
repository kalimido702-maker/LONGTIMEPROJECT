import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { SettingsProvider } from "@/contexts/SettingsContext";

import { ThemeProvider } from "@/contexts/ThemeContext";
import { AppProvider } from "@/contexts/AppContext";
import LicenseGuard from "@/components/license/LicenseGuard";
import TabLayout from "@/components/TabLayout";
import { useWhatsAppBot } from "@/services/whatsapp/whatsappBotListener";

// Auth Pages
import Login from "./pages/auth/Login";
import LicenseActivation from "./pages/settings/LicenseActivation";

const queryClient = new QueryClient();

// مكون حماية المسارات
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-lg">جاري التحميل...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

// Main app content with tabs
const AppContent = () => {
  // تشغيل بوت الواتساب
  useWhatsAppBot();
  
  // تنظيف عام عند تحميل التطبيق - لمنع تجميد الواجهة
  useEffect(() => {
    const globalCleanup = () => {
      // إزالة الأوفرلايز المغلقة أو اليتيمة
      const allOverlays = document.querySelectorAll(
        "[data-radix-dialog-overlay], [data-radix-popover-content], [data-radix-select-content]"
      );
      allOverlays.forEach((el) => {
        const state = el.getAttribute("data-state");
        if (state === "closed" || !state) {
          el.remove();
        }
      });

      // إصلاح pointer-events المعلق على body
      if (document.body.style.pointerEvents === "none") {
        document.body.style.removeProperty("pointer-events");
      }

      // إزالة scroll lock المعلق من Radix
      if (document.body.hasAttribute("data-scroll-locked")) {
        document.body.removeAttribute("data-scroll-locked");
        document.body.style.removeProperty("overflow");
        document.body.style.removeProperty("padding-right");
        document.body.style.removeProperty("margin-right");
        document.body.style.removeProperty("--removed-body-scroll-bar-size");
      }

      // التأكد من أن body ليس عليها أي إعاقة
      const computedStyle = window.getComputedStyle(document.body);
      if (computedStyle.pointerEvents === "none") {
        document.body.style.pointerEvents = "auto";
      }
    };

    // تنظيف فوري + كل 3 ثوان (تقليل التكرار لتحسين الأداء)
    globalCleanup();
    const intervalId = setInterval(globalCleanup, 3000);

    // MutationObserver لاكتشاف التغييرات على body فوراً
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes" && mutation.target === document.body) {
          const attr = mutation.attributeName;
          if (attr === "style" || attr === "data-scroll-locked") {
            // تنظيف فوري ثم بعد تأخير قصير
            globalCleanup();
            setTimeout(globalCleanup, 100);
            setTimeout(globalCleanup, 500);
          }
        }
      }
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["style", "data-scroll-locked"],
    });

    return () => {
      clearInterval(intervalId);
      observer.disconnect();
    };
  }, []);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/license"
        element={
          <ProtectedRoute>
            <LicenseActivation />
          </ProtectedRoute>
        }
      />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <TabLayout />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
};

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <HashRouter>
          <LicenseGuard>
            <AppProvider>
              <ThemeProvider>
                <AuthProvider>
                  <SettingsProvider>
                    <AppContent />
                  </SettingsProvider>
                </AuthProvider>
              </ThemeProvider>
            </AppProvider>
          </LicenseGuard>
        </HashRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
