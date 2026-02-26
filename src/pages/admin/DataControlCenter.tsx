/**
 * DataControlCenter - مركز التحكم بالبيانات
 * صفحة إدارية للتحكم الكامل في البيانات والمزامنة
 * الوصول عبر اختصار Ctrl+Shift+D فقط (بدون زر في الواجهة)
 * محمية بكلمة مرور من 4 أرقام
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Database,
  RefreshCw,
  Upload,
  CheckCircle2,
  XCircle,
  ArrowUpCircle,
  Search,
  ChevronDown,
  ChevronUp,
  Shield,
  Loader2,
  HardDrive,
  Cloud,
  AlertTriangle,
  CheckCheck,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { useToast } from "@/components/ui/use-toast";
import { getDatabaseService } from "@/infrastructure/database/DatabaseService";
import { getSmartSync } from "@/infrastructure/sync";
import { STORES_SCHEMA } from "@/infrastructure/database/migrations/schema.config";

// ==================== Constants ====================

// PIN for accessing the data control center
const ACCESS_PIN = "1234";

// All IndexedDB store names from schema
const ALL_STORES = STORES_SCHEMA.map((s) => s.name);

// Syncable tables (snake_case) from SmartSyncManager
const SYNCABLE_TABLES_SNAKE = [
  "products",
  "product_categories",
  "product_units",
  "units",
  "price_types",
  "warehouses",
  "customers",
  "suppliers",
  "employees",
  "supervisors",
  "sales_reps",
  "users",
  "roles",
  "invoices",
  "invoice_items",
  "sales_returns",
  "purchases",
  "purchase_items",
  "purchase_returns",
  "expenses",
  "expense_categories",
  "expense_items",
  "deposits",
  "deposit_sources",
  "payments",
  "payment_methods",
  "supervisor_bonuses",
  "customer_bonuses",
  "shifts",
  "settings",
  "audit_logs",
];

// snake_case to camelCase mapping
const TABLE_TO_STORE_MAP: Record<string, string> = {
  product_categories: "productCategories",
  product_units: "productUnits",
  price_types: "priceTypes",
  invoice_items: "invoiceItems",
  sales_returns: "salesReturns",
  purchase_items: "purchaseItems",
  purchase_returns: "purchaseReturns",
  expense_categories: "expenseCategories",
  expense_items: "expenseItems",
  deposit_sources: "depositSources",
  payment_methods: "paymentMethods",
  audit_logs: "auditLogs",
  sales_reps: "salesReps",
  supervisor_bonuses: "supervisorBonuses",
  customer_bonuses: "customerBonuses",
};

// Build set of synced store names (in camelCase)
const SYNCED_STORE_NAMES = new Set(
  SYNCABLE_TABLES_SNAKE.map((t) => TABLE_TO_STORE_MAP[t] || t)
);

// Reverse map: store camelCase → table snake_case
const STORE_TO_TABLE_MAP: Record<string, string> = {};
for (const [table, store] of Object.entries(TABLE_TO_STORE_MAP)) {
  STORE_TO_TABLE_MAP[store] = table;
}

// Friendly Arabic names for stores
const STORE_LABELS: Record<string, string> = {
  products: "المنتجات",
  customers: "العملاء",
  invoices: "الفواتير",
  invoiceItems: "بنود الفواتير",
  salesReturns: "مرتجعات المبيعات",
  purchases: "المشتريات",
  purchaseItems: "بنود المشتريات",
  purchaseReturns: "مرتجعات المشتريات",
  purchasePayments: "مدفوعات المشتريات",
  suppliers: "الموردين",
  employees: "الموظفين",
  expenses: "المصروفات",
  expenseCategories: "فئات المصروفات",
  expenseItems: "بنود المصروفات",
  deposits: "الإيداعات",
  depositSources: "مصادر الإيداع",
  payments: "المدفوعات",
  paymentMethods: "طرق الدفع",
  installments: "الأقساط",
  shifts: "الورديات",
  promotions: "العروض",
  productCategories: "فئات المنتجات",
  units: "الوحدات",
  productUnits: "وحدات المنتجات",
  warehouses: "المخازن",
  productStock: "مخزون المنتجات",
  priceTypes: "أنواع الأسعار",
  salesReps: "مندوبي المبيعات",
  supervisors: "المشرفين",
  supervisorBonuses: "بونص المشرفين",
  customerBonuses: "بونص العملاء",
  users: "المستخدمين",
  roles: "الصلاحيات",
  settings: "الإعدادات",
  auditLogs: "سجل المراجعة",
  tables: "الطاولات",
  halls: "الصالات",
  printers: "الطابعات",
  paymentApps: "تطبيقات الدفع",
  cashMovements: "حركات النقدية",
  employeeAdvances: "سلف الموظفين",
  employeeDeductions: "خصومات الموظفين",
  whatsappAccounts: "حسابات واتساب",
  whatsappMessages: "رسائل واتساب",
  whatsappCampaigns: "حملات واتساب",
  whatsappTasks: "مهام واتساب",
};

// ==================== Types ====================

interface StoreInfo {
  name: string;
  label: string;
  count: number;
  unsyncedCount: number;
  isSynced: boolean; // whether it's in SYNCABLE_TABLES
  isLoading: boolean;
}

interface RecordPreview {
  storeName: string;
  records: any[];
  selectedIds: Set<string>;
}

// ==================== Component ====================

const DataControlCenter: React.FC = () => {
  const { toast } = useToast();

  // State
  const [stores, setStores] = useState<StoreInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "synced" | "local">("all");
  const [expandedStore, setExpandedStore] = useState<string | null>(null);
  const [recordPreview, setRecordPreview] = useState<RecordPreview | null>(null);
  const [recordSearch, setRecordSearch] = useState("");
  const [selectedStores, setSelectedStores] = useState<Set<string>>(new Set());
  const [pushingStore, setPushingStore] = useState<string | null>(null);
  const [pushingAll, setPushingAll] = useState(false);
  const [sortBy, setSortBy] = useState<"name" | "count" | "unsynced">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const isMountedRef = useRef(true);

  // ==================== Load store data ====================

  const loadStoreData = useCallback(async () => {
    setLoading(true);
    try {
      const dbService = getDatabaseService();
      const storeInfos: StoreInfo[] = [];

      for (const storeName of ALL_STORES) {
        try {
          const repo = dbService.getRepository(storeName, false);
          const allRecords = await repo.getAll();
          const count = allRecords.length;

          let unsyncedCount = 0;
          if (SYNCED_STORE_NAMES.has(storeName)) {
            const syncRepo = dbService.getRepository(storeName, true);
            const unsynced = await syncRepo.getUnsyncedRecords();
            unsyncedCount = unsynced.length;
          }

          storeInfos.push({
            name: storeName,
            label: STORE_LABELS[storeName] || storeName,
            count,
            unsyncedCount,
            isSynced: SYNCED_STORE_NAMES.has(storeName),
            isLoading: false,
          });
        } catch (e) {
          storeInfos.push({
            name: storeName,
            label: STORE_LABELS[storeName] || storeName,
            count: 0,
            unsyncedCount: 0,
            isSynced: SYNCED_STORE_NAMES.has(storeName),
            isLoading: false,
          });
        }
      }

      if (isMountedRef.current) {
        setStores(storeInfos);
      }
    } catch (error) {
      console.error("Error loading store data:", error);
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء تحميل بيانات الجداول",
        variant: "destructive",
      });
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [toast]);

  useEffect(() => {
    isMountedRef.current = true;
    loadStoreData();
    return () => {
      isMountedRef.current = false;
    };
  }, [loadStoreData]);

  // ==================== Load records for preview ====================

  const loadRecords = useCallback(
    async (storeName: string) => {
      try {
        const dbService = getDatabaseService();
        const repo = dbService.getRepository(storeName, false);
        const records = await repo.getAll();
        setRecordPreview({
          storeName,
          records,
          selectedIds: new Set(),
        });
        setExpandedStore(storeName);
      } catch (error) {
        toast({
          title: "خطأ",
          description: `فشل تحميل بيانات ${STORE_LABELS[storeName] || storeName}`,
          variant: "destructive",
        });
      }
    },
    [toast]
  );

  // ==================== Resend Logic ====================

  const resendStore = useCallback(
    async (storeName: string) => {
      if (!SYNCED_STORE_NAMES.has(storeName)) {
        toast({
          title: "غير متاح",
          description: `${STORE_LABELS[storeName] || storeName} غير مدعوم للمزامنة`,
          variant: "destructive",
        });
        return;
      }

      setPushingStore(storeName);
      try {
        const dbService = getDatabaseService();
        const repo = dbService.getRepository(storeName, true);

        // Mark all records in this store as unsynced
        await repo.markAllAsUnsynced();

        // Now push
        const smartSync = getSmartSync();
        if (smartSync) {
          const result = await smartSync.pushChanges();
          toast({
            title: "تم الإرسال",
            description: `تم إعادة إرسال ${STORE_LABELS[storeName] || storeName} — ${result.pushed} سجل`,
          });
        }

        // Refresh store data
        await loadStoreData();
      } catch (error: any) {
        toast({
          title: "خطأ",
          description: `فشل إرسال ${STORE_LABELS[storeName] || storeName}: ${error.message}`,
          variant: "destructive",
        });
      } finally {
        setPushingStore(null);
      }
    },
    [toast, loadStoreData]
  );

  const resendSelectedRecords = useCallback(async () => {
    if (!recordPreview || recordPreview.selectedIds.size === 0) return;

    const { storeName, selectedIds } = recordPreview;
    if (!SYNCED_STORE_NAMES.has(storeName)) {
      toast({
        title: "غير متاح",
        description: "هذا الجدول غير مدعوم للمزامنة",
        variant: "destructive",
      });
      return;
    }

    setPushingStore(storeName);
    try {
      const dbService = getDatabaseService();
      const repo = dbService.getRepository(storeName, true);

      // Mark only selected records as unsynced
      const now = new Date().toISOString();
      for (const id of selectedIds) {
        try {
          const record = await repo.getById(id);
          if (record) {
            const updated = {
              ...record,
              is_synced: false,
              last_synced_at: null,
              local_updated_at: now,
            };
            // Use the base update to avoid triggering sync queue
            await (repo as any).update(updated);
          }
        } catch (e) {
          console.warn(`Failed to mark record ${id} as unsynced:`, e);
        }
      }

      // Push changes
      const smartSync = getSmartSync();
      if (smartSync) {
        const result = await smartSync.pushChanges();
        toast({
          title: "تم الإرسال",
          description: `تم إعادة إرسال ${selectedIds.size} سجل — ${result.pushed} تم رفعهم`,
        });
      }

      // Refresh
      await loadStoreData();
      await loadRecords(storeName);
    } catch (error: any) {
      toast({
        title: "خطأ",
        description: `فشل إرسال العناصر المحددة: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setPushingStore(null);
    }
  }, [recordPreview, toast, loadStoreData, loadRecords]);

  const resendMultipleStores = useCallback(async () => {
    if (selectedStores.size === 0) return;

    setPushingAll(true);
    try {
      const dbService = getDatabaseService();

      // Mark all selected stores as unsynced
      for (const storeName of selectedStores) {
        if (SYNCED_STORE_NAMES.has(storeName)) {
          try {
            const repo = dbService.getRepository(storeName, true);
            await repo.markAllAsUnsynced();
          } catch (e) {
            console.warn(`Failed to mark ${storeName} as unsynced:`, e);
          }
        }
      }

      // Push all at once
      const smartSync = getSmartSync();
      if (smartSync) {
        const result = await smartSync.pushChanges();
        toast({
          title: "تم الإرسال",
          description: `تم إعادة إرسال ${selectedStores.size} جدول — ${result.pushed} سجل`,
        });
      }

      setSelectedStores(new Set());
      await loadStoreData();
    } catch (error: any) {
      toast({
        title: "خطأ",
        description: `فشل الإرسال: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setPushingAll(false);
    }
  }, [selectedStores, toast, loadStoreData]);

  // ==================== Helpers ====================

  const toggleStoreSelection = (storeName: string) => {
    setSelectedStores((prev) => {
      const next = new Set(prev);
      if (next.has(storeName)) next.delete(storeName);
      else next.add(storeName);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    const visibleSynced = filteredStores.filter((s) => s.isSynced);
    const allSelected = visibleSynced.every((s) => selectedStores.has(s.name));
    if (allSelected) {
      setSelectedStores(new Set());
    } else {
      setSelectedStores(new Set(visibleSynced.map((s) => s.name)));
    }
  };

  const toggleRecordSelection = (id: string) => {
    if (!recordPreview) return;
    setRecordPreview((prev) => {
      if (!prev) return prev;
      const next = new Set(prev.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, selectedIds: next };
    });
  };

  const toggleSelectAllRecords = () => {
    if (!recordPreview) return;
    const allSelected =
      recordPreview.selectedIds.size === recordPreview.records.length;
    if (allSelected) {
      setRecordPreview((prev) =>
        prev ? { ...prev, selectedIds: new Set() } : prev
      );
    } else {
      setRecordPreview((prev) =>
        prev
          ? {
              ...prev,
              selectedIds: new Set(
                prev.records.map((r) => r.id || r.key)
              ),
            }
          : prev
      );
    }
  };

  // ==================== Filtering & Sorting ====================

  const filteredStores = stores
    .filter((s) => {
      // Search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (
          !s.name.toLowerCase().includes(q) &&
          !s.label.toLowerCase().includes(q)
        )
          return false;
      }
      // Type filter
      if (filterMode === "synced" && !s.isSynced) return false;
      if (filterMode === "local" && s.isSynced) return false;
      return true;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortBy === "name") cmp = a.label.localeCompare(b.label, "ar");
      else if (sortBy === "count") cmp = a.count - b.count;
      else if (sortBy === "unsynced") cmp = a.unsyncedCount - b.unsyncedCount;
      return sortDir === "asc" ? cmp : -cmp;
    });

  const totalRecords = stores.reduce((sum, s) => sum + s.count, 0);
  const totalUnsynced = stores.reduce((sum, s) => sum + s.unsyncedCount, 0);
  const syncedStoresCount = stores.filter((s) => s.isSynced).length;
  const localStoresCount = stores.filter((s) => !s.isSynced).length;

  const filteredRecords =
    recordPreview?.records.filter((r) => {
      if (!recordSearch) return true;
      const q = recordSearch.toLowerCase();
      return JSON.stringify(r).toLowerCase().includes(q);
    }) || [];

  // ==================== Render ====================

  return (
    <div className="flex flex-col h-full bg-background" dir="rtl">
      {/* Header */}
      <div className="border-b px-6 py-4 bg-gradient-to-l from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Database className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">مركز التحكم بالبيانات</h1>
              <p className="text-sm text-muted-foreground">
                إدارة ومراقبة جميع الجداول والمزامنة
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadStoreData}
              disabled={loading}
            >
              <RefreshCw
                className={`h-4 w-4 ml-1 ${loading ? "animate-spin" : ""}`}
              />
              تحديث
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-3 mt-4">
          <Card className="bg-white/80 dark:bg-gray-900/80">
            <CardContent className="p-3 flex items-center gap-3">
              <HardDrive className="h-5 w-5 text-blue-500" />
              <div>
                <div className="text-lg font-bold">{stores.length}</div>
                <div className="text-xs text-muted-foreground">إجمالي الجداول</div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white/80 dark:bg-gray-900/80">
            <CardContent className="p-3 flex items-center gap-3">
              <Cloud className="h-5 w-5 text-green-500" />
              <div>
                <div className="text-lg font-bold">
                  {syncedStoresCount}
                  <span className="text-xs font-normal text-muted-foreground mr-1">
                    / {localStoresCount} محلي
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">جداول مُزامَنة</div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white/80 dark:bg-gray-900/80">
            <CardContent className="p-3 flex items-center gap-3">
              <Database className="h-5 w-5 text-purple-500" />
              <div>
                <div className="text-lg font-bold">
                  {totalRecords.toLocaleString("ar-EG")}
                </div>
                <div className="text-xs text-muted-foreground">إجمالي السجلات</div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white/80 dark:bg-gray-900/80">
            <CardContent className="p-3 flex items-center gap-3">
              <AlertTriangle
                className={`h-5 w-5 ${totalUnsynced > 0 ? "text-amber-500" : "text-green-500"}`}
              />
              <div>
                <div className="text-lg font-bold">
                  {totalUnsynced.toLocaleString("ar-EG")}
                </div>
                <div className="text-xs text-muted-foreground">
                  غير مُزامَنة
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Toolbar */}
      <div className="border-b px-6 py-3 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث في الجداول..."
            className="pr-9"
          />
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant={filterMode === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterMode("all")}
          >
            الكل ({stores.length})
          </Button>
          <Button
            variant={filterMode === "synced" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterMode("synced")}
          >
            <Cloud className="h-3 w-3 ml-1" />
            مُزامَنة ({syncedStoresCount})
          </Button>
          <Button
            variant={filterMode === "local" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterMode("local")}
          >
            <HardDrive className="h-3 w-3 ml-1" />
            محلية ({localStoresCount})
          </Button>
        </div>

        <Separator orientation="vertical" className="h-8" />

        {selectedStores.size > 0 && (
          <Button
            size="sm"
            onClick={resendMultipleStores}
            disabled={pushingAll}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {pushingAll ? (
              <Loader2 className="h-4 w-4 ml-1 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 ml-1" />
            )}
            إعادة إرسال المحدد ({selectedStores.size})
          </Button>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Store List */}
        <div
          className={`${expandedStore ? "w-1/2" : "w-full"} border-l overflow-hidden flex flex-col`}
        >
          <ScrollArea className="flex-1">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 text-center">
                    <Checkbox
                      checked={
                        filteredStores.filter((s) => s.isSynced).length > 0 &&
                        filteredStores
                          .filter((s) => s.isSynced)
                          .every((s) => selectedStores.has(s.name))
                      }
                      onCheckedChange={toggleSelectAllVisible}
                    />
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => {
                      if (sortBy === "name")
                        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                      else {
                        setSortBy("name");
                        setSortDir("asc");
                      }
                    }}
                  >
                    <div className="flex items-center gap-1">
                      الجدول
                      {sortBy === "name" &&
                        (sortDir === "asc" ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        ))}
                    </div>
                  </TableHead>
                  <TableHead className="text-center">النوع</TableHead>
                  <TableHead
                    className="text-center cursor-pointer select-none"
                    onClick={() => {
                      if (sortBy === "count")
                        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                      else {
                        setSortBy("count");
                        setSortDir("desc");
                      }
                    }}
                  >
                    <div className="flex items-center justify-center gap-1">
                      السجلات
                      {sortBy === "count" &&
                        (sortDir === "asc" ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        ))}
                    </div>
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer select-none"
                    onClick={() => {
                      if (sortBy === "unsynced")
                        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                      else {
                        setSortBy("unsynced");
                        setSortDir("desc");
                      }
                    }}
                  >
                    <div className="flex items-center justify-center gap-1">
                      غير مُزامَن
                      {sortBy === "unsynced" &&
                        (sortDir === "asc" ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        ))}
                    </div>
                  </TableHead>
                  <TableHead className="text-center">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                      <span className="text-muted-foreground">
                        جاري تحميل البيانات...
                      </span>
                    </TableCell>
                  </TableRow>
                ) : filteredStores.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center py-8 text-muted-foreground"
                    >
                      لا توجد نتائج
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredStores.map((store) => (
                    <TableRow
                      key={store.name}
                      className={`cursor-pointer hover:bg-muted/50 ${
                        expandedStore === store.name ? "bg-muted" : ""
                      }`}
                    >
                      <TableCell className="text-center">
                        {store.isSynced ? (
                          <Checkbox
                            checked={selectedStores.has(store.name)}
                            onCheckedChange={() =>
                              toggleStoreSelection(store.name)
                            }
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span className="text-muted-foreground/30">—</span>
                        )}
                      </TableCell>
                      <TableCell onClick={() => loadRecords(store.name)}>
                        <div className="flex flex-col">
                          <span className="font-medium">{store.label}</span>
                          <span className="text-xs text-muted-foreground font-mono">
                            {store.name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell
                        className="text-center"
                        onClick={() => loadRecords(store.name)}
                      >
                        {store.isSynced ? (
                          <Badge
                            variant="outline"
                            className="text-green-600 border-green-200 bg-green-50 dark:bg-green-950/30"
                          >
                            <Cloud className="h-3 w-3 ml-1" />
                            مُزامَن
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-gray-500 border-gray-200 bg-gray-50 dark:bg-gray-950/30"
                          >
                            <HardDrive className="h-3 w-3 ml-1" />
                            محلي
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell
                        className="text-center font-mono"
                        onClick={() => loadRecords(store.name)}
                      >
                        {store.count.toLocaleString("ar-EG")}
                      </TableCell>
                      <TableCell
                        className="text-center"
                        onClick={() => loadRecords(store.name)}
                      >
                        {store.isSynced ? (
                          store.unsyncedCount > 0 ? (
                            <Badge variant="destructive" className="text-xs">
                              {store.unsyncedCount.toLocaleString("ar-EG")}
                            </Badge>
                          ) : (
                            <CheckCheck className="h-4 w-4 text-green-500 mx-auto" />
                          )
                        ) : (
                          <span className="text-muted-foreground/30">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              loadRecords(store.name);
                            }}
                            title="عرض البيانات"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {store.isSynced && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                              onClick={(e) => {
                                e.stopPropagation();
                                resendStore(store.name);
                              }}
                              disabled={
                                pushingStore === store.name ||
                                store.count === 0
                              }
                              title="إعادة إرسال الجدول"
                            >
                              {pushingStore === store.name ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <ArrowUpCircle className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>

        {/* Record Preview Panel */}
        {expandedStore && recordPreview && (
          <div className="w-1/2 flex flex-col overflow-hidden border-r">
            <div className="border-b px-4 py-3 bg-muted/30">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm">
                    {STORE_LABELS[expandedStore] || expandedStore}
                  </h3>
                  <Badge variant="secondary" className="text-xs">
                    {recordPreview.records.length} سجل
                  </Badge>
                </div>
                <div className="flex items-center gap-1">
                  {SYNCED_STORE_NAMES.has(expandedStore) &&
                    recordPreview.selectedIds.size > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={resendSelectedRecords}
                        disabled={pushingStore === expandedStore}
                      >
                        {pushingStore === expandedStore ? (
                          <Loader2 className="h-3 w-3 ml-1 animate-spin" />
                        ) : (
                          <Upload className="h-3 w-3 ml-1" />
                        )}
                        إرسال المحدد ({recordPreview.selectedIds.size})
                      </Button>
                    )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      setExpandedStore(null);
                      setRecordPreview(null);
                      setRecordSearch("");
                    }}
                  >
                    <XCircle className="h-3.5 w-3.5 ml-1" />
                    إغلاق
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={recordSearch}
                    onChange={(e) => setRecordSearch(e.target.value)}
                    placeholder="بحث في السجلات..."
                    className="pr-8 h-8 text-xs"
                  />
                </div>
                {SYNCED_STORE_NAMES.has(expandedStore) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={toggleSelectAllRecords}
                  >
                    <CheckCheck className="h-3 w-3 ml-1" />
                    {recordPreview.selectedIds.size ===
                    recordPreview.records.length
                      ? "إلغاء الكل"
                      : "تحديد الكل"}
                  </Button>
                )}
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {filteredRecords.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    لا توجد سجلات
                  </div>
                ) : (
                  filteredRecords.map((record, idx) => {
                    const recordId = record.id || record.key || `idx-${idx}`;
                    const isSynced = record.is_synced !== false;
                    const isSelected =
                      recordPreview.selectedIds.has(String(recordId));

                    return (
                      <div
                        key={recordId}
                        className={`p-2 rounded border text-xs font-mono ${
                          isSelected
                            ? "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800"
                            : "bg-card border-border"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {SYNCED_STORE_NAMES.has(expandedStore) && (
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() =>
                                toggleRecordSelection(String(recordId))
                              }
                              className="mt-0.5"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-bold text-primary">
                                {recordId}
                              </span>
                              {SYNCED_STORE_NAMES.has(expandedStore) && (
                                <Badge
                                  variant={isSynced ? "outline" : "destructive"}
                                  className="text-[10px] px-1 py-0"
                                >
                                  {isSynced ? (
                                    <>
                                      <CheckCircle2 className="h-2.5 w-2.5 ml-0.5" />
                                      مُزامَن
                                    </>
                                  ) : (
                                    <>
                                      <AlertTriangle className="h-2.5 w-2.5 ml-0.5" />
                                      غير مُزامَن
                                    </>
                                  )}
                                </Badge>
                              )}
                              {record.name && (
                                <span className="text-muted-foreground truncate">
                                  {record.name}
                                </span>
                              )}
                              {record.nameAr && (
                                <span className="text-muted-foreground truncate">
                                  {record.nameAr}
                                </span>
                              )}
                            </div>
                            <details className="group">
                              <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none">
                                عرض التفاصيل
                              </summary>
                              <pre
                                className="mt-1 p-2 bg-muted/50 rounded overflow-x-auto whitespace-pre-wrap break-all max-h-48"
                                dir="ltr"
                              >
                                {JSON.stringify(record, null, 2)}
                              </pre>
                            </details>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  );
};

export default DataControlCenter;
