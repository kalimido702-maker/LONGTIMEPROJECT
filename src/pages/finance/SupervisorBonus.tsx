/**
 * SupervisorBonus - صفحة بونص المشرفين
 * لحساب وتطبيق البونص على المشرفين بناءً على مبيعات فريقهم
 */
import { useState, useEffect, useMemo } from "react";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
    Award,
    DollarSign,
    Users,
    Calendar,
    TrendingUp,
    Percent,
    UserCheck
} from "lucide-react";
import { db, Supervisor, SalesRep, Invoice, Product, ProductCategory, Customer } from "@/shared/lib/indexedDB";
import { useSettingsContext } from "@/contexts/SettingsContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { POSHeader } from "@/components/POS/POSHeader";

// نوع سجل بونص المشرف
interface SupervisorBonusRecord {
    id: string;
    supervisorId: string;
    supervisorName: string;
    periodStart: string;
    periodEnd: string;
    totalTeamSales: number;
    bonusPercentage: number;
    bonusAmount: number;
    createdAt: string;
    userId: string;
    userName: string;
    notes?: string;
    salesReps: { id: string; name: string; sales: number }[];
}

const SupervisorBonus = () => {
    const { getSetting } = useSettingsContext();
    const { user } = useAuth();
    const currency = getSetting("currency") || "ج.م";

    // States
    const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
    const [salesReps, setSalesReps] = useState<SalesRep[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<ProductCategory[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [selectedSupervisorId, setSelectedSupervisorId] = useState<string>("");
    const [dateFrom, setDateFrom] = useState<string>("");
    const [dateTo, setDateTo] = useState<string>("");
    const [useCategoryBonus, setUseCategoryBonus] = useState<boolean>(true);
    const [bonusPercentage, setBonusPercentage] = useState<string>("5");
    const [notes, setNotes] = useState<string>("");
    const [recentBonuses, setRecentBonuses] = useState<SupervisorBonusRecord[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Load data on mount
    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        await db.init();
        const allSupervisors = await db.getAll<Supervisor>("supervisors");
        const activeSupervisors = allSupervisors.filter(s => s.isActive);
        setSupervisors(activeSupervisors);

        const allSalesReps = await db.getAll<SalesRep>("salesReps");
        setSalesReps(allSalesReps);

        const allInvoices = await db.getAll<Invoice>("invoices");
        setInvoices(allInvoices);

        const allProducts = await db.getAll<Product>("products");
        setProducts(allProducts);

        const allCategories = await db.getAll<ProductCategory>("productCategories");
        setCategories(allCategories);

        const allCustomers = await db.getAll<Customer>("customers");
        setCustomers(allCustomers);

        loadRecentBonuses();
    };

    const loadRecentBonuses = () => {
        try {
            const saved = localStorage.getItem("supervisorBonuses");
            if (saved) {
                const bonuses = JSON.parse(saved) as SupervisorBonusRecord[];
                // ترتيب من الأحدث للأقدم
                setRecentBonuses(
                    bonuses.sort(
                        (a, b) =>
                            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                    )
                );
            }
        } catch (error) {
            console.error("Error loading bonuses:", error);
        }
    };

    // Get team members for selected supervisor
    const teamMembers = useMemo(() => {
        if (!selectedSupervisorId) return [];
        return salesReps.filter(rep => rep.supervisorId === selectedSupervisorId);
    }, [selectedSupervisorId, salesReps]);

    // Build product -> category name map (always resolve to display name)
    const productCategoryMap = useMemo(() => {
        // Build category ID → name lookup
        const catIdToName: Record<string, string> = {};
        categories.forEach(c => {
            catIdToName[String(c.id)] = c.nameAr || c.name || String(c.id);
        });

        const map: Record<string, string> = {};
        products.forEach(p => {
            // If product.category is a name (not matching any ID), use it directly
            // If it looks like an ID or is missing, resolve from categories
            const catName = p.category || "";
            const catId = String(p.categoryId || (p as any).category_id || "");
            
            // Check if category field already has a real name (not an ID)
            if (catName && !catIdToName[catName]) {
                // It's a real name, use it
                map[p.id] = catName;
            } else if (catName && catIdToName[catName]) {
                // category field contains an ID, resolve it
                map[p.id] = catIdToName[catName];
            } else if (catId && catIdToName[catId]) {
                // Use categoryId to resolve name
                map[p.id] = catIdToName[catId];
            } else {
                map[p.id] = catName || "";
            }
        });
        return map;
    }, [products, categories]);

    // Build category bonus map
    const categoryBonusMap = useMemo(() => {
        const map: Record<string, number> = {};
        categories.forEach(c => {
            // Match by name or id
            map[c.id] = c.bonusPercentage || 0;
            map[c.name] = c.bonusPercentage || 0;
            if (c.nameAr) map[c.nameAr] = c.bonusPercentage || 0;
        });
        return map;
    }, [categories]);

    // Build customer -> salesRepId map for backward compatibility
    const customerSalesRepMap = useMemo(() => {
        const map: Record<string, string> = {};
        customers.forEach(c => {
            if (c.salesRepId) {
                map[c.id] = c.salesRepId;
            }
        });
        return map;
    }, [customers]);

    // Calculate team sales for selected period
    const teamSalesData = useMemo(() => {
        if (!selectedSupervisorId || !dateFrom || !dateTo) {
            return { total: 0, byRep: [] as { id: string; name: string; sales: number }[], categoryBonus: 0, byCategorySales: {} as Record<string, { sales: number; bonus: number; percentage: number }> };
        }

        const startDate = new Date(dateFrom);
        const endDate = new Date(dateTo + "T23:59:59");
        const teamRepIds = teamMembers.map(rep => rep.id);

        // Filter invoices by period and team members
        // Check invoice.salesRepId first, then fall back to customer.salesRepId for older invoices
        const periodInvoices = invoices.filter(inv => {
            const invDate = new Date(inv.createdAt);
            const isInPeriod = invDate >= startDate && invDate <= endDate;
            const invoiceSalesRepId = inv.salesRepId || customerSalesRepMap[inv.customerId || ""] || "";
            const isTeamInvoice = teamRepIds.includes(invoiceSalesRepId);
            return isInPeriod && isTeamInvoice;
        });

        // Debug logging
        console.log('[SupervisorBonus] Team Rep IDs:', teamRepIds);
        console.log('[SupervisorBonus] Total invoices:', invoices.length);
        console.log('[SupervisorBonus] Invoices with salesRepId:', invoices.filter(i => i.salesRepId).length);
        console.log('[SupervisorBonus] Invoices matched via customer salesRepId:', invoices.filter(i => !i.salesRepId && customerSalesRepMap[i.customerId || ""]).length);
        console.log('[SupervisorBonus] Period invoices found:', periodInvoices.length);

        // Calculate sales by rep and by category
        const salesByRep: Record<string, number> = {};
        const byCategorySales: Record<string, { sales: number; bonus: number; percentage: number }> = {};
        let categoryBonus = 0;

        periodInvoices.forEach(inv => {
            // Use resolved salesRepId (from invoice or customer)
            const repId = inv.salesRepId || customerSalesRepMap[inv.customerId || ""] || "";
            if (repId) {
                salesByRep[repId] = (salesByRep[repId] || 0) + (inv.total || 0);
            }

            // Process items for category bonus
            const items = inv.items || [];
            // حساب إجمالي الأصناف قبل الخصم
            const itemsSubtotal = items.reduce((sum: number, item: any) => {
                return sum + (item.total || (item.price * (item.quantity || 1)));
            }, 0);
            // نسبة الخصم من الفاتورة (لتوزيعها على الأصناف)
            const invoiceDiscount = Number(inv.discount || inv.discountAmount) || 0;
            const discountRatio = itemsSubtotal > 0 ? (1 - invoiceDiscount / itemsSubtotal) : 1;
            
            items.forEach((item: any) => {
                const productId = item.productId || "";
                const categoryName = productCategoryMap[productId] || "بدون تصنيف";
                const catBonusPercent = categoryBonusMap[categoryName] || 0;
                const itemTotal = item.total || (item.price * (item.quantity || 1));
                // احتساب البونص على المبلغ بعد الخصم
                const itemTotalAfterDiscount = Math.round(itemTotal * discountRatio);
                const itemBonus = Math.round(itemTotalAfterDiscount * (catBonusPercent / 100));

                if (!byCategorySales[categoryName]) {
                    byCategorySales[categoryName] = { sales: 0, bonus: 0, percentage: catBonusPercent };
                }
                byCategorySales[categoryName].sales += itemTotalAfterDiscount;
                byCategorySales[categoryName].bonus += itemBonus;
                categoryBonus += itemBonus;
            });
        });

        const byRep = teamMembers.map(rep => ({
            id: rep.id,
            name: rep.name,
            sales: salesByRep[rep.id] || 0,
        }));

        const total = byRep.reduce((sum, rep) => sum + rep.sales, 0);

        return { total, byRep, categoryBonus, byCategorySales };
    }, [selectedSupervisorId, dateFrom, dateTo, teamMembers, invoices, productCategoryMap, categoryBonusMap, customerSalesRepMap]);

    // Calculate bonus amount
    const bonusAmount = useMemo(() => {
        if (useCategoryBonus) {
            return teamSalesData.categoryBonus;
        }
        const percentage = parseFloat(bonusPercentage) || 0;
        return Math.round(teamSalesData.total * (percentage / 100));
    }, [teamSalesData.total, teamSalesData.categoryBonus, bonusPercentage, useCategoryBonus]);

    // Apply bonus
    const handleApplyBonus = async () => {
        if (!selectedSupervisorId) {
            toast.error("يرجى اختيار المشرف");
            return;
        }
        if (!dateFrom || !dateTo) {
            toast.error("يرجى تحديد الفترة");
            return;
        }
        if (teamSalesData.total <= 0) {
            toast.error("لا توجد مبيعات للفريق في هذه الفترة");
            return;
        }

        // Check for duplicate bonus
        const existingBonuses = JSON.parse(
            localStorage.getItem("supervisorBonuses") || "[]"
        ) as SupervisorBonusRecord[];

        const duplicateBonus = existingBonuses.find(
            b => b.supervisorId === selectedSupervisorId &&
                b.periodStart === dateFrom &&
                b.periodEnd === dateTo
        );

        if (duplicateBonus) {
            toast.error("يوجد بونص مُسجل بالفعل لهذا المشرف في نفس الفترة");
            return;
        }

        setIsLoading(true);

        try {
            const supervisor = supervisors.find(s => s.id === selectedSupervisorId);

            const newBonusRecord: SupervisorBonusRecord = {
                id: `sup_bonus_${Date.now()}`,
                supervisorId: selectedSupervisorId,
                supervisorName: supervisor?.name || "",
                periodStart: dateFrom,
                periodEnd: dateTo,
                totalTeamSales: teamSalesData.total,
                bonusPercentage: useCategoryBonus
                    ? (teamSalesData.total > 0 ? parseFloat((bonusAmount / teamSalesData.total * 100).toFixed(2)) : 0)
                    : (parseFloat(bonusPercentage) || 0),
                bonusAmount,
                createdAt: new Date().toISOString(),
                userId: user?.id || "",
                userName: user?.username || user?.name || "",
                notes: useCategoryBonus ? `${notes ? notes + " | " : ""}بونص حسب القسم` : notes,
                salesReps: teamSalesData.byRep,
            };

            // Save to localStorage (use existingBonuses already loaded for duplicate check)
            existingBonuses.push(newBonusRecord);
            localStorage.setItem("supervisorBonuses", JSON.stringify(existingBonuses));

            toast.success(
                `تم تسجيل بونص ${Math.round(bonusAmount)} ${currency} للمشرف ${supervisor?.name}`
            );

            // Reset form
            setSelectedSupervisorId("");
            setDateFrom("");
            setDateTo("");
            setBonusPercentage("5");
            setNotes("");
            loadRecentBonuses();
        } catch (error) {
            toast.error("حدث خطأ أثناء تسجيل البونص");
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const formatCurrency = (amount: number) => `${Math.round(amount)} ${currency}`;

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString("ar-EG");
    };

    return (
        <div className="min-h-screen bg-background" dir="rtl">
            <POSHeader />
            <div className="container mx-auto p-6 space-y-6">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <Award className="h-8 w-8 text-primary" />
                    <h1 className="text-3xl font-bold">بونص المشرفين</h1>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Bonus Form */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <UserCheck className="h-5 w-5" />
                                حساب بونص المشرف
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Supervisor Selection */}
                            <div className="space-y-2">
                                <Label>اختر المشرف</Label>
                                <Select
                                    value={selectedSupervisorId}
                                    onValueChange={setSelectedSupervisorId}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="اختر المشرف..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {supervisors.map((sup) => (
                                            <SelectItem key={sup.id} value={sup.id}>
                                                {sup.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Period Selection */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="flex items-center gap-2">
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
                                    <Label className="flex items-center gap-2">
                                        <Calendar className="h-4 w-4" />
                                        إلى تاريخ
                                    </Label>
                                    <Input
                                        type="date"
                                        value={dateTo}
                                        onChange={(e) => setDateTo(e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* Team Members Display */}
                            {selectedSupervisorId && (
                                <div className="p-3 bg-muted rounded-lg">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Users className="h-4 w-4" />
                                        <span className="font-semibold">فريق العمل ({teamMembers.length} مندوب)</span>
                                    </div>
                                    {teamMembers.length > 0 ? (
                                        <div className="flex flex-wrap gap-2">
                                            {teamMembers.map((rep) => (
                                                <Badge key={rep.id} variant="secondary">
                                                    {rep.name}
                                                </Badge>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">
                                            لا يوجد مندوبين تابعين لهذا المشرف
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Sales Summary */}
                            {selectedSupervisorId && dateFrom && dateTo && (
                                <div className="space-y-3">
                                    <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <TrendingUp className="h-5 w-5 text-blue-600" />
                                                <span className="font-semibold">إجمالي مبيعات الفريق</span>
                                            </div>
                                            <span className="text-2xl font-bold text-blue-600">
                                                {formatCurrency(teamSalesData.total)}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Sales by Rep */}
                                    {teamSalesData.byRep.length > 0 && (
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>المندوب</TableHead>
                                                    <TableHead className="text-left">المبيعات</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {teamSalesData.byRep.map((rep) => (
                                                    <TableRow key={rep.id}>
                                                        <TableCell>{rep.name}</TableCell>
                                                        <TableCell className="text-left font-medium">
                                                            {formatCurrency(rep.sales)}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    )}
                                </div>
                            )}

                            {/* Bonus Percentage */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label className="flex items-center gap-2">
                                        <Percent className="h-4 w-4" />
                                        طريقة حساب البونص
                                    </Label>
                                    <div className="flex items-center gap-2">
                                        <Badge variant={useCategoryBonus ? "default" : "secondary"}
                                            className="cursor-pointer"
                                            onClick={() => setUseCategoryBonus(true)}>
                                            حسب القسم
                                        </Badge>
                                        <Badge variant={!useCategoryBonus ? "default" : "secondary"}
                                            className="cursor-pointer"
                                            onClick={() => setUseCategoryBonus(false)}>
                                            نسبة ثابتة
                                        </Badge>
                                    </div>
                                </div>

                                {!useCategoryBonus && (
                                    <Input
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="0.5"
                                        value={bonusPercentage}
                                        onChange={(e) => setBonusPercentage(e.target.value)}
                                        placeholder="نسبة البونص الثابتة"
                                    />
                                )}
                            </div>

                            {/* Category Breakdown */}
                            {useCategoryBonus && Object.keys(teamSalesData.byCategorySales || {}).length > 0 && (
                                <div className="space-y-2">
                                    <Label>تفصيل البونص حسب الأقسام</Label>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>القسم</TableHead>
                                                <TableHead className="text-center">النسبة</TableHead>
                                                <TableHead className="text-left">المبيعات</TableHead>
                                                <TableHead className="text-left">البونص</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {Object.entries(teamSalesData.byCategorySales || {}).map(([catName, data]) => (
                                                <TableRow key={catName}>
                                                    <TableCell>{catName || "بدون تصنيف"}</TableCell>
                                                    <TableCell className="text-center">
                                                        <Badge variant="outline">{data.percentage}%</Badge>
                                                    </TableCell>
                                                    <TableCell className="text-left">{formatCurrency(data.sales)}</TableCell>
                                                    <TableCell className="text-left font-medium text-green-600">
                                                        {formatCurrency(data.bonus)}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}

                            {/* Bonus Amount */}
                            {teamSalesData.total > 0 && (
                                <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <DollarSign className="h-5 w-5 text-green-600" />
                                            <span className="font-semibold">إجمالي البونص</span>
                                        </div>
                                        <span className="text-2xl font-bold text-green-600">
                                            {formatCurrency(bonusAmount)}
                                        </span>
                                    </div>
                                    {useCategoryBonus && (
                                        <p className="text-xs text-muted-foreground mt-2">
                                            محسوب من نسب الأقسام المختلفة
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Notes */}
                            <div className="space-y-2">
                                <Label>ملاحظات (اختياري)</Label>
                                <Textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="أي ملاحظات إضافية..."
                                />
                            </div>

                            {/* Submit Button */}
                            <Button
                                onClick={handleApplyBonus}
                                disabled={isLoading || teamSalesData.total <= 0}
                                className="w-full"
                                size="lg"
                            >
                                <Award className="h-5 w-5 ml-2" />
                                تسجيل البونص
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Recent Bonuses */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <DollarSign className="h-5 w-5" />
                                سجل البونص
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {recentBonuses.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    لا توجد سجلات بونص سابقة
                                </div>
                            ) : (
                                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                                    {recentBonuses.map((bonus) => (
                                        <Card key={bonus.id} className="p-4">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <p className="font-bold text-lg">{bonus.supervisorName}</p>
                                                    <p className="text-sm text-muted-foreground">
                                                        الفترة: {formatDate(bonus.periodStart)} - {formatDate(bonus.periodEnd)}
                                                    </p>
                                                    <p className="text-sm text-muted-foreground">
                                                        إجمالي المبيعات: {formatCurrency(bonus.totalTeamSales)}
                                                    </p>
                                                    <p className="text-sm text-muted-foreground">
                                                        المندوبين: {bonus.salesReps.map(r => r.name).join("، ")}
                                                    </p>
                                                    {bonus.notes && (
                                                        <p className="text-sm text-muted-foreground mt-1">
                                                            {bonus.notes}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="text-left">
                                                    <p className="text-xl font-bold text-green-600">
                                                        {formatCurrency(bonus.bonusAmount)}
                                                    </p>
                                                    <Badge variant="outline">{bonus.bonusPercentage}%</Badge>
                                                </div>
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default SupervisorBonus;
