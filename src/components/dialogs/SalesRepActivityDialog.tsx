import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  FileText,
  Users,
  DollarSign,
  TrendingUp,
  Package,
  Loader2,
} from "lucide-react";
import { db } from "@/shared/lib/indexedDB";
import type { Invoice, Customer, SalesReturn } from "@/domain/entities/Index";

interface SalesRepActivityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  salesRep: {
    id: string;
    name: string;
    phone: string;
    commissionRate?: number;
  } | null;
}

interface ActivityData {
  invoices: Invoice[];
  customers: Customer[];
  salesReturns: SalesReturn[];
}

export function SalesRepActivityDialog({
  open,
  onOpenChange,
  salesRep,
}: SalesRepActivityDialogProps) {
  const [data, setData] = useState<ActivityData>({
    invoices: [],
    customers: [],
    salesReturns: [],
  });
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (open && salesRep) {
      loadActivityData(salesRep.id);
    }
    if (!open) {
      setSearchQuery("");
    }
  }, [open, salesRep]);

  const loadActivityData = async (repId: string) => {
    setLoading(true);
    try {
      const [allInvoices, allCustomers, allReturns] = await Promise.all([
        db.getAll<Invoice>("invoices"),
        db.getAll<Customer>("customers"),
        db.getAll<SalesReturn>("salesReturns"),
      ]);

      const repInvoices = allInvoices
        .filter((inv) => inv.salesRepId === repId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const repCustomers = allCustomers.filter((c) => c.salesRepId === repId);

      // Match returns by checking if their linked invoice belongs to this rep
      const repInvoiceIds = new Set(repInvoices.map((i) => i.id));
      const repReturns = allReturns
        .filter((r) => r.originalInvoiceId && repInvoiceIds.has(r.originalInvoiceId))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      setData({
        invoices: repInvoices,
        customers: repCustomers,
        salesReturns: repReturns,
      });
    } catch (error) {
      console.error("Error loading activity data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Stats
  const stats = useMemo(() => {
    const totalSales = data.invoices.reduce((sum, inv) => sum + inv.total, 0);
    const totalPaid = data.invoices.reduce((sum, inv) => sum + inv.paidAmount, 0);
    const totalRemaining = data.invoices.reduce((sum, inv) => sum + inv.remainingAmount, 0);
    const totalReturns = data.salesReturns.reduce((sum, r) => sum + (r.total || 0), 0);
    const commission = salesRep?.commissionRate
      ? (totalSales * salesRep.commissionRate) / 100
      : 0;

    return { totalSales, totalPaid, totalRemaining, totalReturns, commission };
  }, [data, salesRep]);

  // Filtered data based on search
  const filteredInvoices = useMemo(() => {
    if (!searchQuery) return data.invoices;
    const q = searchQuery.toLowerCase();
    return data.invoices.filter(
      (inv) =>
        inv.invoiceNumber?.toLowerCase().includes(q) ||
        inv.customerName?.toLowerCase().includes(q) ||
        inv.total.toString().includes(q)
    );
  }, [data.invoices, searchQuery]);

  const filteredCustomers = useMemo(() => {
    if (!searchQuery) return data.customers;
    const q = searchQuery.toLowerCase();
    return data.customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone?.includes(q)
    );
  }, [data.customers, searchQuery]);

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("ar-EG", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatCurrency = (amount: number) => {
    return amount.toLocaleString("ar-EG", { minimumFractionDigits: 2 });
  };

  if (!salesRep) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <Users className="h-5 w-5" />
            سجل المندوب: {salesRep.name}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Stats Summary */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200">
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">إجمالي المبيعات</p>
                  <p className="text-lg font-bold text-blue-600">{formatCurrency(stats.totalSales)}</p>
                </CardContent>
              </Card>
              <Card className="bg-green-50 dark:bg-green-950/30 border-green-200">
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">المحصّل</p>
                  <p className="text-lg font-bold text-green-600">{formatCurrency(stats.totalPaid)}</p>
                </CardContent>
              </Card>
              <Card className="bg-red-50 dark:bg-red-950/30 border-red-200">
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">المتبقي</p>
                  <p className="text-lg font-bold text-red-600">{formatCurrency(stats.totalRemaining)}</p>
                </CardContent>
              </Card>
              <Card className="bg-orange-50 dark:bg-orange-950/30 border-orange-200">
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">المرتجعات</p>
                  <p className="text-lg font-bold text-orange-600">{formatCurrency(stats.totalReturns)}</p>
                </CardContent>
              </Card>
              <Card className="bg-purple-50 dark:bg-purple-950/30 border-purple-200">
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">العمولة</p>
                  <p className="text-lg font-bold text-purple-600">
                    {salesRep.commissionRate ? formatCurrency(stats.commission) : "-"}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث في السجلات..."
                className="pr-10"
              />
            </div>

            {/* Tabs */}
            <Tabs defaultValue="invoices" className="flex-1 overflow-hidden flex flex-col">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="invoices" className="gap-1">
                  <FileText className="h-4 w-4" />
                  الفواتير ({data.invoices.length})
                </TabsTrigger>
                <TabsTrigger value="customers" className="gap-1">
                  <Users className="h-4 w-4" />
                  العملاء ({data.customers.length})
                </TabsTrigger>
                <TabsTrigger value="returns" className="gap-1">
                  <Package className="h-4 w-4" />
                  المرتجعات ({data.salesReturns.length})
                </TabsTrigger>
              </TabsList>

              {/* Invoices Tab */}
              <TabsContent value="invoices" className="flex-1 overflow-hidden mt-2">
                <ScrollArea className="h-[350px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>رقم الفاتورة</TableHead>
                        <TableHead>العميل</TableHead>
                        <TableHead>الإجمالي</TableHead>
                        <TableHead>المدفوع</TableHead>
                        <TableHead>المتبقي</TableHead>
                        <TableHead>الحالة</TableHead>
                        <TableHead>التاريخ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredInvoices.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                            لا توجد فواتير
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredInvoices.map((inv) => (
                          <TableRow key={inv.id}>
                            <TableCell className="font-mono">{inv.invoiceNumber || inv.id.slice(-6)}</TableCell>
                            <TableCell>{inv.customerName || "-"}</TableCell>
                            <TableCell className="font-medium">{formatCurrency(inv.total)}</TableCell>
                            <TableCell className="text-green-600">{formatCurrency(inv.paidAmount)}</TableCell>
                            <TableCell className="text-red-600">{formatCurrency(inv.remainingAmount)}</TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  inv.paymentStatus === "paid" ? "default" :
                                  inv.paymentStatus === "partial" ? "secondary" : "destructive"
                                }
                              >
                                {inv.paymentStatus === "paid" ? "مدفوعة" :
                                 inv.paymentStatus === "partial" ? "جزئي" : "غير مدفوعة"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">{formatDate(inv.createdAt)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </TabsContent>

              {/* Customers Tab */}
              <TabsContent value="customers" className="flex-1 overflow-hidden mt-2">
                <ScrollArea className="h-[350px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>اسم العميل</TableHead>
                        <TableHead>الهاتف</TableHead>
                        <TableHead>العنوان</TableHead>
                        <TableHead>الرصيد</TableHead>
                        <TableHead>حد الائتمان</TableHead>
                        <TableHead>تاريخ الإضافة</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCustomers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                            لا يوجد عملاء
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredCustomers.map((c) => (
                          <TableRow key={c.id}>
                            <TableCell className="font-medium">{c.name}</TableCell>
                            <TableCell>{c.phone || "-"}</TableCell>
                            <TableCell>{c.address || "-"}</TableCell>
                            <TableCell className={Number(c.currentBalance) > 0 ? "text-red-600 font-medium" : "text-green-600"}>
                              {formatCurrency(Number(c.currentBalance) || 0)}
                            </TableCell>
                            <TableCell>{formatCurrency(c.creditLimit || 0)}</TableCell>
                            <TableCell className="text-sm">{formatDate(c.createdAt)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </TabsContent>

              {/* Returns Tab */}
              <TabsContent value="returns" className="flex-1 overflow-hidden mt-2">
                <ScrollArea className="h-[350px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>رقم المرتجع</TableHead>
                        <TableHead>رقم الفاتورة</TableHead>
                        <TableHead>المبلغ</TableHead>
                        <TableHead>السبب</TableHead>
                        <TableHead>التاريخ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.salesReturns.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            لا توجد مرتجعات
                          </TableCell>
                        </TableRow>
                      ) : (
                        data.salesReturns.map((ret) => (
                          <TableRow key={ret.id}>
                            <TableCell className="font-mono">{ret.id.slice(-6)}</TableCell>
                            <TableCell className="font-mono">{ret.originalInvoiceId?.slice(-6) || "-"}</TableCell>
                            <TableCell className="text-orange-600 font-medium">
                              {formatCurrency(ret.total || 0)}
                            </TableCell>
                            <TableCell>{ret.reason || "-"}</TableCell>
                            <TableCell className="text-sm">{formatDate(ret.createdAt)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
