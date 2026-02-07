/**
 * SalesRepReport - تقرير مبيعات المندوبين حسب القسم
 * عرض مبيعات كل مندوب مفصلة حسب أقسام المنتجات
 */
import { useState, useEffect, useMemo } from "react";
import { POSHeader } from "@/components/POS/POSHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import {
    Users,
    TrendingUp,
    Package,
    Calendar,
    Download,
    Filter,
    DollarSign,
    BarChart3,
} from "lucide-react";
import {
    db,
    Invoice,
    InvoiceItem,
    Product,
    ProductCategory,
    Supervisor,
    SalesRep,
} from "@/shared/lib/indexedDB";
import { useSettingsContext } from "@/contexts/SettingsContext";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface RepSalesData {
    repId: string;
    repName: string;
    supervisorName: string;
    totalSales: number;
    invoiceCount: number;
    categorySales: Record<string, { categoryName: string; total: number; quantity: number }>;
}

export default function SalesRepReport() {
    const { getSetting } = useSettingsContext();
    const currency = getSetting("currency") || "EGP";

    // Data
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<ProductCategory[]>([]);
    const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
    const [salesReps, setSalesReps] = useState<SalesRep[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Filters
    const currentYear = new Date().getFullYear();
    const [dateFrom, setDateFrom] = useState(`${currentYear}-01-01`);
    const [dateTo, setDateTo] = useState(new Date().toISOString().split("T")[0]);
    const [selectedSupervisor, setSelectedSupervisor] = useState<string>("all");
    const [selectedCategory, setSelectedCategory] = useState<string>("all");

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [invs, prods, cats, sups, reps] = await Promise.all([
                db.getAll<Invoice>("invoices"),
                db.getAll<Product>("products"),
                db.getAll<ProductCategory>("productCategories"),
                db.getAll<Supervisor>("supervisors"),
                db.getAll<SalesRep>("salesReps"),
            ]);
            setInvoices(invs);
            setProducts(prods);
            setCategories(cats);
            setSupervisors(sups);
            setSalesReps(reps);
        } catch (error) {
            console.error("Error loading data:", error);
            toast.error("خطأ في تحميل البيانات");
        } finally {
            setIsLoading(false);
        }
    };

    // Process sales data
    const repSalesData = useMemo(() => {
        const result: Record<string, RepSalesData> = {};

        // Filter invoices by date
        const filteredInvoices = invoices.filter((inv) => {
            const invDate = new Date(inv.createdAt || "");
            const start = new Date(dateFrom);
            const end = new Date(dateTo);
            end.setHours(23, 59, 59, 999);
            // Only include regular invoices (sales invoices are stored in invoices table, returns in salesReturns)
            return invDate >= start && invDate <= end;
        });

        // Build product -> category map
        const productCategoryMap: Record<string, string> = {};
        products.forEach((p) => {
            productCategoryMap[p.id] = p.categoryId ? String(p.categoryId) : "";
        });

        // Build category name map
        const categoryNameMap: Record<string, string> = { "": "بدون تصنيف" };
        categories.forEach((c) => {
            categoryNameMap[c.id] = c.name;
        });

        // Build rep -> supervisor map
        const repSupervisorMap: Record<string, string> = {};
        salesReps.forEach((rep) => {
            repSupervisorMap[rep.id] = rep.supervisorId || "";
        });

        // Build supervisor name map
        const supervisorNameMap: Record<string, string> = {};
        supervisors.forEach((sup) => {
            supervisorNameMap[sup.id] = sup.name;
        });

        // Build rep name map
        const repNameMap: Record<string, string> = {};
        salesReps.forEach((rep) => {
            repNameMap[rep.id] = rep.name;
        });

        // Process invoices
        filteredInvoices.forEach((inv) => {
            const repId = inv.salesRepId || "";
            if (!repId) return; // Skip invoices without sales rep

            // Filter by supervisor if selected
            if (selectedSupervisor !== "all") {
                const repSupervisor = repSupervisorMap[repId];
                if (repSupervisor !== selectedSupervisor) return;
            }

            // Initialize rep data if not exists
            if (!result[repId]) {
                const supId = repSupervisorMap[repId] || "";
                result[repId] = {
                    repId,
                    repName: repNameMap[repId] || "مندوب غير معروف",
                    supervisorName: supervisorNameMap[supId] || "بدون مشرف",
                    totalSales: 0,
                    invoiceCount: 0,
                    categorySales: {},
                };
            }

            result[repId].totalSales += inv.total || 0;
            result[repId].invoiceCount += 1;

            // Process invoice items
            const items = inv.items || [];
            let invoiceCategoryTotal = 0; // Track total for this invoice in selected category

            items.forEach((item: InvoiceItem) => {
                const productId = item.productId || "";
                const categoryId = productCategoryMap[productId] || "";

                // Filter by category if selected
                if (selectedCategory !== "all" && categoryId !== selectedCategory) return;

                const categoryName = categoryNameMap[categoryId] || "بدون تصنيف";

                if (!result[repId].categorySales[categoryId]) {
                    result[repId].categorySales[categoryId] = {
                        categoryName,
                        total: 0,
                        quantity: 0,
                    };
                }

                result[repId].categorySales[categoryId].total += item.total || 0;
                result[repId].categorySales[categoryId].quantity += item.quantity || 0;
                invoiceCategoryTotal += item.total || 0;
            });

            // When filtering by category, only add the category-filtered total
            if (selectedCategory !== "all") {
                result[repId].totalSales += invoiceCategoryTotal;
            }
        });

        // Convert to array, filter out reps with no sales when category is selected, and sort
        return Object.values(result)
            .filter(rep => selectedCategory === "all" || rep.totalSales > 0)
            .sort((a, b) => b.totalSales - a.totalSales);
    }, [invoices, products, categories, salesReps, supervisors, dateFrom, dateTo, selectedSupervisor, selectedCategory]);

    // Statistics
    const totalSales = repSalesData.reduce((sum, rep) => sum + rep.totalSales, 0);
    const totalInvoices = repSalesData.reduce((sum, rep) => sum + rep.invoiceCount, 0);
    const activeReps = repSalesData.length;

    // Export to Excel
    const exportToExcel = () => {
        const rows: any[] = [];

        repSalesData.forEach((rep) => {
            // Add rep row
            rows.push({
                "المندوب": rep.repName,
                "المشرف": rep.supervisorName,
                "القسم": "",
                "الكمية": "",
                "المبيعات": Math.round(rep.totalSales),
                "عدد الفواتير": rep.invoiceCount,
            });

            // Add category rows
            Object.values(rep.categorySales).forEach((cat) => {
                rows.push({
                    "المندوب": "",
                    "المشرف": "",
                    "القسم": cat.categoryName,
                    "الكمية": cat.quantity,
                    "المبيعات": Math.round(cat.total),
                    "عدد الفواتير": "",
                });
            });
        });

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "مبيعات المندوبين");
        XLSX.writeFile(wb, `تقرير_مبيعات_المندوبين_${dateFrom}_${dateTo}.xlsx`);
        toast.success("تم تصدير التقرير بنجاح");
    };

    return (
        <div className="min-h-screen bg-background" dir="rtl">
            <POSHeader />

            <div className="container mx-auto p-6">
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-3xl font-bold flex items-center gap-2">
                        <BarChart3 className="h-8 w-8 text-primary" />
                        تقرير مبيعات المندوبين حسب القسم
                    </h1>
                    <Button onClick={exportToExcel} className="gap-2">
                        <Download className="h-4 w-4" />
                        تصدير Excel
                    </Button>
                </div>

                {/* Filters */}
                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <Filter className="h-5 w-5" />
                            الفلاتر
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="space-y-2">
                                <Label className="flex items-center gap-1">
                                    <Calendar className="h-4 w-4" />
                                    من تاريخ
                                </Label>
                                <Input
                                    type="date"
                                    value={dateFrom}
                                    onChange={(e) => setDateFrom(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="flex items-center gap-1">
                                    <Calendar className="h-4 w-4" />
                                    إلى تاريخ
                                </Label>
                                <Input
                                    type="date"
                                    value={dateTo}
                                    onChange={(e) => setDateTo(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>المشرف</Label>
                                <Select value={selectedSupervisor} onValueChange={setSelectedSupervisor}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="جميع المشرفين" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">جميع المشرفين</SelectItem>
                                        {supervisors.map((sup) => (
                                            <SelectItem key={sup.id} value={sup.id}>
                                                {sup.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>القسم</Label>
                                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="جميع الأقسام" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">جميع الأقسام</SelectItem>
                                        {categories.map((cat) => (
                                            <SelectItem key={cat.id} value={cat.id}>
                                                {cat.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Statistics */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <Card className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">إجمالي المبيعات</p>
                                <p className="text-2xl font-bold text-green-600">
                                    {Math.round(totalSales).toLocaleString()} {currency}
                                </p>
                            </div>
                            <DollarSign className="h-8 w-8 text-green-600" />
                        </div>
                    </Card>
                    <Card className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">عدد الفواتير</p>
                                <p className="text-2xl font-bold">{totalInvoices.toLocaleString()}</p>
                            </div>
                            <TrendingUp className="h-8 w-8 text-blue-600" />
                        </div>
                    </Card>
                    <Card className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">المندوبين النشطين</p>
                                <p className="text-2xl font-bold">{activeReps}</p>
                            </div>
                            <Users className="h-8 w-8 text-primary" />
                        </div>
                    </Card>
                </div>

                {/* Sales Data */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Users className="h-5 w-5" />
                            مبيعات المندوبين
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="text-center py-8">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2" />
                                <p className="text-muted-foreground">جاري التحميل...</p>
                            </div>
                        ) : repSalesData.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                لا توجد بيانات مبيعات في هذه الفترة
                            </div>
                        ) : (
                            <Accordion type="multiple" className="w-full">
                                {repSalesData.map((rep, index) => (
                                    <AccordionItem key={rep.repId} value={rep.repId}>
                                        <AccordionTrigger className="hover:no-underline">
                                            <div className="flex items-center justify-between w-full pl-4">
                                                <div className="flex items-center gap-3">
                                                    <Badge variant="outline" className="w-8 h-8 flex items-center justify-center rounded-full">
                                                        {index + 1}
                                                    </Badge>
                                                    <div className="text-right">
                                                        <div className="font-bold">{rep.repName}</div>
                                                        <div className="text-xs text-muted-foreground">
                                                            المشرف: {rep.supervisorName}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <Badge variant="secondary">
                                                        {rep.invoiceCount} فاتورة
                                                    </Badge>
                                                    <span className="font-bold text-green-600">
                                                        {Math.round(rep.totalSales).toLocaleString()} {currency}
                                                    </span>
                                                </div>
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent>
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>القسم</TableHead>
                                                        <TableHead className="text-center">الكمية</TableHead>
                                                        <TableHead className="text-left">المبيعات</TableHead>
                                                        <TableHead className="text-left">النسبة</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {Object.values(rep.categorySales)
                                                        .sort((a, b) => b.total - a.total)
                                                        .map((cat) => (
                                                            <TableRow key={cat.categoryName}>
                                                                <TableCell className="flex items-center gap-2">
                                                                    <Package className="h-4 w-4 text-muted-foreground" />
                                                                    {cat.categoryName}
                                                                </TableCell>
                                                                <TableCell className="text-center">
                                                                    {cat.quantity.toLocaleString()}
                                                                </TableCell>
                                                                <TableCell className="text-left font-medium">
                                                                    {Math.round(cat.total).toLocaleString()} {currency}
                                                                </TableCell>
                                                                <TableCell className="text-left">
                                                                    <Badge variant="outline">
                                                                        {((cat.total / rep.totalSales) * 100).toFixed(1)}%
                                                                    </Badge>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                </TableBody>
                                            </Table>
                                        </AccordionContent>
                                    </AccordionItem>
                                ))}
                            </Accordion>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
