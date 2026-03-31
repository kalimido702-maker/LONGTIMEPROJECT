import { createRoot } from "react-dom/client";
import { useState, useEffect, lazy, Suspense } from "react";
import App from "./App.tsx";
import "./index.css";
import { db } from "./shared/lib/indexedDB";
import { SyncProvider } from "./components/sync";
import { getLoggingService } from "./infrastructure/logging";

// Lazy-load LogViewer for error screen shortcut
const LogViewer = lazy(() => import("@/pages/admin/LogViewer"));

/**
 * DatabaseErrorScreen - شاشة خطأ قاعدة البيانات مع دعم Ctrl+Shift+L
 */
function DatabaseErrorScreen({ error }: { error: unknown }) {
  const [showLogViewer, setShowLogViewer] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isModifier = e.ctrlKey || e.metaKey;
      if (isModifier && e.shiftKey && (e.key === 'L' || e.key === 'l' || e.code === 'KeyL')) {
        e.preventDefault();
        e.stopPropagation();
        setShowLogViewer((prev) => !prev);
      }
      if (e.key === 'Escape' && showLogViewer) {
        setShowLogViewer(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [showLogViewer]);

  if (showLogViewer) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#fff' }}>
        <button
          onClick={() => setShowLogViewer(false)}
          style={{ position: 'absolute', top: 8, left: 8, zIndex: 10, padding: '4px 12px', cursor: 'pointer' }}
        >
          ✕ إغلاق (Esc)
        </button>
        <Suspense
          fallback={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
              جاري التحميل...
            </div>
          }
        >
          <LogViewer />
        </Suspense>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', direction: 'rtl' }}>
      <div style={{ textAlign: 'center', padding: 20 }}>
        <h1 style={{ color: 'red' }}>⚠️ خطأ في تهيئة قاعدة البيانات</h1>
        <p>فشل في تحميل قاعدة البيانات المحلية</p>
        <p style={{ color: 'gray', fontSize: 12 }}>{String(error)}</p>
        <button onClick={() => location.reload()} style={{ marginTop: 20, padding: '10px 20px', cursor: 'pointer' }}>
          إعادة المحاولة
        </button>
        <p style={{ marginTop: 16, color: '#888', fontSize: 11 }}>
          اضغط Ctrl+Shift+L لفتح سجلات النظام
        </p>
      </div>
    </div>
  );
}

// إصلاح مشكلة تجمد الـ inputs بعد استخدام confirm() في Electron على Windows
// الـ native dialog بيسرق الـ focus من الـ BrowserWindow ومش بيرجعه
const originalConfirm = window.confirm;
window.confirm = function (message?: string): boolean {
  const result = originalConfirm.call(window, message);
  // إعادة الـ focus للنافذة بعد إغلاق الـ dialog
  setTimeout(() => {
    window.focus();
    const activeEl = document.activeElement as HTMLElement | null;
    if (activeEl) {
      activeEl.blur();
      activeEl.focus();
    }
  }, 100);
  return result;
};

// تهيئة نظام التسجيل (Logging) أولاً - قبل أي شيء آخر
const logger = getLoggingService();
logger.init().then(() => {
  console.log("✅ Logging service initialized");
}).catch((err) => {
  // Use original console since interception might not be set up yet
  logger.getOriginalConsole().error("❌ Failed to init logging:", err);
});

// تهيئة قاعدة البيانات قبل بدء التطبيق
db.init()
  .then(() => {
    console.log("✅ Database initialized successfully");
    // بدء التطبيق مع SyncProvider للربط مع الباك إند
    createRoot(document.getElementById("root")!).render(
      <SyncProvider>
        <App />
      </SyncProvider>
    );
  })
  .catch((error) => {
    console.error("❌ Failed to initialize database:", error);
    // عرض شاشة الخطأ مع دعم Ctrl+Shift+L لفتح السجلات
    createRoot(document.getElementById("root")!).render(
      <DatabaseErrorScreen error={error} />
    );
  });
