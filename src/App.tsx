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
  // تنظيف عام عند تحميل التطبيق
  useEffect(() => {
    const globalCleanup = () => {
      const allOverlays = document.querySelectorAll(
        "[data-radix-dialog-overlay], [data-radix-popover-content], [data-radix-select-content]"
      );
      allOverlays.forEach((el) => {
        const state = el.getAttribute("data-state");
        if (state === "closed" || !state) {
          el.remove();
        }
      });

      if (document.body.style.pointerEvents === "none") {
        document.body.style.removeProperty("pointer-events");
      }
    };

    globalCleanup();
    const intervalId = setInterval(globalCleanup, 5000);

    return () => clearInterval(intervalId);
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
