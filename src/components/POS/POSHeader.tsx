import {
  ShoppingCart,
  Users,
  FileText,
  LogOut,
  User,
  Menu,
  Shield,
  FolderOpen,
  MessageSquare,
  Send,
  Ruler,
  DollarSign,
  CreditCard,
  TrendingUp,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSettingsContext } from "@/contexts/SettingsContext";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/shared/lib/indexedDB";
import { useToast } from "@/hooks/use-toast";
import { InvoiceWhatsAppDialog } from "@/components/dialogs/InvoiceWhatsAppDialog";
import { StatementWhatsAppDialog } from "@/components/dialogs/StatementWhatsAppDialog";
import { SyncActionsButton } from "@/components/sync/SyncActionsButton";

export const POSHeader = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, can } = useAuth();
  const { getSetting } = useSettingsContext();
  const { toast } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dailySummaryDialogOpen, setDailySummaryDialogOpen] = useState(false);
  const [dailySummary, setDailySummary] = useState<any>(null);
  const [invoiceWhatsAppOpen, setInvoiceWhatsAppOpen] = useState(false);
  const [statementWhatsAppOpen, setStatementWhatsAppOpen] = useState(false);
  // المميزات المفعلة من الباقة (null = كل المميزات متاحة)
  const [enabledFeatures, setEnabledFeatures] = useState<string[] | null>(null);
  const featuresLoadedRef = useRef(false);

  const storeName = getSetting("storeName") || "نظام نقاط البيع";

  // mapping من المسار للميزة
  const pathToFeature: Record<string, string> = {
    "/": "pos",
    "/customers": "customers",
    "/invoices": "invoices",
    "/quotes": "invoices",
    "/reports": "reports",
    "/inventory": "inventory",
    "/product-categories": "categories",
    "/suppliers": "suppliers",
    "/purchases": "purchases",
    "/employees": "employees",
    "/employee-advances": "employee_advances",
    "/employee-deductions": "employee_deductions",
    "/promotions": "promotions",
    "/installments": "installments",
    "/credit": "credit",
    "/deposit-sources": "deposit_sources",
    "/deposits": "deposits",
    "/expense-categories": "expense_categories",
    "/expenses": "expenses",
    "/sales-returns": "sales_returns",
    "/purchase-returns": "purchase_returns",
    "/restaurant": "restaurant",
    "/whatsapp-management": "whatsapp",
    "/whatsapp-campaigns": "whatsapp_campaigns",
    "/settings": "settings",
    "/roles-permissions": "roles_permissions",
    "/units": "settings", // الوحدات جزء من الإعدادات
    "/price-types": "settings", // أنواع الأسعار جزء من الإعدادات
    "/payment-methods": "settings", // طرق الدفع جزء من الإعدادات
  };

  // التحقق من أن الميزة مفعلة لهذا المسار
  const isFeatureEnabled = (path: string): boolean => {
    // إذا enabledFeatures = null فكل المميزات متاحة (backward compatibility)
    if (enabledFeatures === null) return true;
    if (enabledFeatures.length === 0) return true;

    const featureId = pathToFeature[path];
    if (!featureId) return true; // مسار مش معروف = متاح

    return enabledFeatures.includes(featureId);
  };

  // تحميل المميزات المفعلة من localStorage
  useEffect(() => {
    if (featuresLoadedRef.current) return;
    featuresLoadedRef.current = true;

    const loadFeatures = async () => {
      console.log('[POSHeader] Loading package features...');

      // محاولة الحصول على المميزات من Electron API
      if ((window as any).electronAPI?.license?.getSyncCredentials) {
        try {
          const result = await (window as any).electronAPI.license.getSyncCredentials();
          console.log('[POSHeader] getSyncCredentials result:', result);

          if (result?.success && result?.features) {
            console.log('[POSHeader] ✅ Features from license:', result.features);
            setEnabledFeatures(result.features);
            localStorage.setItem('packageFeatures', JSON.stringify(result.features));
          } else if (result?.success && !result?.features) {
            console.log('[POSHeader] ⚠️ No features in license response - all features enabled');
            // جرب قراءة من localStorage
            const stored = localStorage.getItem('packageFeatures');
            if (stored) {
              console.log('[POSHeader] Using localStorage features:', stored);
              setEnabledFeatures(JSON.parse(stored));
            }
          } else {
            console.log('[POSHeader] License check failed:', result?.message);
          }
        } catch (e) {
          console.warn('[POSHeader] Failed to load features:', e);
        }
      } else {
        console.log('[POSHeader] Not in Electron, checking localStorage...');
        // في الويب اقرأ من localStorage
        const stored = localStorage.getItem('packageFeatures');
        if (stored) {
          try {
            console.log('[POSHeader] Features from localStorage:', stored);
            setEnabledFeatures(JSON.parse(stored));
          } catch (e) {
            console.warn('[POSHeader] Invalid features in localStorage');
          }
        }
      }
    };

    loadFeatures();
  }, []);



  const handleLogout = () => {
    // تسجيل الخروج مباشرة بدون متطلب وردية
    logout();
    navigate("/login");
  };

  const loadDailySummary = async () => {
    try {
      // استخدام الدالة الموحدة من calculationService
      const { calculateDailySummary } = await import(
        "@/lib/calculationService"
      );

      const summary = await calculateDailySummary();

      setDailySummary(summary);
      setDailySummaryDialogOpen(true);
    } catch (error) {
      console.error("Error loading daily summary:", error);
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء تحميل الملخص اليومي",
        variant: "destructive",
      });
    }
  };

  const menuItems = [
    {
      title: "الصفحات الرئيسية",
      items: [
        {
          name: "نقطة البيع",
          icon: ShoppingCart,
          path: "/",
          check: () => can("invoices", "create") || can("invoices", "view"),
        },
        {
          name: "العملاء",
          icon: Users,
          path: "/customers",
          check: () => can("customers", "view"),
        },
        {
          name: "سجل الفواتير",
          icon: FileText,
          path: "/invoices",
          check: () => can("invoices", "view"),
        },
        {
          name: "سجل عروض الأسعار",
          icon: FileText,
          path: "/quotes",
          check: () => can("invoices", "view"),
        },
        {
          name: "التقارير",
          icon: FileText,
          path: "/reports",
          check: () => can("reports", "view"),
        },
      ],
    },
    {
      title: "الإدارة",
      items: [
        {
          name: "المخزون",
          icon: ShoppingCart,
          path: "/inventory",
          check: () => can("products", "view"),
        },
        {
          name: "أقسام المنتجات",
          icon: FolderOpen,
          path: "/product-categories",
          check: () => can("products", "view"),
        },
        {
          name: "الموردين",
          icon: Users,
          path: "/suppliers",
          check: () => can("suppliers", "view"),
        },
        {
          name: "المشتريات",
          icon: ShoppingCart,
          path: "/purchases",
          check: () => can("purchases", "view"),
        },
        {
          name: "الموظفين",
          icon: Users,
          path: "/employees",
          check: () => can("employees", "view"),
        },
        {
          name: "المشرفين",
          icon: Users,
          path: "/supervisors",
          check: () => can("employees", "view"),
        },
        {
          name: "المندوبين",
          icon: Users,
          path: "/sales-reps",
          check: () => can("employees", "view"),
        },
        {
          name: "سُلف الموظفين",
          icon: FileText,
          path: "/employee-advances",
          check: () => can("employeeAdvances", "view"),
        },
        {
          name: "خصومات الموظفين",
          icon: FileText,
          path: "/employee-deductions",
          check: () => can("employeeAdvances", "view"), // using same permission
        },
        {
          name: "العروض والخصومات",
          icon: FileText,
          path: "/promotions",
          check: () => can("promotions", "view"),
        },
        {
          name: "إدارة التقسيط",
          icon: FileText,
          path: "/installments",
          check: () => can("installments", "view"),
        },
        {
          name: "إدارة الآجل",
          icon: FileText,
          path: "/credit",
          check: () => can("credit", "view"),
        },
      ],
    },
    {
      title: "المالية",
      items: [
        {
          name: "القبض السريع",
          icon: FileText,
          path: "/collections",
          check: () => can("collections", "view"),
        },
        {
          name: "البونص",
          icon: FileText,
          path: "/bonus",
          check: () => can("collections", "view"),
        },
        {
          name: "بونص المشرفين",
          icon: FileText,
          path: "/supervisor-bonus",
          check: () => can("collections", "view"),
        },
        {
          name: "مصادر الإيداعات",
          icon: FileText,
          path: "/deposit-sources",
          check: () => can("depositSources", "view"),
        },
        {
          name: "الإيداعات",
          icon: FileText,
          path: "/deposits",
          check: () => can("deposits", "view"),
        },
        {
          name: "فئات المصروفات",
          icon: FileText,
          path: "/expense-categories",
          check: () => can("expenseCategories", "view"),
        },
        {
          name: "المصروفات",
          icon: FileText,
          path: "/expenses",
          check: () => can("expenses", "view"),
        },
      ],
    },
    {
      title: "المرتجعات",
      items: [
        {
          name: "مرتجع المبيعات",
          icon: FileText,
          path: "/sales-returns",
          check: () => can("returns", "view"),
        },
        {
          name: "مرتجع المشتريات",
          icon: FileText,
          path: "/purchase-returns",
          check: () => can("returns", "view"),
        },
      ],
    },
    {
      title: "المطاعم",
      items: [
        {
          name: "الصالات والطاولات",
          icon: ShoppingCart,
          path: "/restaurant",
          check: () => can("restaurant", "view"),
        },
      ],
    },
    {
      title: "الواتساب",
      items: [
        {
          name: "إدارة الحسابات",
          icon: MessageSquare,
          path: "/whatsapp-management",
          check: () => can("settings", "view"), // WhatsApp management requires settings permission
        },
        {
          name: "الحملات التسويقية",
          icon: Send,
          path: "/whatsapp-campaigns",
          check: () => can("settings", "view"),
        },
      ],
    },
    {
      title: "الإعدادات الأساسية",
      items: [
        {
          name: "وحدات القياس",
          icon: Ruler,
          path: "/units",
          check: () => can("settings", "view"),
        },
        {
          name: "أنواع التسعير",
          icon: DollarSign,
          path: "/price-types",
          check: () => can("settings", "view"),
        },
        {
          name: "طرق الدفع",
          icon: CreditCard,
          path: "/payment-methods",
          check: () => can("settings", "view"),
        },
        // {
        //   name: "إعدادات الطابعة",
        //   icon: Printer,
        //   path: "/printer-settings",
        //   check: () => can("settings", "view"),
        // },
      ],
    },
    {
      title: "النظام",
      items: [
        {
          name: "الإعدادات",
          icon: ShoppingCart,
          path: "/settings",
          check: () => can("settings", "view"),
        },
        {
          name: "الأدوار والصلاحيات",
          icon: Shield,
          path: "/roles-permissions",
          check: () => can("settings", "edit"), // Only admins should manage roles
        },
      ],
    },
  ];

  return (
    <header className="bg-gradient-primary text-primary-foreground shadow-primary sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm">
            <ShoppingCart className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{storeName}</h1>
            <p className="text-sm text-primary-foreground/80">
              إدارة متكاملة للمبيعات والمخزون
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Cart Button - للانتقال السريع لصفحة POS */}
          {location.pathname !== "/" && (
            <Button
              variant="default"
              onClick={() => navigate("/")}
              className="gap-2 bg-white/20 hover:bg-white/30 text-white backdrop-blur-sm border border-white/30"
              title="الذهاب إلى نقطة البيع"
            >
              <ShoppingCart className="h-4 w-4" />
              <span className="hidden md:inline">السلة</span>
            </Button>
          )}

          {/* Daily Summary Button */}
          <Button
            variant="default"
            onClick={loadDailySummary}
            className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <TrendingUp className="h-4 w-4" />
            ملخص اليوم
          </Button>

          {/* WhatsApp Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="default"
                className="gap-2 bg-green-600 hover:bg-green-700 text-white"
              >
                <MessageSquare className="h-4 w-4" />
                واتساب
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <div dir="rtl">
                <DropdownMenuLabel>إرسال واتساب</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setInvoiceWhatsAppOpen(true)}>
                  <FileText className="ml-2 h-4 w-4" />
                  <span>إرسال فواتير</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setStatementWhatsAppOpen(true)}>
                  <Send className="ml-2 h-4 w-4" />
                  <span>إرسال كشف حساب</span>
                </DropdownMenuItem>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Sync Actions Button */}
          <SyncActionsButton />

          {/* Shift Button - تم إزالة متطلب الوردية */}
          {/* أزرار الوردية محذوفة */}

          {/* <Button
            variant="ghost"
            onClick={() => setMenuOpen(true)}
            className="gap-2 text-primary-foreground hover:text-primary-foreground"
          >
            <Menu className="h-5 w-5" />
            القائمة
          </Button> */}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="gap-2 text-primary-foreground hover:text-primary-foreground"
              >
                <User className="h-4 w-4" />
                {user?.name}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <div dir="rtl">
                <DropdownMenuLabel>الحساب</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <User className="ml-2 h-4 w-4" />
                  <span>
                    الدور:{" "}
                    {user?.role === "admin"
                      ? "مدير النظام"
                      : user?.role === "manager"
                        ? "مدير"
                        : user?.role === "cashier"
                          ? "كاشير"
                          : "محاسب"}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="text-destructive"
                >
                  <LogOut className="ml-2 h-4 w-4" />
                  <span>تسجيل الخروج</span>
                </DropdownMenuItem>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent
          className="max-w-2xl max-h-[80vh] overflow-y-auto"
          dir="rtl"
        >
          <DialogHeader>
            <DialogTitle className="text-2xl">القائمة الرئيسية</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {menuItems.map((section, idx) => {
              // Filter items based on permissions AND package features
              const visibleItems = section.items.filter(
                (item) => (!item.check || item.check()) && isFeatureEnabled(item.path)
              );

              // Don't show section if no items are visible
              if (visibleItems.length === 0) return null;

              return (
                <div key={idx}>
                  <h3 className="text-lg font-semibold mb-3 text-primary">
                    {section.title}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {visibleItems.map((item, itemIdx) => (
                      <Card
                        key={itemIdx}
                        className="p-4 cursor-pointer hover:shadow-lg transition-all hover:border-primary"
                        onClick={() => {
                          navigate(item.path);
                          setMenuOpen(false);
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="bg-primary/10 p-3 rounded-lg">
                            <item.icon className="h-6 w-6 text-primary" />
                          </div>
                          <span className="font-semibold">{item.name}</span>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>



      {/* Daily Summary Dialog */}
      <Dialog
        open={dailySummaryDialogOpen}
        onOpenChange={setDailySummaryDialogOpen}
      >
        <DialogContent dir="rtl" className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-6 w-6 text-blue-600" />
              ملخص المبيعات اليومية
            </DialogTitle>
          </DialogHeader>

          {dailySummary && (
            <div className="space-y-4 py-4">
              {/* Date */}
              <div className="text-center bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-600 font-semibold">
                  📅{" "}
                  {new Date().toLocaleDateString("ar-EG", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </div>

              {/* Sales Summary */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h3 className="font-semibold mb-3 text-green-900 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  💰 ملخص المبيعات
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white p-3 rounded-lg">
                    <p className="text-xs text-muted-foreground">
                      عدد الفواتير
                    </p>
                    <p className="text-2xl font-bold text-green-600">
                      {dailySummary.invoiceCount}
                    </p>
                  </div>
                  <div className="bg-white p-3 rounded-lg">
                    <p className="text-xs text-muted-foreground">
                      إجمالي المبيعات
                    </p>
                    <p className="text-2xl font-bold text-green-600">
                      {Number(dailySummary.totalSales || 0).toFixed(2)} جنيه
                    </p>
                  </div>
                </div>
              </div>

              {/* Payment Methods Breakdown */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold mb-3 text-blue-900">
                  💳 طرق الدفع
                </h3>
                <div className="space-y-2">
                  {dailySummary.paymentMethodSales &&
                    Object.entries(dailySummary.paymentMethodSales).map(
                      ([methodId, data]: [string, any]) =>
                        data.amount > 0 && (
                          <div
                            key={methodId}
                            className="flex justify-between items-center bg-white p-2 rounded"
                          >
                            <span className="text-sm">{data.name}</span>
                            <strong>{Number(data.amount || 0).toFixed(2)} جنيه</strong>
                          </div>
                        )
                    )}
                </div>
              </div>

              {/* Expenses & Returns & Credit */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h3 className="font-semibold mb-2 text-red-900 text-sm">
                    📤 المصروفات
                  </h3>
                  <p className="text-xl font-bold text-red-600">
                    {Number(dailySummary.totalExpenses || 0).toFixed(2)} جنيه
                  </p>
                </div>
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <h3 className="font-semibold mb-2 text-orange-900 text-sm">
                    ↩️ المرتجعات
                  </h3>
                  <p className="text-xl font-bold text-orange-600">
                    {Number(dailySummary.totalReturns || 0).toFixed(2)} جنيه
                  </p>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h3 className="font-semibold mb-2 text-yellow-900 text-sm">
                    📅 الآجل ({dailySummary.creditInvoiceCount || 0} فاتورة)
                  </h3>
                  <p className="text-xl font-bold text-yellow-600">
                    {(dailySummary.totalCredit || 0).toFixed(2)} جنيه
                  </p>
                  <p className="text-xs text-yellow-700 mt-1">غير محصّل</p>
                </div>
                {/* تسديدات الآجل المستلمة */}
                {(dailySummary.creditPaymentsReceived || 0) > 0 && (
                  <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
                    <h3 className="font-semibold mb-2 text-teal-900 text-sm">
                      💰 تسديدات آجل مستلمة
                    </h3>
                    <p className="text-xl font-bold text-teal-600">
                      {(dailySummary.creditPaymentsReceived || 0).toFixed(2)} جنيه
                    </p>
                    <p className="text-xs text-teal-700 mt-1">تحصيل اليوم</p>
                  </div>
                )}
              </div>

              {/* Net Profit */}
              <div
                className={`border-2 rounded-lg p-4 ${dailySummary.netProfit >= 0
                  ? "bg-emerald-50 border-emerald-400"
                  : "bg-red-50 border-red-400"
                  }`}
              >
                <h3 className="font-semibold mb-2 text-center">
                  {dailySummary.netProfit >= 0 ? "✅ النقديه الفعليه" : "⚠️ الخسارة"}
                </h3>
                <p
                  className={`text-3xl font-bold text-center ${dailySummary.netProfit >= 0
                    ? "text-emerald-600"
                    : "text-red-600"
                    }`}
                >
                  {Number(dailySummary.netProfit || 0).toFixed(2)} جنيه
                </p>
                <p className="text-xs text-center text-muted-foreground mt-2">
                  (المبيعات - المصروفات - المرتجعات - الآجل غير المحصّل)
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setDailySummaryDialogOpen(false)}>
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WhatsApp Dialogs */}
      <InvoiceWhatsAppDialog
        open={invoiceWhatsAppOpen}
        onOpenChange={setInvoiceWhatsAppOpen}
      />
      <StatementWhatsAppDialog
        open={statementWhatsAppOpen}
        onOpenChange={setStatementWhatsAppOpen}
      />
    </header>
  );
};
