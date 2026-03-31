import { useState, useEffect, useMemo } from "react";
import { POSHeader } from "@/components/POS/POSHeader";
import { useCustomerBalances } from "@/hooks/useCustomerBalances";
import { usePagination } from "@/hooks/usePagination";
import { DataPagination } from "@/components/ui/DataPagination";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ExportButtons } from "@/components/common/ExportButtons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FileText,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package,
  Users,
  CreditCard,
  ShoppingCart,
  RotateCcw,
  Receipt,
  AlertTriangle,
  Calendar,
  Filter,
  BarChart3,
  PieChart as PieChartIcon,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  db,
  Invoice,
  Customer,
  Product,
  SalesReturn,
  Shift,
  Employee,
  Expense,
  PaymentMethod,
  ProductCategory,
  Supervisor,
  SalesRep,
} from "@/shared/lib/indexedDB";
import { useSettingsContext } from "@/contexts/SettingsContext";
import { useToast } from "@/hooks/use-toast";
import { getChartColors } from "@/lib/theme.config";
import { useTheme } from "next-themes";
import {
  printCustomerDebtReport,
  printCollectionReport,
  printCustomerInvoicesReport,
  printCustomerPaymentsReport,
} from "@/lib/reportPrintService";

const Reports = () => {
  const { getSetting } = useSettingsContext();
  const currency = getSetting("currency") || "EGP";
  const { toast } = useToast();
  const { theme } = useTheme();

  // الحصول على ألوان الرسوم البيانية ديناميكياً
  const chartColors = getChartColors(
    "green",
    (theme as "light" | "dark") || "light"
  );

  // States للبيانات
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [salesReturns, setSalesReturns] = useState<SalesReturn[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [salesReps, setSalesReps] = useState<SalesRep[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const { getBalance } = useCustomerBalances([customers]);

  // Filters
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(1);
    return date.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [selectedEmployee, setSelectedEmployee] = useState<string>("all");
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedCustomer, setSelectedCustomer] = useState<string>("all");
  const [selectedSupervisor, setSelectedSupervisor] = useState<string>("all");
  const [selectedSalesRep, setSelectedSalesRep] = useState<string>("all");

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [inv, cust, prod, salesRet, shft, emp, exp, pms, cats, sups, reps, pays] =
        await Promise.all([
          db.getAll<Invoice>("invoices"),
          db.getAll<Customer>("customers"),
          db.getAll<Product>("products"),
          db.getAll<SalesReturn>("salesReturns"),
          db.getAll<Shift>("shifts"),
          db.getAll<Employee>("employees"),
          db.getAll<Expense>("expenses"),
          db.getAll<PaymentMethod>("paymentMethods"),
          db.getAll<ProductCategory>("productCategories"),
          db.getAll<Supervisor>("supervisors"),
          db.getAll<SalesRep>("salesReps"),
          db.getAll<any>("payments"),
        ]);
      setInvoices(inv);
      setCustomers(cust);
      // Resolve category IDs to names for products
      setProducts(prod.map((p: Product) => {
        if (p.category && /^\d+$/.test(String(p.category))) {
          const matchedCat = cats.find(
            (c: ProductCategory) => String(c.id) === String(p.category)
          );
          if (matchedCat) {
            return { ...p, category: matchedCat.nameAr || matchedCat.name || p.category, categoryId: String(p.category) };
          }
        }
        return p;
      }));
      setSalesReturns(salesRet);
      setShifts(shft);
      setEmployees(emp);
      setExpenses(exp);
      setPaymentMethods(pms);
      setCategories(cats);
      setSupervisors(sups);
      setSalesReps(reps);
      setPayments(pays);

      // ====== استعادة سجلات القبض من localStorage إذا كانت مفقودة ======
      try {
        const savedCollections = localStorage.getItem('pos-collections');
        if (savedCollections) {
          const localCollections = JSON.parse(savedCollections) as any[];
          const existingIds = new Set(pays.map((p: any) => String(p.id)));
          const missingRecords: any[] = [];
          for (const lc of localCollections) {
            if (lc.id && !existingIds.has(String(lc.id))) {
              const dbRecord = {
                id: lc.id,
                customerId: String(lc.customerId),
                customerName: lc.customerName || "",
                amount: Number(lc.amount) || 0,
                paymentMethodId: lc.paymentMethodId || "",
                paymentMethodName: lc.paymentMethodName || "",
                paymentType: "collection",
                paymentDate: lc.createdAt || new Date().toISOString(),
                createdAt: lc.createdAt || new Date().toISOString(),
                userId: lc.userId || "",
                userName: lc.userName || "",
                notes: lc.notes,
              };
              try {
                await db.add("payments", dbRecord);
                missingRecords.push(dbRecord);
              } catch { /* skip duplicates */ }
            }
          }
          if (missingRecords.length > 0) {
            setPayments([...pays, ...missingRecords]);
            console.log(`[Reports] 🔄 Restored ${missingRecords.length} payments from localStorage`);
          }
        }
      } catch { /* ignore */ }
    } catch (error) {
      console.error("Error loading data:", error);
      toast({
        title: "خطأ",
        description: "فشل تحميل البيانات",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Helpers
  const filterByDate = (date: string) => {
    const itemDate = new Date(date);
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    return itemDate >= start && itemDate <= end;
  };

  const formatCurrency = (amount: number | string) => {
    const num = Number(amount) || 0;
    if (Number.isInteger(num)) {
      return `${num} ${currency}`;
    }
    return `${Number(num || 0).toFixed(2)} ${currency}`;
  };

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("ar-EG");

  // Filtered Data with advanced filters
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (!filterByDate(inv.createdAt)) return false;
      if (selectedEmployee !== "all" && inv.userId !== selectedEmployee)
        return false;
      if (selectedCustomer !== "all" && inv.customerId !== selectedCustomer)
        return false;

      // Filter by payment method
      if (selectedPaymentMethod !== "all") {
        if (inv.paymentMethodIds) {
          if (!inv.paymentMethodIds.includes(selectedPaymentMethod))
            return false;
        } else if (inv.paymentType !== selectedPaymentMethod) {
          return false;
        }
      }

      // Filter by category
      if (selectedCategory !== "all") {
        const hasCategory = inv.items?.some((item) => {
          const product = products.find((p) => p.id === item.productId);
          const category = categories.find((c) => c.name === product?.category);
          return category?.id === selectedCategory;
        });
        if (!hasCategory) return false;
      }

      // Filter by supervisor (through customer's salesRep -> supervisorId)
      if (selectedSupervisor !== "all") {
        const customer = customers.find((c) => c.id === inv.customerId);
        if (!customer) return false;
        const rep = salesReps.find((r) => r.id === (customer as any).salesRepId);
        if (!rep || rep.supervisorId !== selectedSupervisor) {
          return false;
        }
      }

      // Filter by sales rep (through customer's salesRepId)
      if (selectedSalesRep !== "all") {
        const customer = customers.find((c) => c.id === inv.customerId);
        if (!customer || (customer as any).salesRepId !== selectedSalesRep) {
          return false;
        }
      }

      return true;
    });
  }, [
    invoices,
    startDate,
    endDate,
    selectedEmployee,
    selectedPaymentMethod,
    selectedCategory,
    selectedCustomer,
    selectedSupervisor,
    selectedSalesRep,
    products,
    customers,
  ]);

  const filteredSalesReturns = salesReturns.filter((ret) => {
    if (!filterByDate(ret.createdAt)) return false;
    
    // Filter by supervisor
    if (selectedSupervisor !== "all") {
      const customer = customers.find((c) => c.id === ret.customerId);
      if (!customer) return false;
      const rep = salesReps.find((r) => r.id === (customer as any).salesRepId);
      if (!rep || rep.supervisorId !== selectedSupervisor) return false;
    }
    
    // Filter by sales rep
    if (selectedSalesRep !== "all") {
      const customer = customers.find((c) => c.id === ret.customerId);
      if (!customer || (customer as any).salesRepId !== selectedSalesRep) return false;
    }
    
    return true;
  });
  const filteredShifts = shifts.filter((shift) =>
    filterByDate(shift.startTime)
  );
  const filteredExpenses = expenses.filter((exp) =>
    filterByDate(exp.createdAt)
  );

  // Filter payments (collections) by date, supervisor, and sales rep
  const filteredPayments = useMemo(() => {
    return payments.filter((pay: any) => {
      const payDate = pay.createdAt || pay.paymentDate;
      if (!payDate || !filterByDate(payDate)) return false;

      // Filter by supervisor
      if (selectedSupervisor !== "all") {
        const customer = customers.find((c) => String(c.id) === String(pay.customerId));
        if (!customer) return false;
        const rep = salesReps.find((r) => r.id === (customer as any).salesRepId);
        if (!rep || rep.supervisorId !== selectedSupervisor) return false;
      }

      // Filter by sales rep
      if (selectedSalesRep !== "all") {
        const customer = customers.find((c) => String(c.id) === String(pay.customerId));
        if (!customer || (customer as any).salesRepId !== selectedSalesRep) return false;
      }

      return true;
    });
  }, [payments, startDate, endDate, selectedSupervisor, selectedSalesRep, customers, salesReps]);

  // Calculations
  const totalSales = filteredInvoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0);
  const totalSalesReturns = filteredSalesReturns.reduce(
    (sum, ret) => sum + Number(ret.total || 0),
    0
  );
  const totalExpenses = filteredExpenses.reduce(
    (sum, exp) => sum + Number(exp.amount || 0),
    0
  );
  // Total payments = actual collections from payments store
  const totalPayments = filteredPayments.reduce(
    (sum: number, pay: any) => sum + Number(pay.amount || 0),
    0
  );
  const netSales = totalSales - totalSalesReturns;
  const netProfit = netSales - totalExpenses;
  const invoiceCount = filteredInvoices.length;
  const avgInvoiceValue = invoiceCount > 0 ? totalSales / invoiceCount : 0;

  // مبيعات حسب طريقة الدفع - ديناميكية
  const salesByPaymentMethod = useMemo(() => {
    const methodSales: { [key: string]: { name: string; amount: number } } = {};

    paymentMethods.forEach((method) => {
      methodSales[method.id] = { name: method.name, amount: 0 };
    });

    filteredInvoices.forEach((inv) => {
      if (
        inv.paymentMethodAmounts &&
        Object.keys(inv.paymentMethodAmounts).length > 0
      ) {
        Object.entries(inv.paymentMethodAmounts).forEach(
          ([methodId, amount]) => {
            if (methodSales[methodId]) {
              methodSales[methodId].amount +=
                (typeof amount === "number"
                  ? amount
                  : parseFloat(String(amount))) || 0;
            }
          }
        );
      }
    });

    return Object.values(methodSales).filter((m) => m.amount > 0);
  }, [filteredInvoices, paymentMethods]);

  // تحليل المنتجات
  const topProducts = useMemo(() => {
    const productSalesMap = new Map<
      string,
      { name: string; quantity: number; total: number; category: string }
    >();

    filteredInvoices.forEach((inv) => {
      inv.items?.forEach((item) => {
        const product = products.find((p) => p.id === item.productId);
        const category = categories.find((c) => c.name === product?.category);

        const existing = productSalesMap.get(item.productId) || {
          name: item.productName,
          quantity: 0,
          total: 0,
          category: category?.name || product?.category || "غير محدد",
        };

        productSalesMap.set(item.productId, {
          name: item.productName,
          quantity: existing.quantity + item.quantity,
          total: existing.total + item.total,
          category: existing.category,
        });
      });
    });

    return Array.from(productSalesMap.values())
      .sort((a, b) => b.total - a.total)
      .sort((a, b) => b.total - a.total);

  }, [filteredInvoices, products, categories]);

  // تحليل العملاء
  const topCustomers = useMemo(() => {
    const customerSalesMap = new Map<
      string,
      { name: string; total: number; count: number; phone: string }
    >();

    filteredInvoices.forEach((inv) => {
      if (inv.customerId) {
        const customer = customers.find((c) => c.id === inv.customerId);
        const existing = customerSalesMap.get(inv.customerId) || {
          name: inv.customerName || customer?.name || "غير محدد",
          total: 0,
          count: 0,
          phone: customer?.phone || "-",
        };

        customerSalesMap.set(inv.customerId, {
          name: customer?.name || existing.name,
          total: existing.total + Number(inv.total || 0),
          count: existing.count + 1,
          phone: existing.phone,
        });
      }
    });

    return Array.from(customerSalesMap.values())
      .sort((a, b) => b.total - a.total);

  }, [filteredInvoices, customers]);

  // المدفوعات (من سجلات القبض الفعلية)
  const topCustomersByPayments = useMemo(() => {
    const customerPaymentsMap = new Map<
      string,
      { name: string; totalPaid: number; count: number; phone: string; supervisorName: string }
    >();

    filteredPayments.forEach((pay: any) => {
      const custId = String(pay.customerId);
      if (!custId) return;
      const customer = customers.find((c) => String(c.id) === custId);
      const rep = customer ? salesReps.find((r) => r.id === (customer as any).salesRepId) : undefined;
      const supervisor = rep ? supervisors.find((s) => s.id === rep.supervisorId) : undefined;
      const existing = customerPaymentsMap.get(custId) || {
        name: pay.customerName || customer?.name || "غير محدد",
        totalPaid: 0,
        count: 0,
        phone: customer?.phone || "-",
        supervisorName: supervisor?.name || "-",
      };

      customerPaymentsMap.set(custId, {
        name: customer?.name || existing.name,
        totalPaid: existing.totalPaid + Number(pay.amount || 0),
        count: existing.count + 1,
        phone: customer?.phone || existing.phone,
        supervisorName: existing.supervisorName,
      });
    });

    return Array.from(customerPaymentsMap.values())
      .sort((a, b) => b.totalPaid - a.totalPaid);

  }, [filteredPayments, customers, salesReps, supervisors]);

  // سجلات القبض الفردية (لتقرير #15)
  const collectionRecords = useMemo(() => {
    return filteredPayments.map((pay: any) => {
      const custId = String(pay.customerId);
      const customer = customers.find((c) => String(c.id) === custId);
      const rep = customer ? salesReps.find((r) => r.id === (customer as any).salesRepId) : undefined;
      const supervisor = rep ? supervisors.find((s) => s.id === rep.supervisorId) : undefined;
      return {
        customerName: pay.customerName || customer?.name || "غير محدد",
        amount: Number(pay.amount || 0),
        currentBalance: customer ? getBalance(customer.id, Number(customer.currentBalance || 0)) : 0,
        operationId: pay.id || "-",
        date: formatDate(pay.createdAt || pay.paymentDate || ""),
        notes: pay.notes || "-",
        supervisorName: supervisor?.name || "-",
      };
    });
  }, [filteredPayments, customers, salesReps, supervisors, getBalance]);

  // ملخص فواتير العملاء مجمعة حسب العميل (لتقرير #14)
  const customerInvoicesSummary = useMemo(() => {
    const map = new Map<string, { customerName: string; invoiceCount: number; invoiceValue: number; supervisorName: string }>();
    filteredInvoices.forEach((inv) => {
      const custId = inv.customerId || "cash";
      const customer = customers.find((c) => c.id === custId);
      const rep = customer ? salesReps.find((r) => r.id === (customer as any).salesRepId) : undefined;
      const supervisor = rep ? supervisors.find((s) => s.id === rep.supervisorId) : undefined;
      const existing = map.get(custId) || {
        customerName: inv.customerName || customer?.name || "عميل نقدي",
        invoiceCount: 0,
        invoiceValue: 0,
        supervisorName: supervisor?.name || "-",
      };
      map.set(custId, {
        customerName: customer?.name || existing.customerName,
        invoiceCount: existing.invoiceCount + 1,
        invoiceValue: existing.invoiceValue + Number(inv.total || 0),
        supervisorName: existing.supervisorName,
      });
    });
    return Array.from(map.values()).sort((a, b) => b.invoiceCount - a.invoiceCount);
  }, [filteredInvoices, customers, salesReps, supervisors]);

  // العملاء الأكثر ديون
  const topCustomersByDebt = useMemo(() => {
    return customers
      .filter((c) => getBalance(c.id, Number(c.currentBalance || 0)) > 0)
      .map((c) => {
        const rep = salesReps.find((r) => r.id === (c as any).salesRepId);
        const supervisor = rep ? supervisors.find((s) => s.id === rep.supervisorId) : undefined;
        return {
          id: c.id,
          name: c.name,
          phone: c.phone || "-",
          debt: getBalance(c.id, Number(c.currentBalance) || 0),
          creditLimit: Number(c.creditLimit) || 0,
          supervisorName: supervisor?.name || "-",
          salesRepName: rep?.name || "-",
        };
      })
      .sort((a, b) => b.debt - a.debt)
      .sort((a, b) => b.debt - a.debt);

  }, [customers, getBalance, salesReps, supervisors]);

  // مبيعات حسب الفئات
  const salesByCategory = useMemo(() => {
    const categorySales = new Map<string, { name: string; total: number; quantity: number }>();

    filteredInvoices.forEach((inv) => {
      inv.items?.forEach((item) => {
        const product = products.find((p) => p.id === item.productId);
        const category = categories.find((c) => c.name === product?.category);
        const categoryId = category?.id || "uncategorized";
        const categoryName = category?.name || product?.category || "غير مصنف";

        const existing = categorySales.get(categoryId) || {
          name: categoryName,
          total: 0,
          quantity: 0,
        };
        categorySales.set(categoryId, {
          name: categoryName,
          total: existing.total + Number(item.total || 0),
          quantity: existing.quantity + Number(item.quantity || 0),
        });
      });
    });

    return Array.from(categorySales.values()).sort((a, b) => b.total - a.total);
  }, [filteredInvoices, products, categories]);

  // Pagination for all tabs
  const productsPagination = usePagination(topProducts, { resetDeps: [startDate, endDate, selectedEmployee, selectedPaymentMethod, selectedCategory, selectedCustomer, selectedSupervisor, selectedSalesRep] });
  const customersPagination = usePagination(topCustomers, { resetDeps: [startDate, endDate, selectedEmployee, selectedPaymentMethod, selectedCategory, selectedCustomer, selectedSupervisor, selectedSalesRep] });
  const paymentsPagination = usePagination(topCustomersByPayments, { resetDeps: [startDate, endDate, selectedEmployee, selectedPaymentMethod, selectedCategory, selectedCustomer, selectedSupervisor, selectedSalesRep] });
  const collectionsPagination = usePagination(collectionRecords, { resetDeps: [startDate, endDate, selectedEmployee, selectedPaymentMethod, selectedCategory, selectedCustomer, selectedSupervisor, selectedSalesRep] });
  const customerInvoicesPagination = usePagination(customerInvoicesSummary, { resetDeps: [startDate, endDate, selectedEmployee, selectedPaymentMethod, selectedCategory, selectedCustomer, selectedSupervisor, selectedSalesRep] });
  const debtsPagination = usePagination(topCustomersByDebt, { resetDeps: [startDate, endDate, selectedEmployee, selectedPaymentMethod, selectedCategory, selectedCustomer, selectedSupervisor, selectedSalesRep] });
  const invoicesPagination = usePagination(filteredInvoices, { resetDeps: [startDate, endDate, selectedEmployee, selectedPaymentMethod, selectedCategory, selectedCustomer, selectedSupervisor, selectedSalesRep] });
  const categoriesPagination = usePagination(salesByCategory, { resetDeps: [startDate, endDate, selectedEmployee, selectedPaymentMethod, selectedCategory, selectedCustomer, selectedSupervisor, selectedSalesRep] });

  // مبيعات يومية (آخر 7 أيام)
  const dailySales = useMemo(() => {
    const salesByDay = new Map<string, number>();
    const end = new Date(endDate);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split("T")[0];
      salesByDay.set(dateStr, 0);
    }

    filteredInvoices.forEach((inv) => {
      const dateStr = inv.createdAt.split("T")[0];
      if (salesByDay.has(dateStr)) {
        salesByDay.set(dateStr, (salesByDay.get(dateStr) || 0) + Number(inv.total || 0));
      }
    });

    return Array.from(salesByDay.entries()).map(([date, total]) => ({
      date: new Date(date).toLocaleDateString("ar-EG", {
        month: "short",
        day: "numeric",
      }),
      total,
    }));
  }, [filteredInvoices, endDate]);

  // أداء الموظفين
  const employeePerformance = useMemo(() => {
    const empSales = new Map<
      string,
      { name: string; sales: number; count: number }
    >();

    filteredInvoices.forEach((inv) => {
      const emp = employees.find((e) => e.id === inv.userId);
      const empId = inv.userId || "unknown";
      const empName = inv.userName || emp?.name || "غير محدد";

      const existing = empSales.get(empId) || {
        name: empName,
        sales: 0,
        count: 0,
      };
      empSales.set(empId, {
        name: empName,
        sales: existing.sales + Number(inv.total || 0),
        count: existing.count + 1,
      });
    });

    return Array.from(empSales.values()).sort((a, b) => b.sales - a.sales);
  }, [filteredInvoices, employees]);

  // مقارنة بالفترة السابقة
  const previousPeriodComparison = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysDiff = Math.ceil(
      (end.getTime() - start.getTime()) / (1000 * 3600 * 24)
    );

    const prevStart = new Date(start);
    prevStart.setDate(prevStart.getDate() - daysDiff);
    const prevEnd = new Date(end);
    prevEnd.setDate(prevEnd.getDate() - daysDiff);

    const previousInvoices = invoices.filter((inv) => {
      const invDate = new Date(inv.createdAt);
      return invDate >= prevStart && invDate <= prevEnd;
    });

    const prevTotalSales = previousInvoices.reduce(
      (sum, inv) => sum + Number(inv.total || 0),
      0
    );
    const salesChange =
      prevTotalSales > 0
        ? ((totalSales - prevTotalSales) / prevTotalSales) * 100
        : 0;

    const prevInvoiceCount = previousInvoices.length;
    const countChange =
      prevInvoiceCount > 0
        ? ((invoiceCount - prevInvoiceCount) / prevInvoiceCount) * 100
        : 0;

    return {
      salesChange,
      countChange,
      prevTotalSales,
      prevInvoiceCount,
    };
  }, [invoices, startDate, endDate, totalSales, invoiceCount]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <POSHeader />
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p>جاري تحميل التقارير...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <POSHeader />

      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">التقارير والتحليلات</h1>
            <p className="text-muted-foreground">تحليل شامل لأداء الأعمال</p>
          </div>
        </div>

        {/* Filters Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              الفلاتر والتصفية
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div>
                <Label>من تاريخ</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div>
                <Label>إلى تاريخ</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>

              <div>
                <Label>الموظف</Label>
                <Select
                  value={selectedEmployee}
                  onValueChange={setSelectedEmployee}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="الكل" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    {employees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>طريقة الدفع</Label>
                <Select
                  value={selectedPaymentMethod}
                  onValueChange={setSelectedPaymentMethod}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="الكل" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    {paymentMethods.map((pm) => (
                      <SelectItem key={pm.id} value={pm.id}>
                        {pm.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>الفئة</Label>
                <Select
                  value={selectedCategory}
                  onValueChange={setSelectedCategory}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="الكل" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>العميل</Label>
                <Select
                  value={selectedCustomer}
                  onValueChange={setSelectedCustomer}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="الكل" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    {customers.map((cust) => (
                      <SelectItem key={cust.id} value={cust.id}>
                        {cust.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>المشرف</Label>
                <Select
                  value={selectedSupervisor}
                  onValueChange={setSelectedSupervisor}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="الكل" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    {supervisors.map((sup) => (
                      <SelectItem key={sup.id} value={sup.id}>
                        {sup.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>المندوب</Label>
                <Select
                  value={selectedSalesRep}
                  onValueChange={setSelectedSalesRep}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="الكل" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    {salesReps.map((rep) => (
                      <SelectItem key={rep.id} value={rep.id}>
                        {rep.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KPIs Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                إجمالي المبيعات
              </CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(totalSales)}
              </div>
              <div className="flex items-center text-xs text-muted-foreground mt-1">
                {previousPeriodComparison.salesChange >= 0 ? (
                  <>
                    <ArrowUpRight className="h-3 w-3 text-green-500" />
                    <span className="text-green-500">
                      +{previousPeriodComparison.salesChange.toFixed(1)}%
                    </span>
                  </>
                ) : (
                  <>
                    <ArrowDownRight className="h-3 w-3 text-red-500" />
                    <span className="text-red-500">
                      {previousPeriodComparison.salesChange.toFixed(1)}%
                    </span>
                  </>
                )}
                <span className="mr-1">عن الفترة السابقة</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">صافي الربح</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-bold ${netProfit >= 0 ? "text-green-600" : "text-red-600"
                  }`}
              >
                {formatCurrency(netProfit)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                بعد المصروفات والمرتجعات
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                عدد الفواتير
              </CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{invoiceCount}</div>
              <div className="flex items-center text-xs text-muted-foreground mt-1">
                {previousPeriodComparison.countChange >= 0 ? (
                  <>
                    <ArrowUpRight className="h-3 w-3 text-green-500" />
                    <span className="text-green-500">
                      +{previousPeriodComparison.countChange.toFixed(1)}%
                    </span>
                  </>
                ) : (
                  <>
                    <ArrowDownRight className="h-3 w-3 text-red-500" />
                    <span className="text-red-500">
                      {previousPeriodComparison.countChange.toFixed(1)}%
                    </span>
                  </>
                )}
                <span className="mr-1">عن الفترة السابقة</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                متوسط الفاتورة
              </CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(avgInvoiceValue)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                القيمة المتوسطة للفاتورة
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                إجمالي المدفوعات
              </CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(totalPayments)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                المبالغ المحصلة من الفواتير
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* المبيعات اليومية */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                المبيعات اليومية (آخر 7 أيام)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dailySales}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip
                    formatter={(value) => formatCurrency(value as number)}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="total"
                    name="المبيعات"
                    stroke={chartColors[0]}
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* المبيعات حسب طريقة الدفع */}
          {/* <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PieChartIcon className="h-5 w-5" />
                المبيعات حسب طريقة الدفع
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={salesByPaymentMethod}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) =>
                      `${name} (${(percent * 100).toFixed(0)}%)`
                    }
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="amount"
                  >
                    {salesByPaymentMethod.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={chartColors[index % chartColors.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => formatCurrency(value as number)}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card> */}

          {/* المبيعات حسب الفئات */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                المبيعات حسب الفئات
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={salesByCategory.slice(0, 6)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip
                    formatter={(value) => formatCurrency(value as number)}
                  />
                  <Bar dataKey="total" name="المبيعات" fill={chartColors[1]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* أداء الموظفين */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                أداء الموظفين
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={employeePerformance.slice(0, 5)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip
                    formatter={(value) => formatCurrency(value as number)}
                  />
                  <Bar dataKey="sales" name="المبيعات" fill={chartColors[0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Tables */}
        <Tabs defaultValue="products" className="w-full">
          <TabsList className="grid w-full grid-cols-8">
            <TabsTrigger value="products">المنتجات</TabsTrigger>
            <TabsTrigger value="customers">العملاء</TabsTrigger>
            <TabsTrigger value="payments">المدفوعات</TabsTrigger>
            <TabsTrigger value="collections">القبض</TabsTrigger>
            <TabsTrigger value="debts">المديونية</TabsTrigger>
            <TabsTrigger value="invoices">الفواتير</TabsTrigger>
            <TabsTrigger value="customerInvoices">فواتير العملاء</TabsTrigger>
            <TabsTrigger value="categories">الأقسام</TabsTrigger>
          </TabsList>

          <TabsContent value="products" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>المنتجات ({topProducts.length})</CardTitle>
                <ExportButtons
                  title="تقرير المنتجات"
                  subtitle={`من ${formatDate(startDate)} إلى ${formatDate(
                    endDate
                  )}`}
                  fileName={`products-${startDate}-${endDate}`}
                  data={topProducts}
                  columns={[
                    { header: "المنتج", dataKey: "name" },
                    { header: "الفئة", dataKey: "category" },
                    { header: "الكمية", dataKey: "quantity" },
                    { header: "الإجمالي", dataKey: "total" },
                  ]}
                  summary={[
                    { label: "إجمالي المبيعات", value: totalSales },
                    { label: "عدد المنتجات", value: topProducts.length },
                  ]}
                  orientation="landscape"
                />
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>المنتج</TableHead>
                      <TableHead>الفئة</TableHead>
                      <TableHead className="text-center">الكمية</TableHead>
                      <TableHead className="text-right">الإجمالي</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productsPagination.paginatedItems.map((product, index) => (
                      <TableRow key={index}>
                        <TableCell>{(productsPagination.currentPage - 1) * productsPagination.pageSize + index + 1}</TableCell>
                        <TableCell className="font-medium">
                          {product.name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{product.category}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {product.quantity}
                        </TableCell>
                        <TableCell className="text-right font-bold text-green-600">
                          {formatCurrency(product.total)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <DataPagination
                  currentPage={productsPagination.currentPage}
                  totalPages={productsPagination.totalPages}
                  totalItems={productsPagination.totalItems}
                  pageSize={productsPagination.pageSize}
                  entityName="منتج"
                  getVisiblePages={productsPagination.getVisiblePages}
                  goToPage={productsPagination.goToPage}
                  goToNext={productsPagination.goToNext}
                  goToPrev={productsPagination.goToPrev}
                  changePageSize={productsPagination.changePageSize}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="customers" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>العملاء ({topCustomers.length})</CardTitle>
                <ExportButtons
                  title="تقرير العملاء"
                  subtitle={`من ${formatDate(startDate)} إلى ${formatDate(
                    endDate
                  )}`}
                  fileName={`customers-${startDate}-${endDate}`}
                  data={topCustomers}
                  columns={[
                    { header: "اسم العميل", dataKey: "name" },
                    { header: "رقم الهاتف", dataKey: "phone" },
                    { header: "عدد الفواتير", dataKey: "count" },
                    { header: "الإجمالي", dataKey: "total" },
                  ]}
                  summary={[
                    { label: "إجمالي المبيعات", value: totalSales },
                    { label: "عدد العملاء", value: topCustomers.length },
                  ]}
                />
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>اسم العميل</TableHead>
                      <TableHead>رقم الهاتف</TableHead>
                      <TableHead className="text-center">
                        عدد الفواتير
                      </TableHead>
                      <TableHead className="text-right">الإجمالي</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customersPagination.paginatedItems.map((customer, index) => (
                      <TableRow key={index}>
                        <TableCell>{(customersPagination.currentPage - 1) * customersPagination.pageSize + index + 1}</TableCell>
                        <TableCell className="font-medium">
                          {customer.name}
                        </TableCell>
                        <TableCell>{customer.phone}</TableCell>
                        <TableCell className="text-center">
                          {customer.count}
                        </TableCell>
                        <TableCell className="text-right font-bold text-green-600">
                          {formatCurrency(customer.total)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <DataPagination
                  currentPage={customersPagination.currentPage}
                  totalPages={customersPagination.totalPages}
                  totalItems={customersPagination.totalItems}
                  pageSize={customersPagination.pageSize}
                  entityName="عميل"
                  getVisiblePages={customersPagination.getVisiblePages}
                  goToPage={customersPagination.goToPage}
                  goToNext={customersPagination.goToNext}
                  goToPrev={customersPagination.goToPrev}
                  changePageSize={customersPagination.changePageSize}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payments" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>مدفوعات العملاء ({topCustomersByPayments.length})</CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      printCustomerPaymentsReport(
                        topCustomersByPayments.map((c) => ({
                          customerName: c.name,
                          paymentCount: c.count,
                          paymentValue: c.totalPaid,
                          supervisorName: c.supervisorName,
                        })),
                        {
                          dateFrom: formatDate(startDate),
                          dateTo: formatDate(endDate),
                          totalPayments: topCustomersByPayments.reduce((sum, c) => sum + c.totalPaid, 0),
                          totalCustomers: topCustomersByPayments.length,
                          totalOperations: topCustomersByPayments.reduce((sum, c) => sum + c.count, 0),
                        }
                      );
                    }}
                  >
                    <FileText className="h-4 w-4 ml-1" />
                    طباعة التقرير
                  </Button>
                  <ExportButtons
                    title="مدفوعات العملاء"
                    subtitle={`من ${formatDate(startDate)} إلى ${formatDate(endDate)}`}
                    fileName={`customers-payments-${startDate}-${endDate}`}
                    data={topCustomersByPayments.map((c) => ({
                      customerName: c.name,
                      paymentCount: c.count,
                      paymentValue: c.totalPaid,
                      supervisorName: c.supervisorName,
                    }))}
                    columns={[
                      { header: "اسم العميل", dataKey: "customerName" },
                      { header: "عدد عمليات الدفع", dataKey: "paymentCount" },
                      { header: "قيمة المدفوعات", dataKey: "paymentValue" },
                      { header: "المشرف", dataKey: "supervisorName" },
                    ]}
                    summary={[
                      { label: "إجمالي المدفوعات", value: topCustomersByPayments.reduce((sum, c) => sum + c.totalPaid, 0) },
                      { label: "عدد العملاء", value: topCustomersByPayments.length },
                      { label: "عدد العمليات", value: topCustomersByPayments.reduce((sum, c) => sum + c.count, 0) },
                    ]}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>اسم العميل</TableHead>
                      <TableHead className="text-center">عدد عمليات الدفع</TableHead>
                      <TableHead className="text-center">قيمة المدفوعات</TableHead>
                      <TableHead className="text-center">المشرف</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentsPagination.paginatedItems.map((customer, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">
                          {customer.name}
                        </TableCell>
                        <TableCell className="text-center">
                          {customer.count}
                        </TableCell>
                        <TableCell className="text-center font-bold text-green-600">
                          {formatCurrency(customer.totalPaid)}
                        </TableCell>
                        <TableCell className="text-center">{customer.supervisorName}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <DataPagination
                  currentPage={paymentsPagination.currentPage}
                  totalPages={paymentsPagination.totalPages}
                  totalItems={paymentsPagination.totalItems}
                  pageSize={paymentsPagination.pageSize}
                  entityName="عميل"
                  getVisiblePages={paymentsPagination.getVisiblePages}
                  goToPage={paymentsPagination.goToPage}
                  goToNext={paymentsPagination.goToNext}
                  goToPrev={paymentsPagination.goToPrev}
                  changePageSize={paymentsPagination.changePageSize}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="collections" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>عمليات القبض ({collectionRecords.length})</CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      printCollectionReport(
                        collectionRecords,
                        {
                          dateFrom: formatDate(startDate),
                          dateTo: formatDate(endDate),
                          totalOperations: collectionRecords.length,
                          totalAmount: collectionRecords.reduce((sum, c) => sum + c.amount, 0),
                        }
                      );
                    }}
                  >
                    <FileText className="h-4 w-4 ml-1" />
                    طباعة التقرير
                  </Button>
                  <ExportButtons
                    title="تقرير عمليات القبض"
                    subtitle={`من ${formatDate(startDate)} إلى ${formatDate(endDate)}`}
                    fileName={`collections-${startDate}-${endDate}`}
                    data={collectionRecords}
                    columns={[
                      { header: "اسم العميل", dataKey: "customerName" },
                      { header: "المبلغ", dataKey: "amount" },
                      { header: "رصيد العميل الحالي", dataKey: "currentBalance" },
                      { header: "رقم العملية", dataKey: "operationId" },
                      { header: "التاريخ", dataKey: "date" },
                      { header: "ملاحظات", dataKey: "notes" },
                      { header: "المشرف", dataKey: "supervisorName" },
                    ]}
                    summary={[
                      { label: "إجمالي العمليات", value: collectionRecords.length },
                      { label: "إجمالي المبلغ", value: collectionRecords.reduce((sum, c) => sum + c.amount, 0) },
                    ]}
                    orientation="landscape"
                  />
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>اسم العميل</TableHead>
                      <TableHead className="text-center">المبلغ</TableHead>
                      <TableHead className="text-center">رصيد العميل الحالي</TableHead>
                      <TableHead className="text-center">رقم العملية</TableHead>
                      <TableHead className="text-center">التاريخ</TableHead>
                      <TableHead className="text-center">ملاحظات</TableHead>
                      <TableHead className="text-center">المشرف</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {collectionsPagination.paginatedItems.map((record, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{record.customerName}</TableCell>
                        <TableCell className="text-center">{formatCurrency(record.amount)}</TableCell>
                        <TableCell className="text-center">{formatCurrency(record.currentBalance)}</TableCell>
                        <TableCell className="text-center text-xs">{record.operationId}</TableCell>
                        <TableCell className="text-center">{record.date}</TableCell>
                        <TableCell className="text-center">{record.notes}</TableCell>
                        <TableCell className="text-center">{record.supervisorName}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <DataPagination
                  currentPage={collectionsPagination.currentPage}
                  totalPages={collectionsPagination.totalPages}
                  totalItems={collectionsPagination.totalItems}
                  pageSize={collectionsPagination.pageSize}
                  entityName="عملية"
                  getVisiblePages={collectionsPagination.getVisiblePages}
                  goToPage={collectionsPagination.goToPage}
                  goToNext={collectionsPagination.goToNext}
                  goToPrev={collectionsPagination.goToPrev}
                  changePageSize={collectionsPagination.changePageSize}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="debts" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>مديونية العملاء ({topCustomersByDebt.length})</CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      printCustomerDebtReport(
                        topCustomersByDebt.map((c) => ({
                          name: c.name,
                          balance: c.debt,
                          supervisorName: c.supervisorName,
                          salesRepName: c.salesRepName,
                        })),
                        {
                          supervisorFilter: selectedSupervisor !== "all" ? supervisors.find(s => s.id === selectedSupervisor)?.name : undefined,
                          totalDebt: topCustomersByDebt.reduce((sum, c) => sum + c.debt, 0),
                        }
                      );
                    }}
                  >
                    <FileText className="h-4 w-4 ml-1" />
                    طباعة التقرير
                  </Button>
                  <ExportButtons
                    title="تقرير مديونية العملاء"
                    subtitle={`حتى ${formatDate(endDate)}`}
                    fileName={`customers-debts-${endDate}`}
                    data={topCustomersByDebt.map((c) => ({
                      name: c.name,
                      balance: c.debt,
                      supervisorName: c.supervisorName,
                      salesRepName: c.salesRepName,
                    }))}
                    columns={[
                      { header: "اسم الحساب", dataKey: "name" },
                      { header: "الرصيد الحالي", dataKey: "balance" },
                      { header: "المشرف", dataKey: "supervisorName" },
                      { header: "المندوب", dataKey: "salesRepName" },
                    ]}
                    summary={[
                      { label: "إجمالي المديونية", value: topCustomersByDebt.reduce((sum, c) => sum + c.debt, 0) },
                      { label: "عدد العملاء المدينين", value: topCustomersByDebt.length },
                    ]}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>اسم الحساب</TableHead>
                      <TableHead className="text-center">الرصيد الحالي</TableHead>
                      <TableHead className="text-center">المشرف</TableHead>
                      <TableHead className="text-center">المندوب</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {debtsPagination.paginatedItems.map((customer, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">
                          {customer.name}
                        </TableCell>
                        <TableCell className="text-center font-bold text-red-600">
                          {formatCurrency(customer.debt)}
                        </TableCell>
                        <TableCell className="text-center">{customer.supervisorName}</TableCell>
                        <TableCell className="text-center">{customer.salesRepName}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <DataPagination
                  currentPage={debtsPagination.currentPage}
                  totalPages={debtsPagination.totalPages}
                  totalItems={debtsPagination.totalItems}
                  pageSize={debtsPagination.pageSize}
                  entityName="عميل"
                  getVisiblePages={debtsPagination.getVisiblePages}
                  goToPage={debtsPagination.goToPage}
                  goToNext={debtsPagination.goToNext}
                  goToPrev={debtsPagination.goToPrev}
                  changePageSize={debtsPagination.changePageSize}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="invoices" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>الفواتير ({filteredInvoices.length})</CardTitle>
                <ExportButtons
                  title="تقرير الفواتير"
                  subtitle={`من ${formatDate(startDate)} إلى ${formatDate(
                    endDate
                  )}`}
                  fileName={`invoices-${startDate}-${endDate}`}
                  data={filteredInvoices.map((inv) => ({
                    id: inv.id,
                    date: formatDate(inv.createdAt),
                    customer: inv.customerName || (inv.customerId ? customers.find(c => c.id === inv.customerId)?.name : null) || "عميل نقدي",
                    employee: inv.userName || "-",
                    total: Number(inv.total) || 0,
                    status:
                      inv.paymentStatus === "paid"
                        ? "مدفوعة"
                        : inv.paymentStatus === "partial"
                          ? "جزئي"
                          : "غير مدفوعة",
                  }))}
                  columns={[
                    { header: "رقم الفاتورة", dataKey: "id" },
                    { header: "التاريخ", dataKey: "date" },
                    { header: "العميل", dataKey: "customer" },
                    { header: "الموظف", dataKey: "employee" },
                    { header: "الحالة", dataKey: "status" },
                    { header: "الإجمالي", dataKey: "total" },
                  ]}
                  summary={[
                    { label: "إجمالي المبيعات", value: totalSales },
                    { label: "عدد الفواتير", value: filteredInvoices.length },
                    { label: "متوسط الفاتورة", value: avgInvoiceValue },
                  ]}
                  orientation="landscape"
                />
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>رقم الفاتورة</TableHead>
                      <TableHead>التاريخ</TableHead>
                      <TableHead>العميل</TableHead>
                      <TableHead>الموظف</TableHead>
                      <TableHead>الحالة</TableHead>
                      <TableHead className="text-right">الإجمالي</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoicesPagination.paginatedItems.map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-medium">
                          #{invoice.id}
                        </TableCell>
                        <TableCell>{formatDate(invoice.createdAt)}</TableCell>
                        <TableCell>
                          {invoice.customerName || (invoice.customerId ? customers.find(c => c.id === invoice.customerId)?.name : null) || "عميل نقدي"}
                        </TableCell>
                        <TableCell>{invoice.userName || "-"}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              invoice.paymentStatus === "paid"
                                ? "default"
                                : invoice.paymentStatus === "partial"
                                  ? "secondary"
                                  : "destructive"
                            }
                          >
                            {invoice.paymentStatus === "paid"
                              ? "مدفوعة"
                              : invoice.paymentStatus === "partial"
                                ? "جزئي"
                                : "غير مدفوعة"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          {formatCurrency(invoice.total)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <DataPagination
                  currentPage={invoicesPagination.currentPage}
                  totalPages={invoicesPagination.totalPages}
                  totalItems={invoicesPagination.totalItems}
                  pageSize={invoicesPagination.pageSize}
                  entityName="فاتورة"
                  getVisiblePages={invoicesPagination.getVisiblePages}
                  goToPage={invoicesPagination.goToPage}
                  goToNext={invoicesPagination.goToNext}
                  goToPrev={invoicesPagination.goToPrev}
                  changePageSize={invoicesPagination.changePageSize}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="customerInvoices" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>فواتير العملاء ({customerInvoicesSummary.length})</CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      printCustomerInvoicesReport(
                        customerInvoicesSummary,
                        {
                          dateFrom: formatDate(startDate),
                          dateTo: formatDate(endDate),
                          totalSales: customerInvoicesSummary.reduce((sum, c) => sum + c.invoiceValue, 0),
                          totalCustomers: customerInvoicesSummary.length,
                        }
                      );
                    }}
                  >
                    <FileText className="h-4 w-4 ml-1" />
                    طباعة التقرير
                  </Button>
                  <ExportButtons
                    title="فواتير العملاء"
                    subtitle={`من ${formatDate(startDate)} إلى ${formatDate(endDate)}`}
                    fileName={`customer-invoices-${startDate}-${endDate}`}
                    data={customerInvoicesSummary}
                    columns={[
                      { header: "اسم العميل", dataKey: "customerName" },
                      { header: "عدد الفواتير", dataKey: "invoiceCount" },
                      { header: "قيمة الفوتير", dataKey: "invoiceValue" },
                      { header: "المشرف", dataKey: "supervisorName" },
                    ]}
                    summary={[
                      { label: "إجمالي المبيعات", value: customerInvoicesSummary.reduce((sum, c) => sum + c.invoiceValue, 0) },
                      { label: "عدد العملاء", value: customerInvoicesSummary.length },
                    ]}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>اسم العميل</TableHead>
                      <TableHead className="text-center">عدد الفواتير</TableHead>
                      <TableHead className="text-center">قيمة الفوتير</TableHead>
                      <TableHead className="text-center">المشرف</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customerInvoicesPagination.paginatedItems.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{item.customerName}</TableCell>
                        <TableCell className="text-center">{item.invoiceCount}</TableCell>
                        <TableCell className="text-center font-bold text-green-600">
                          {formatCurrency(item.invoiceValue)}
                        </TableCell>
                        <TableCell className="text-center">{item.supervisorName}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <DataPagination
                  currentPage={customerInvoicesPagination.currentPage}
                  totalPages={customerInvoicesPagination.totalPages}
                  totalItems={customerInvoicesPagination.totalItems}
                  pageSize={customerInvoicesPagination.pageSize}
                  entityName="عميل"
                  getVisiblePages={customerInvoicesPagination.getVisiblePages}
                  goToPage={customerInvoicesPagination.goToPage}
                  goToNext={customerInvoicesPagination.goToNext}
                  goToPrev={customerInvoicesPagination.goToPrev}
                  changePageSize={customerInvoicesPagination.changePageSize}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="categories" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>الأقسام ({salesByCategory.length})</CardTitle>
                <ExportButtons
                  title="تقرير مبيعات الأقسام"
                  subtitle={`من ${formatDate(startDate)} إلى ${formatDate(endDate)}`}
                  fileName={`sales-by-category-${startDate}-${endDate}`}
                  data={salesByCategory}
                  columns={[
                    { header: "القسم", dataKey: "name" },
                    { header: "عدد القطع", dataKey: "quantity" },
                    { header: "إجمالي المبيعات", dataKey: "total" },
                  ]}
                  summary={[
                    { label: "إجمالي المبيعات", value: salesByCategory.reduce((sum, c) => sum + c.total || 0, 0) },
                    { label: "عدد الأقسام", value: salesByCategory.length },
                  ]}
                />
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>القسم</TableHead>
                      <TableHead className="text-center">عدد القطع</TableHead>
                      <TableHead className="text-right">إجمالي المبيعات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categoriesPagination.paginatedItems.map((category, index) => (
                      <TableRow key={index}>
                        <TableCell>{(categoriesPagination.currentPage - 1) * categoriesPagination.pageSize + index + 1}</TableCell>
                        <TableCell className="font-medium">
                          {category.name}
                        </TableCell>
                        <TableCell className="text-center">
                          {category.quantity}
                        </TableCell>
                        <TableCell className="text-right font-bold text-green-600">
                          {formatCurrency(category.total)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <DataPagination
                  currentPage={categoriesPagination.currentPage}
                  totalPages={categoriesPagination.totalPages}
                  totalItems={categoriesPagination.totalItems}
                  pageSize={categoriesPagination.pageSize}
                  entityName="قسم"
                  getVisiblePages={categoriesPagination.getVisiblePages}
                  goToPage={categoriesPagination.goToPage}
                  goToNext={categoriesPagination.goToNext}
                  goToPrev={categoriesPagination.goToPrev}
                  changePageSize={categoriesPagination.changePageSize}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Reports;
