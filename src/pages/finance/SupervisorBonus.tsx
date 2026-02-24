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
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog";
import {
    Award,
    DollarSign,
    Users,
    Calendar,
    TrendingUp,
    Percent,
    UserCheck,
    Trash2,
    Pencil,
    Printer,
    AlertTriangle,
} from "lucide-react";
import { db, Supervisor, SalesRep, Invoice, Product, ProductCategory, Customer } from "@/shared/lib/indexedDB";
import { useSettingsContext } from "@/contexts/SettingsContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { POSHeader } from "@/components/POS/POSHeader";
import { usePagination } from "@/hooks/usePagination";
import { DataPagination } from "@/components/ui/DataPagination";

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
    manualBonusAmount?: number; // مبلغ يدوي مضاف بجانب النسبة
    totalDeposits?: number; // إجمالي إيداعات المشرف خلال الفترة
    createdAt: string;
    userId: string;
    userName: string;
    notes?: string;
    salesReps: { id: string; name: string; sales: number }[];
    invoiceIds?: string[]; // track individual invoices to prevent duplicates
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
    const [manualBonusAmount, setManualBonusAmount] = useState<string>("");
    const [collections, setCollections] = useState<any[]>([]);

    // Edit/Delete states
    const [editingBonus, setEditingBonus] = useState<SupervisorBonusRecord | null>(null);
    const [editDialog, setEditDialog] = useState(false);
    const [editNotes, setEditNotes] = useState("");
    const [editManualAmount, setEditManualAmount] = useState("");
    const [deleteConfirmDialog, setDeleteConfirmDialog] = useState<string | null>(null);

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

        // Collections are stored in "payments" store with paymentType filter
        const allPayments = await db.getAll<any>("payments");
        const allCollections = (allPayments || []).filter(
            (p: any) => p.paymentType === "collection" || p.paymentType === "credit_payment"
        );
        setCollections(allCollections);

        loadRecentBonuses();
    };

    const loadRecentBonuses = async () => {
        try {
            await db.init();
            let bonuses: SupervisorBonusRecord[] = [];

            // Try loading from IndexedDB first
            try {
                bonuses = await db.getAll<SupervisorBonusRecord>("supervisorBonuses");
            } catch {
                bonuses = [];
            }

            // Migrate from localStorage if IndexedDB is empty and localStorage has data
            if (bonuses.length === 0) {
                const saved = localStorage.getItem("supervisorBonuses");
                if (saved) {
                    try {
                        const localBonuses = JSON.parse(saved) as SupervisorBonusRecord[];
                        if (localBonuses.length > 0) {
                            // Migrate each record to IndexedDB
                            for (const bonus of localBonuses) {
                                try {
                                    await db.add("supervisorBonuses", bonus);
                                } catch (e) {
                                    console.warn("Migration: skipped duplicate bonus", bonus.id);
                                }
                            }
                            bonuses = localBonuses;
                            // Clear localStorage after successful migration
                            localStorage.removeItem("supervisorBonuses");
                            console.log(`[SupervisorBonus] Migrated ${localBonuses.length} bonuses from localStorage to IndexedDB`);
                        }
                    } catch (e) {
                        console.error("Error migrating bonuses from localStorage:", e);
                    }
                }
            }

            // Sort newest first
            setRecentBonuses(
                bonuses.sort(
                    (a, b) =>
                        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                )
            );
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
            const bp = Number(c.bonusPercentage) || 0;
            // Match by name or id
            map[c.id] = bp;
            map[c.name] = bp;
            if (c.nameAr) map[c.nameAr] = bp;
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
                salesByRep[repId] = (salesByRep[repId] || 0) + (Number(inv.total) || 0);
            }

            // Process items for category bonus
            const items = inv.items || [];
            // حساب إجمالي الأصناف قبل الخصم
            const itemsSubtotal = items.reduce((sum: number, item: any) => {
                return sum + (Number(item.total) || (Number(item.price) * (Number(item.quantity) || 1)));
            }, 0);
            // نسبة الخصم من الفاتورة (لتوزيعها على الأصناف)
            const invoiceDiscount = Number(inv.discount || (inv as any).discountAmount) || 0;
            const discountRatio = itemsSubtotal > 0 ? (1 - invoiceDiscount / itemsSubtotal) : 1;
            
            items.forEach((item: any) => {
                const productId = item.productId || "";
                const categoryName = productCategoryMap[productId] || "بدون تصنيف";
                const catBonusPercent = Number(categoryBonusMap[categoryName]) || 0;
                const itemTotal = Number(item.total) || (Number(item.price) * (Number(item.quantity) || 1));
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

    // Calculate bonus amount (percentage-based + manual amount)
    const calculatedBonusFromPercentage = useMemo(() => {
        if (useCategoryBonus) {
            return teamSalesData.categoryBonus;
        }
        const percentage = parseFloat(bonusPercentage) || 0;
        return Math.round(teamSalesData.total * (percentage / 100));
    }, [teamSalesData.total, teamSalesData.categoryBonus, bonusPercentage, useCategoryBonus]);

    const manualAmount = parseFloat(manualBonusAmount) || 0;
    const bonusAmount = calculatedBonusFromPercentage + manualAmount;

    // Calculate supervisor's team deposits (collections) for the period
    const supervisorDeposits = useMemo(() => {
        if (!selectedSupervisorId || !dateFrom || !dateTo) return 0;
        const startDate = new Date(dateFrom);
        const endDate = new Date(dateTo + "T23:59:59");
        const teamRepIds = teamMembers.map(rep => rep.id);

        // Get customer IDs belonging to this supervisor's reps
        const teamCustomerIds = new Set(
            customers
                .filter(c => c.salesRepId && teamRepIds.includes(c.salesRepId))
                .map(c => c.id)
        );

        // Sum collections from these customers in the period
        return collections
            .filter((col: any) => {
                const colDate = new Date(col.createdAt);
                return colDate >= startDate && colDate <= endDate && teamCustomerIds.has(col.customerId);
            })
            .reduce((sum: number, col: any) => sum + (Number(col.amount) || 0), 0);
    }, [selectedSupervisorId, dateFrom, dateTo, teamMembers, customers, collections]);

    // Check if bonus exceeds 10% of deposits
    const depositsCap = Math.round(supervisorDeposits * 0.10);
    const exceedsDepositCap = supervisorDeposits > 0 && bonusAmount > depositsCap;

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

        // Validate 10% deposit cap
        if (exceedsDepositCap) {
            toast.error(`قيمة البونص (${formatCurrency(bonusAmount)}) تتجاوز 10% من إيداعات المشرف (${formatCurrency(depositsCap)}). الحد الأقصى المسموح: ${formatCurrency(depositsCap)}`);
            return;
        }

        // Check for duplicate bonus
        let existingBonuses: SupervisorBonusRecord[] = [];
        try {
            existingBonuses = await db.getAll<SupervisorBonusRecord>("supervisorBonuses");
        } catch {
            existingBonuses = [];
        }

        // Collect invoice IDs for this bonus period
        const startDate = new Date(dateFrom);
        const endDate = new Date(dateTo + "T23:59:59");
        const teamRepIds = teamMembers.map(rep => rep.id);
        const periodInvoiceIds = invoices
            .filter(inv => {
                const invDate = new Date(inv.createdAt);
                const isInPeriod = invDate >= startDate && invDate <= endDate;
                const invoiceSalesRepId = inv.salesRepId || customerSalesRepMap[inv.customerId || ""] || "";
                const isTeamInvoice = teamRepIds.includes(invoiceSalesRepId);
                return isInPeriod && isTeamInvoice;
            })
            .map(inv => String(inv.id));

        // Check if ANY of these invoices were already bonused
        const alreadyBonusedInvoiceIds = new Set<string>();
        existingBonuses.forEach(b => {
            if (b.invoiceIds) {
                b.invoiceIds.forEach(id => alreadyBonusedInvoiceIds.add(id));
            }
        });

        const duplicateInvoiceIds = periodInvoiceIds.filter(id => alreadyBonusedInvoiceIds.has(id));
        if (duplicateInvoiceIds.length > 0) {
            toast.error(`${duplicateInvoiceIds.length} فاتورة من هذه الفترة تم احتساب بونص عليها مسبقاً. لا يمكن تسجيل بونص مكرر.`);
            return;
        }

        if (periodInvoiceIds.length === 0) {
            toast.error("لا توجد فواتير لتسجيل بونص عليها");
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
                    ? (teamSalesData.total > 0 ? parseFloat((calculatedBonusFromPercentage / teamSalesData.total * 100).toFixed(2)) : 0)
                    : (parseFloat(bonusPercentage) || 0),
                bonusAmount,
                manualBonusAmount: manualAmount > 0 ? manualAmount : undefined,
                totalDeposits: supervisorDeposits > 0 ? supervisorDeposits : undefined,
                createdAt: new Date().toISOString(),
                userId: user?.id || "",
                userName: user?.username || user?.name || "",
                notes: useCategoryBonus ? `${notes ? notes + " | " : ""}بونص حسب القسم` : notes,
                salesReps: teamSalesData.byRep,
                invoiceIds: periodInvoiceIds,
            };

            // Save to IndexedDB (synced automatically via SyncableRepository)
            await db.add("supervisorBonuses", newBonusRecord);

            toast.success(
                `تم تسجيل بونص ${Math.round(bonusAmount)} ${currency} للمشرف ${supervisor?.name}`
            );

            // Reset form
            setSelectedSupervisorId("");
            setDateFrom("");
            setDateTo("");
            setBonusPercentage("5");
            setManualBonusAmount("");
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

    // Delete bonus
    const handleDeleteBonus = async (bonusId: string) => {
        try {
            await db.delete("supervisorBonuses", bonusId);
            setDeleteConfirmDialog(null);
            toast.success("تم حذف البونص بنجاح");
            loadRecentBonuses();
        } catch (error) {
            toast.error("حدث خطأ أثناء الحذف");
            console.error(error);
        }
    };

    // Open edit dialog
    const openEditDialog = (bonus: SupervisorBonusRecord) => {
        setEditingBonus(bonus);
        setEditNotes(bonus.notes || "");
        setEditManualAmount(bonus.manualBonusAmount ? String(bonus.manualBonusAmount) : "");
        setEditDialog(true);
    };

    // Save edit
    const handleSaveEdit = async () => {
        if (!editingBonus) return;
        try {
            const newManual = parseFloat(editManualAmount) || 0;
            const oldManual = editingBonus.manualBonusAmount || 0;
            const baseBonusAmount = editingBonus.bonusAmount - oldManual;
            const newBonusAmount = baseBonusAmount + newManual;

            // Check 10% deposit cap if deposits info exists
            if (editingBonus.totalDeposits && editingBonus.totalDeposits > 0) {
                const cap = Math.round(editingBonus.totalDeposits * 0.10);
                if (newBonusAmount > cap) {
                    toast.error(`البونص الجديد (${formatCurrency(newBonusAmount)}) يتجاوز 10% من الإيداعات (${formatCurrency(cap)})`);
                    return;
                }
            }

            const updatedBonus: SupervisorBonusRecord = {
                ...editingBonus,
                notes: editNotes,
                manualBonusAmount: newManual > 0 ? newManual : undefined,
                bonusAmount: newBonusAmount,
            };

            await db.update("supervisorBonuses", updatedBonus);
            setEditDialog(false);
            setEditingBonus(null);
            toast.success("تم تعديل البونص بنجاح");
            loadRecentBonuses();
        } catch (error) {
            toast.error("حدث خطأ أثناء التعديل");
            console.error(error);
        }
    };

    // Print comprehensive report
    const handlePrintReport = (bonus: SupervisorBonusRecord) => {
        const printWindow = window.open("", "_blank");
        if (!printWindow) {
            toast.error("يرجى السماح بالنوافذ المنبثقة للطباعة");
            return;
        }

        const repRows = bonus.salesReps
            .map((rep, i) => `<tr><td>${i + 1}</td><td>${rep.name}</td><td>${Math.round(rep.sales).toLocaleString("ar-EG")} ${currency}</td></tr>`)
            .join("");

        const storeName = getSetting("storeName") || "المتجر";

        printWindow.document.write(`
            <!DOCTYPE html>
            <html dir="rtl" lang="ar">
            <head>
                <meta charset="UTF-8">
                <title>تقرير بونص المشرف - ${bonus.supervisorName}</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; padding: 30px; color: #333; direction: rtl; }
                    .header { text-align: center; border-bottom: 3px solid #2563eb; padding-bottom: 15px; margin-bottom: 25px; }
                    .header h1 { font-size: 22px; color: #2563eb; margin-bottom: 5px; }
                    .header h2 { font-size: 16px; color: #666; }
                    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; background: #f8f9fa; padding: 15px; border-radius: 8px; }
                    .info-item { display: flex; gap: 8px; }
                    .info-label { font-weight: bold; color: #555; }
                    .info-value { color: #333; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                    th { background: #2563eb; color: white; padding: 10px; text-align: right; }
                    td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
                    tr:nth-child(even) { background: #f8fafc; }
                    .summary { background: #f0fdf4; border: 2px solid #22c55e; border-radius: 8px; padding: 20px; margin-top: 20px; }
                    .summary-row { display: flex; justify-content: space-between; padding: 5px 0; }
                    .summary-label { font-weight: bold; }
                    .summary-value { font-size: 18px; color: #16a34a; font-weight: bold; }
                    .total-row { border-top: 2px solid #22c55e; padding-top: 10px; margin-top: 10px; font-size: 20px; }
                    .deposits-section { background: #eff6ff; border: 2px solid #3b82f6; border-radius: 8px; padding: 15px; margin-top: 15px; }
                    .deposits-label { font-weight: bold; color: #1d4ed8; }
                    .footer { text-align: center; margin-top: 30px; padding-top: 15px; border-top: 1px solid #e2e8f0; color: #999; font-size: 12px; }
                    .notes { background: #fffbeb; border: 1px solid #f59e0b; border-radius: 8px; padding: 10px; margin-top: 15px; }
                    @media print { body { padding: 15px; } }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>🏆 ${storeName}</h1>
                    <h2>تقرير بونص المشرف</h2>
                </div>

                <div class="info-grid">
                    <div class="info-item"><span class="info-label">المشرف:</span><span class="info-value">${bonus.supervisorName}</span></div>
                    <div class="info-item"><span class="info-label">تاريخ التسجيل:</span><span class="info-value">${formatDate(bonus.createdAt)}</span></div>
                    <div class="info-item"><span class="info-label">من:</span><span class="info-value">${formatDate(bonus.periodStart)}</span></div>
                    <div class="info-item"><span class="info-label">إلى:</span><span class="info-value">${formatDate(bonus.periodEnd)}</span></div>
                    <div class="info-item"><span class="info-label">المسجّل:</span><span class="info-value">${bonus.userName}</span></div>
                    <div class="info-item"><span class="info-label">نسبة البونص:</span><span class="info-value">${bonus.bonusPercentage}%</span></div>
                </div>

                <h3 style="margin-bottom: 10px;">📊 مبيعات المندوبين</h3>
                <table>
                    <thead><tr><th>#</th><th>المندوب</th><th>المبيعات</th></tr></thead>
                    <tbody>
                        ${repRows}
                        <tr style="font-weight: bold; background: #e2e8f0;">
                            <td colspan="2">الإجمالي</td>
                            <td>${Math.round(bonus.totalTeamSales).toLocaleString("ar-EG")} ${currency}</td>
                        </tr>
                    </tbody>
                </table>

                <div class="summary">
                    <h3 style="margin-bottom: 10px;">💰 ملخص البونص</h3>
                    <div class="summary-row">
                        <span class="summary-label">بونص من النسبة:</span>
                        <span>${Math.round(bonus.bonusAmount - (bonus.manualBonusAmount || 0)).toLocaleString("ar-EG")} ${currency}</span>
                    </div>
                    ${bonus.manualBonusAmount ? `
                    <div class="summary-row">
                        <span class="summary-label">مبلغ يدوي مضاف:</span>
                        <span>${Math.round(bonus.manualBonusAmount).toLocaleString("ar-EG")} ${currency}</span>
                    </div>` : ""}
                    <div class="summary-row total-row">
                        <span class="summary-label">إجمالي البونص النهائي:</span>
                        <span class="summary-value">${Math.round(bonus.bonusAmount).toLocaleString("ar-EG")} ${currency}</span>
                    </div>
                </div>

                ${bonus.totalDeposits ? `
                <div class="deposits-section">
                    <div class="summary-row">
                        <span class="deposits-label">إيداعات الفريق خلال الفترة:</span>
                        <span>${Math.round(bonus.totalDeposits).toLocaleString("ar-EG")} ${currency}</span>
                    </div>
                    <div class="summary-row">
                        <span class="deposits-label">الحد الأقصى (10%):</span>
                        <span>${Math.round(bonus.totalDeposits * 0.10).toLocaleString("ar-EG")} ${currency}</span>
                    </div>
                </div>` : ""}

                ${bonus.notes ? `<div class="notes"><strong>ملاحظات:</strong> ${bonus.notes}</div>` : ""}

                <div class="footer">
                    طُبع بتاريخ ${new Date().toLocaleDateString("ar-EG")} ${new Date().toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
                </div>
            </body>
            </html>
        `);
        printWindow.document.close();
        setTimeout(() => printWindow.print(), 500);
    };

    const pagination = usePagination(recentBonuses);

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

                            {/* Manual Bonus Amount */}
                            <div className="space-y-2">
                                <Label className="flex items-center gap-2">
                                    <DollarSign className="h-4 w-4" />
                                    مبلغ يدوي إضافي (اختياري)
                                </Label>
                                <Input
                                    type="number"
                                    min="0"
                                    value={manualBonusAmount}
                                    onChange={(e) => setManualBonusAmount(e.target.value)}
                                    placeholder="أدخل مبلغ إضافي بجانب النسبة..."
                                />
                                {manualAmount > 0 && (
                                    <p className="text-xs text-muted-foreground">
                                        سيتم إضافة {formatCurrency(manualAmount)} إلى بونص النسبة ({formatCurrency(calculatedBonusFromPercentage)})
                                    </p>
                                )}
                            </div>

                            {/* Deposits Cap Info */}
                            {selectedSupervisorId && dateFrom && dateTo && (
                                <div className={`p-3 rounded-lg border ${exceedsDepositCap ? "bg-red-50 dark:bg-red-950 border-red-300" : "bg-blue-50 dark:bg-blue-950 border-blue-200"}`}>
                                    <div className="flex items-center gap-2 mb-1">
                                        {exceedsDepositCap ? (
                                            <AlertTriangle className="h-4 w-4 text-red-600" />
                                        ) : (
                                            <DollarSign className="h-4 w-4 text-blue-600" />
                                        )}
                                        <span className="font-semibold text-sm">
                                            إيداعات الفريق (تحصيلات): {formatCurrency(supervisorDeposits)}
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        الحد الأقصى للبونص (10% من الإيداعات): {formatCurrency(depositsCap)}
                                    </p>
                                    {exceedsDepositCap && (
                                        <p className="text-xs text-red-600 font-semibold mt-1">
                                            ⚠️ البونص الحالي ({formatCurrency(bonusAmount)}) يتجاوز الحد المسموح!
                                        </p>
                                    )}
                                </div>
                            )}

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
                                    {manualAmount > 0 && (
                                        <p className="text-xs text-muted-foreground mt-1">
                                            ({formatCurrency(calculatedBonusFromPercentage)} من النسبة + {formatCurrency(manualAmount)} مبلغ يدوي)
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
                                disabled={isLoading || teamSalesData.total <= 0 || exceedsDepositCap}
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
                                    {pagination.paginatedItems.map((bonus) => (
                                        <Card key={bonus.id} className="p-4">
                                            <div className="flex justify-between items-start">
                                                <div className="flex-1">
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
                                                    {bonus.manualBonusAmount && bonus.manualBonusAmount > 0 && (
                                                        <p className="text-sm text-blue-600">
                                                            يشمل مبلغ يدوي: {formatCurrency(bonus.manualBonusAmount)}
                                                        </p>
                                                    )}
                                                    {bonus.totalDeposits && bonus.totalDeposits > 0 && (
                                                        <p className="text-sm text-muted-foreground">
                                                            إيداعات الفريق: {formatCurrency(bonus.totalDeposits)}
                                                        </p>
                                                    )}
                                                    {bonus.notes && (
                                                        <p className="text-sm text-muted-foreground mt-1">
                                                            {bonus.notes}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="text-left space-y-2">
                                                    <p className="text-xl font-bold text-green-600">
                                                        {formatCurrency(bonus.bonusAmount)}
                                                    </p>
                                                    <Badge variant="outline">{bonus.bonusPercentage}%</Badge>
                                                    <div className="flex gap-1 mt-2">
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="h-8 w-8"
                                                            onClick={() => openEditDialog(bonus)}
                                                            title="تعديل"
                                                        >
                                                            <Pencil className="h-4 w-4 text-blue-500" />
                                                        </Button>
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="h-8 w-8"
                                                            onClick={() => handlePrintReport(bonus)}
                                                            title="طباعة تقرير"
                                                        >
                                                            <Printer className="h-4 w-4 text-gray-600" />
                                                        </Button>
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                                                            onClick={() => setDeleteConfirmDialog(bonus.id)}
                                                            title="حذف"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            )}
                            <DataPagination {...pagination} entityName="بونص مشرف" />
                        </CardContent>
                    </Card>
                </div>

                {/* Edit Dialog */}
                <Dialog open={editDialog} onOpenChange={(open) => { if (!open) { setEditDialog(false); setEditingBonus(null); } }}>
                    <DialogContent dir="rtl">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Pencil className="h-5 w-5 text-blue-500" />
                                تعديل البونص - {editingBonus?.supervisorName}
                            </DialogTitle>
                            <DialogDescription>
                                الفترة: {editingBonus && formatDate(editingBonus.periodStart)} - {editingBonus && formatDate(editingBonus.periodEnd)}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
                                <p>إجمالي المبيعات: <strong>{editingBonus && formatCurrency(editingBonus.totalTeamSales)}</strong></p>
                                <p>بونص النسبة: <strong>{editingBonus && formatCurrency(editingBonus.bonusAmount - (editingBonus.manualBonusAmount || 0))}</strong></p>
                                {editingBonus?.totalDeposits && editingBonus.totalDeposits > 0 && (
                                    <p>الحد الأقصى (10% من الإيداعات): <strong>{formatCurrency(editingBonus.totalDeposits * 0.10)}</strong></p>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label>مبلغ يدوي إضافي</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    value={editManualAmount}
                                    onChange={(e) => setEditManualAmount(e.target.value)}
                                    placeholder="0"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>ملاحظات</Label>
                                <Textarea
                                    value={editNotes}
                                    onChange={(e) => setEditNotes(e.target.value)}
                                    placeholder="ملاحظات..."
                                />
                            </div>
                            {editingBonus && (
                                <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                                    <p className="font-semibold text-green-700 dark:text-green-400">
                                        البونص الجديد: {formatCurrency(
                                            (editingBonus.bonusAmount - (editingBonus.manualBonusAmount || 0)) + (parseFloat(editManualAmount) || 0)
                                        )}
                                    </p>
                                </div>
                            )}
                        </div>
                        <DialogFooter className="gap-2">
                            <Button variant="outline" onClick={() => { setEditDialog(false); setEditingBonus(null); }}>
                                إلغاء
                            </Button>
                            <Button onClick={handleSaveEdit}>
                                <Pencil className="h-4 w-4 ml-2" />
                                حفظ التعديلات
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Delete Confirmation Dialog */}
                <Dialog open={!!deleteConfirmDialog} onOpenChange={() => setDeleteConfirmDialog(null)}>
                    <DialogContent dir="rtl">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2 text-red-600">
                                <Trash2 className="h-5 w-5" />
                                حذف البونص؟
                            </DialogTitle>
                        </DialogHeader>
                        <p className="text-center py-4">
                            هل أنت متأكد من حذف هذا البونص؟
                            <br />
                            <span className="text-muted-foreground text-sm">
                                لا يمكن التراجع عن هذا الإجراء
                            </span>
                        </p>
                        <DialogFooter className="gap-2">
                            <Button variant="outline" onClick={() => setDeleteConfirmDialog(null)}>
                                لا، إلغاء
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={() => deleteConfirmDialog && handleDeleteBonus(deleteConfirmDialog)}
                            >
                                <Trash2 className="h-4 w-4 ml-2" />
                                نعم، احذف
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
};

export default SupervisorBonus;
