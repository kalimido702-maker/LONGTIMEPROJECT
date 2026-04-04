/**
 * SupervisorBonus - صفحة بونص المشرفين
 * لحساب وتطبيق البونص على المشرفين بناءً على مدفوعات فريقهم
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
    UserCheck,
    Trash2,
    Pencil,
    Printer,
    CheckCircle,
    XCircle,
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
    totalPayments: number;
    totalTeamSales?: number; // backward compat
    lightingInvoicesTotal?: number;
    otherDepartmentsValue?: number;
    lightingBonusPercentage?: number;
    lightingBonus?: number;
    otherBonus?: number;
    bonusPercentage?: number;
    bonusAmount: number;
    isManual?: boolean;
    manualBonusAmount?: number;
    totalDeposits?: number;
    createdAt: string;
    userId: string;
    userName: string;
    notes?: string;
    salesReps: { id: string; name: string; payments?: number; lighting?: number; other?: number; sales?: number }[];
    invoiceIds?: string[];
    byCategorySales?: Record<string, { sales: number; bonus: number; percentage: number }>;
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
    const [notes, setNotes] = useState<string>("");
    const [recentBonuses, setRecentBonuses] = useState<SupervisorBonusRecord[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isManualMode, setIsManualMode] = useState<boolean>(false);
    const [manualBonusAmount, setManualBonusAmount] = useState<string>("");
    const [collections, setCollections] = useState<any[]>([]);

    // Edit/Delete states
    const [editingBonus, setEditingBonus] = useState<SupervisorBonusRecord | null>(null);
    const [editDialog, setEditDialog] = useState(false);
    const [editNotes, setEditNotes] = useState("");
    const [editBonusAmount, setEditBonusAmount] = useState("");
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

    // Build product -> category info maps
    const { productCategoryNameMap, productBonusPercentageMap } = useMemo(() => {
        // Build category lookups by ID
        const catById: Record<string, ProductCategory> = {};
        const catByName: Record<string, ProductCategory> = {};
        categories.forEach(c => {
            catById[String(c.id)] = c;
            if (c.name) catByName[c.name] = c;
            if (c.nameAr) catByName[c.nameAr] = c;
        });

        const nameMap: Record<string, string> = {};
        const bonusMap: Record<string, number> = {};

        products.forEach(p => {
            const catName = p.category || "";
            const catId = String(p.categoryId || (p as any).category_id || "");

            // Resolve category object (try by ID first, then by name)
            let cat: ProductCategory | undefined;
            if (catId && catById[catId]) {
                cat = catById[catId];
            } else if (catName && catById[catName]) {
                cat = catById[catName]; // category field holds an ID
            } else if (catName && catByName[catName]) {
                cat = catByName[catName]; // category field holds a name
            }

            // Display name
            nameMap[p.id] = cat ? (cat.nameAr || cat.name || catName) : catName;
            // Bonus percentage — directly from category object
            bonusMap[p.id] = cat ? (Number(cat.bonusPercentage) || 0) : 0;
        });

        return { productCategoryNameMap: nameMap, productBonusPercentageMap: bonusMap };
    }, [products, categories]);

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

    // Calculate team data for selected period (payment-based)
    const teamSalesData = useMemo(() => {
        const empty = {
            totalPayments: 0,
            bonusEligibleInvoicesTotal: 0,
            lightingTotal: 0,
            totalAutoBonus: 0,
            conditionMet: false,
            byRep: [] as { id: string; name: string; payments: number; bonusEligible: number; nonEligible: number }[],
            byCategorySales: {} as Record<string, { sales: number; bonus: number; percentage: number }>,
            invoiceIds: [] as string[],
        };
        if (!selectedSupervisorId || !dateFrom || !dateTo) return empty;

        const startDate = new Date(dateFrom);
        const endDate = new Date(dateTo + "T23:59:59");
        const teamRepIds = teamMembers.map(rep => rep.id);

        // Get team customer IDs
        const teamCustomerIds = new Set(
            customers.filter(c => c.salesRepId && teamRepIds.includes(c.salesRepId)).map(c => c.id)
        );

        // 1. Total payments (collections) for team customers in period
        const periodCollections = collections.filter((col: any) => {
            const colDate = new Date(col.createdAt || col.paymentDate);
            return colDate >= startDate && colDate <= endDate && teamCustomerIds.has(col.customerId);
        });
        const totalPayments = periodCollections.reduce((sum: number, col: any) => sum + (Number(col.amount) || 0), 0);

        // Payments by rep
        const paymentsByRep: Record<string, number> = {};
        periodCollections.forEach((col: any) => {
            const customer = customers.find(c => c.id === col.customerId);
            const repId = customer?.salesRepId || "";
            if (repId && teamRepIds.includes(repId)) {
                paymentsByRep[repId] = (paymentsByRep[repId] || 0) + (Number(col.amount) || 0);
            }
        });

        // 2. Invoice category breakdown — each category uses its own bonusPercentage
        const periodInvoices = invoices.filter(inv => {
            const invDate = new Date(inv.createdAt);
            const isInPeriod = invDate >= startDate && invDate <= endDate;
            const invoiceSalesRepId = inv.salesRepId || customerSalesRepMap[inv.customerId || ""] || "";
            return isInPeriod && teamRepIds.includes(invoiceSalesRepId);
        });

        let bonusEligibleInvoicesTotal = 0;
        let lightingTotal = 0;
        let totalBonusCalc = 0;
        const byCategorySales: Record<string, { sales: number; bonus: number; percentage: number }> = {};
        const repBonusEligible: Record<string, number> = {};
        const repNonEligible: Record<string, number> = {};

        periodInvoices.forEach(inv => {
            const repId = inv.salesRepId || customerSalesRepMap[inv.customerId || ""] || "";
            const items = inv.items || [];
            const itemsSubtotal = items.reduce((sum: number, item: any) => {
                return sum + (Number(item.total) || (Number(item.price) * (Number(item.quantity) || 1)));
            }, 0);
            const invoiceDiscount = Number(inv.discount || (inv as any).discountAmount) || 0;
            const discountRatio = itemsSubtotal > 0 ? (1 - invoiceDiscount / itemsSubtotal) : 1;

            items.forEach((item: any) => {
                const productId = item.productId || "";
                const categoryName = productCategoryNameMap[productId] || "بدون تصنيف";
                const catBonusPercent = productBonusPercentageMap[productId] || 0;
                const itemTotal = Number(item.total) || (Number(item.price) * (Number(item.quantity) || 1));
                const itemTotalAfterDiscount = Math.round(itemTotal * discountRatio);
                const isBonusEligible = catBonusPercent > 0;

                if (isBonusEligible) {
                    bonusEligibleInvoicesTotal += itemTotalAfterDiscount;
                    totalBonusCalc += Math.round(itemTotalAfterDiscount * (catBonusPercent / 100));
                    // Track lighting category separately for condition check
                    const catNameLower = categoryName.toLowerCase();
                    if (catNameLower.includes('إضاء') || catNameLower.includes('اضاء') || catNameLower.includes('lighting')) {
                        lightingTotal += itemTotalAfterDiscount;
                    }
                    if (repId) repBonusEligible[repId] = (repBonusEligible[repId] || 0) + itemTotalAfterDiscount;
                } else {
                    if (repId) repNonEligible[repId] = (repNonEligible[repId] || 0) + itemTotalAfterDiscount;
                }

                if (!byCategorySales[categoryName]) {
                    byCategorySales[categoryName] = { sales: 0, bonus: 0, percentage: catBonusPercent };
                }
                byCategorySales[categoryName].sales += itemTotalAfterDiscount;
                if (isBonusEligible) {
                    byCategorySales[categoryName].bonus += Math.round(itemTotalAfterDiscount * (catBonusPercent / 100));
                }
            });
        });

        // 3. Condition: lighting invoices < payments → auto; else → manual
        const conditionMet = totalPayments > 0 && lightingTotal < totalPayments;

        const byRep = teamMembers.map(rep => ({
            id: rep.id, name: rep.name,
            payments: paymentsByRep[rep.id] || 0,
            bonusEligible: repBonusEligible[rep.id] || 0,
            nonEligible: repNonEligible[rep.id] || 0,
        }));

        return {
            totalPayments,
            bonusEligibleInvoicesTotal,
            lightingTotal,
            totalAutoBonus: totalBonusCalc,
            conditionMet, byRep, byCategorySales,
            invoiceIds: periodInvoices.map(inv => String(inv.id)),
        };
    }, [selectedSupervisorId, dateFrom, dateTo, teamMembers, invoices, collections, customers, productCategoryNameMap, productBonusPercentageMap, customerSalesRepMap]);

    // Force manual when condition not met
    const forceManual = !!(selectedSupervisorId && dateFrom && dateTo && teamSalesData.totalPayments > 0 && !teamSalesData.conditionMet);
    const effectiveManualMode = isManualMode || forceManual;

    // Final bonus amount
    const bonusAmount = effectiveManualMode
        ? (parseFloat(manualBonusAmount) || 0)
        : teamSalesData.totalAutoBonus;

    // Apply bonus
    const handleApplyBonus = async () => {
        if (!selectedSupervisorId) { toast.error("يرجى اختيار المشرف"); return; }
        if (!dateFrom || !dateTo) { toast.error("يرجى تحديد الفترة"); return; }
        if (teamSalesData.totalPayments <= 0) { toast.error("لا توجد تحصيلات للفريق في هذه الفترة"); return; }
        if (bonusAmount <= 0) { toast.error("قيمة البونص يجب أن تكون أكبر من صفر"); return; }

        // Check for duplicate bonus (invoice overlap)
        let existingBonuses: SupervisorBonusRecord[] = [];
        try { existingBonuses = await db.getAll<SupervisorBonusRecord>("supervisorBonuses"); } catch { existingBonuses = []; }

        const alreadyBonusedInvoiceIds = new Set<string>();
        existingBonuses.forEach(b => { if (b.invoiceIds) b.invoiceIds.forEach(id => alreadyBonusedInvoiceIds.add(id)); });
        const duplicateInvoiceIds = teamSalesData.invoiceIds.filter(id => alreadyBonusedInvoiceIds.has(id));
        if (duplicateInvoiceIds.length > 0) {
            toast.error(`${duplicateInvoiceIds.length} فاتورة من هذه الفترة تم احتساب بونص عليها مسبقاً.`);
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
                totalPayments: teamSalesData.totalPayments,
                lightingInvoicesTotal: teamSalesData.bonusEligibleInvoicesTotal,
                bonusAmount,
                isManual: effectiveManualMode,
                createdAt: new Date().toISOString(),
                userId: user?.id || "",
                userName: user?.username || user?.name || "",
                notes: effectiveManualMode ? `${notes ? notes + " | " : ""}بونص يدوي` : notes,
                salesReps: teamSalesData.byRep,
                invoiceIds: teamSalesData.invoiceIds,
                byCategorySales: teamSalesData.byCategorySales,
            };

            await db.add("supervisorBonuses", newBonusRecord);
            toast.success(`تم تسجيل بونص ${Math.round(bonusAmount)} ${currency} للمشرف ${supervisor?.name}`);

            // Reset form
            setSelectedSupervisorId("");
            setDateFrom("");
            setDateTo("");
            setManualBonusAmount("");
            setNotes("");
            setIsManualMode(false);
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
        setEditBonusAmount(String(bonus.bonusAmount || ""));
        setEditDialog(true);
    };

    // Save edit
    const handleSaveEdit = async () => {
        if (!editingBonus) return;
        try {
            const newBonusAmount = parseFloat(editBonusAmount) || 0;
            if (newBonusAmount <= 0) {
                toast.error("قيمة البونص يجب أن تكون أكبر من صفر");
                return;
            }

            const updatedBonus: SupervisorBonusRecord = {
                ...editingBonus,
                notes: editNotes,
                bonusAmount: newBonusAmount,
                isManual: true,
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

    // Print comprehensive report (hand-drawn format)
    const handlePrintReport = (bonus: SupervisorBonusRecord) => {
        const printWindow = window.open("", "_blank");
        if (!printWindow) {
            toast.error("يرجى السماح بالنوافذ المنبثقة للطباعة");
            return;
        }

        const storeName = getSetting("storeName") || "شركة لونج تايم للصناعات الكهربائيه";
        const totalPayments = bonus.totalPayments || 0;
        const lightingTotal = bonus.lightingInvoicesTotal || 0;
        const otherVal = bonus.otherDepartmentsValue || 0;
        const lightingBonus = bonus.lightingBonus || 0;
        const otherBonus = bonus.otherBonus || 0;

        // Month from period end
        const periodEndDate = new Date(bonus.periodEnd);
        const monthName = periodEndDate.toLocaleDateString("ar-EG", { month: "long", year: "numeric" });

        // Representative rows: المندوب | الإضاءة | باقي الأقسام
        const repRows = bonus.salesReps
            .map((rep: any) => `<tr><td style="border: 1px solid #000; padding: 8px;">${rep.name}</td><td style="border: 1px solid #000; padding: 8px;">${Math.round(rep.lighting || 0).toLocaleString("ar-EG")} ${currency}</td><td style="border: 1px solid #000; padding: 8px;">${Math.round(rep.other || 0).toLocaleString("ar-EG")} ${currency}</td></tr>`)
            .join("");

        printWindow.document.write(`
            <!DOCTYPE html>
            <html dir="rtl" lang="ar">
            <head>
                <meta charset="UTF-8">
                <title>تقرير بونص ${bonus.supervisorName}</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; padding: 40px; color: #000; direction: rtl; font-size: 14px; }
                    .title { text-align: center; font-size: 18px; font-weight: bold; margin-bottom: 20px; }
                    .store-name { text-align: center; font-size: 14px; margin-bottom: 5px; }
                    .divider { border-bottom: 1px solid #000; margin: 15px 0; }
                    .info-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
                    .info-label { font-weight: bold; }
                    .info-value { flex: 1; border-bottom: 1px solid #999; margin: 0 10px; text-align: center; min-width: 100px; }
                    .section-title { font-weight: bold; margin: 20px 0 10px; text-decoration: underline; }
                    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
                    th, td { border: 1px solid #000; padding: 8px 12px; text-align: center; }
                    th { background: #f0f0f0; font-weight: bold; }
                    .two-col-table td { width: 50%; text-align: right; padding-right: 20px; }
                    .three-col-table td { width: 33.33%; }
                    .total-box { border: 2px solid #000; padding: 15px; margin-top: 20px; display: flex; justify-content: space-between; font-weight: bold; font-size: 16px; }
                    .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #555; }
                    @media print { body { padding: 20px; } }
                </style>
            </head>
            <body>
                <div class="store-name">${storeName}</div>
                <div class="title">تقرير بونص شهر (${monthName})</div>
                <div class="divider"></div>

                <div class="info-row">
                    <span class="info-label">التاريخ:</span>
                    <span class="info-value">${formatDate(bonus.createdAt)}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">الفترة:</span>
                    <span>من</span>
                    <span class="info-value">${formatDate(bonus.periodStart)}</span>
                    <span>إلى</span>
                    <span class="info-value">${formatDate(bonus.periodEnd)}</span>
                </div>

                <div class="section-title">المدفوعات</div>
                <table style="width: 100%; border-collapse: collapse; margin: 10px 0;">
                    <thead>
                        <tr style="background: #f0f0f0;">
                            <th style="border: 1px solid #000; padding: 8px; width: 50%;">المدفوعات</th>
                            <th style="border: 1px solid #000; padding: 8px; width: 50%;">البونص</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style="border: 1px solid #000; padding: 8px;"><strong>مبيعات الأقسام:</strong> ${Math.round(lightingTotal).toLocaleString("ar-EG")} ${currency}</td>
                            <td style="border: 1px solid #000; padding: 8px;"><strong>بونص الإضاءة:</strong> ${Math.round(lightingBonus).toLocaleString("ar-EG")} ${currency}</td>
                        </tr>
                        <tr>
                            <td style="border: 1px solid #000; padding: 8px;"><strong>الإضاءة:</strong> ${Math.round(lightingTotal).toLocaleString("ar-EG")} ${currency}</td>
                            <td style="border: 1px solid #000; padding: 8px;"><strong>بونص باقي الأقسام:</strong> ${Math.round(otherBonus).toLocaleString("ar-EG")} ${currency}</td>
                        </tr>
                        <tr>
                            <td style="border: 1px solid #000; padding: 8px;"><strong>باقي الأقسام:</strong> ${Math.round(otherVal).toLocaleString("ar-EG")} ${currency}</td>
                            <td style="border: 1px solid #000; padding: 8px;"><strong>الإجمالي:</strong> ${Math.round(bonus.bonusAmount).toLocaleString("ar-EG")} ${currency}</td>
                        </tr>
                    </tbody>
                </table>

                <div class="section-title">بيان المندوبين</div>
                <table style="width: 100%; border-collapse: collapse; margin: 10px 0;">
                    <thead>
                        <tr style="background: #f0f0f0;">
                            <th style="border: 1px solid #000; padding: 8px;">المندوب</th>
                            <th style="border: 1px solid #000; padding: 8px;">الإضاءة</th>
                            <th style="border: 1px solid #000; padding: 8px;">باقي الأقسام</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${repRows}
                        <tr style="font-weight: bold; background: #f0f0f0;">
                            <td style="border: 1px solid #000; padding: 8px;">الإجمالي</td>
                            <td style="border: 1px solid #000; padding: 8px;">${Math.round(lightingTotal).toLocaleString("ar-EG")} ${currency}</td>
                            <td style="border: 1px solid #000; padding: 8px;">${Math.round(otherVal).toLocaleString("ar-EG")} ${currency}</td>
                        </tr>
                    </tbody>
                </table>

                <div class="total-box">
                    <span>الملاحظات:</span>
                    <span>${bonus.notes || "____________________"}</span>
                </div>

                <div class="footer">
                    <div>طُبع بتاريخ ${new Date().toLocaleDateString("ar-EG")} ${new Date().toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}</div>
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
                                <Select value={selectedSupervisorId} onValueChange={setSelectedSupervisorId}>
                                    <SelectTrigger><SelectValue placeholder="اختر المشرف..." /></SelectTrigger>
                                    <SelectContent>
                                        {supervisors.map((sup) => (
                                            <SelectItem key={sup.id} value={sup.id}>{sup.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Period Selection */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="flex items-center gap-2"><Calendar className="h-4 w-4" />من تاريخ</Label>
                                    <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <Label className="flex items-center gap-2"><Calendar className="h-4 w-4" />إلى تاريخ</Label>
                                    <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
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
                                                <Badge key={rep.id} variant="secondary">{rep.name}</Badge>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">لا يوجد مندوبين تابعين لهذا المشرف</p>
                                    )}
                                </div>
                            )}

                            {/* Payments Summary */}
                            {selectedSupervisorId && dateFrom && dateTo && teamSalesData.totalPayments > 0 && (
                                <div className="space-y-3">
                                    {/* Total Payments */}
                                    <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <DollarSign className="h-5 w-5 text-blue-600" />
                                                <span className="font-semibold">إجمالي التحصيلات</span>
                                            </div>
                                            <span className="text-2xl font-bold text-blue-600">{formatCurrency(teamSalesData.totalPayments)}</span>
                                        </div>
                                    </div>

                                    {/* Condition Status */}
                                    <div className={`p-3 rounded-lg border ${teamSalesData.conditionMet ? "bg-green-50 dark:bg-green-950 border-green-300" : "bg-red-50 dark:bg-red-950 border-red-300"}`}>
                                        <div className="flex items-center gap-2">
                                            {teamSalesData.conditionMet ? (
                                                <CheckCircle className="h-5 w-5 text-green-600" />
                                            ) : (
                                                <XCircle className="h-5 w-5 text-red-600" />
                                            )}
                                            <span className={`font-semibold text-sm ${teamSalesData.conditionMet ? "text-green-700" : "text-red-700"}`}>
                                                {teamSalesData.conditionMet
                                                    ? "الشرط محقق: إجمالي قسم الإضاءة أقل من التحصيلات → حساب تلقائي"
                                                    : "الشرط غير محقق: إجمالي قسم الإضاءة ≥ التحصيلات → يجب إدخال البونص يدوياً"}
                                            </span>
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            قسم الإضاءة: {formatCurrency(teamSalesData.lightingTotal)} | التحصيلات: {formatCurrency(teamSalesData.totalPayments)}
                                        </p>
                                    </div>

                                    {/* Per-Category Breakdown */}
                                    {Object.keys(teamSalesData.byCategorySales).length > 0 && (
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
                                                    {Object.entries(teamSalesData.byCategorySales).map(([catName, data]) => (
                                                        <TableRow key={catName}>
                                                            <TableCell>{catName}</TableCell>
                                                            <TableCell className="text-center">
                                                                <Badge variant={data.percentage > 0 ? "default" : "secondary"}>
                                                                    {data.percentage > 0 ? `${data.percentage}%` : "—"}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className="text-left">{formatCurrency(data.sales)}</TableCell>
                                                            <TableCell className="text-left font-medium text-green-600">
                                                                {data.percentage > 0 ? formatCurrency(data.bonus) : "—"}
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                    <TableRow className="font-bold border-t-2">
                                                        <TableCell colSpan={2}>الإجمالي</TableCell>
                                                        <TableCell className="text-left">{formatCurrency(teamSalesData.bonusEligibleInvoicesTotal)}</TableCell>
                                                        <TableCell className="text-left text-green-600">{formatCurrency(teamSalesData.totalAutoBonus)}</TableCell>
                                                    </TableRow>
                                                </TableBody>
                                            </Table>
                                        </div>
                                    )}

                                    {/* Rep Table */}
                                    {teamSalesData.byRep.length > 0 && (
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>المندوب</TableHead>
                                                    <TableHead className="text-left">التحصيلات</TableHead>
                                                    <TableHead className="text-left">أقسام بونص</TableHead>
                                                    <TableHead className="text-left">أقسام بدون بونص</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {teamSalesData.byRep.map((rep) => (
                                                    <TableRow key={rep.id}>
                                                        <TableCell>{rep.name}</TableCell>
                                                        <TableCell className="text-left font-medium">{formatCurrency(rep.payments)}</TableCell>
                                                        <TableCell className="text-left">{formatCurrency(rep.bonusEligible)}</TableCell>
                                                        <TableCell className="text-left">{formatCurrency(rep.nonEligible)}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    )}

                                    {/* Manual/Auto Mode Toggle */}
                                    {teamSalesData.conditionMet && (
                                        <div className="flex items-center gap-2">
                                            <Badge
                                                variant={!effectiveManualMode ? "default" : "secondary"}
                                                className="cursor-pointer"
                                                onClick={() => setIsManualMode(false)}
                                            >
                                                تلقائي
                                            </Badge>
                                            <Badge
                                                variant={effectiveManualMode ? "default" : "secondary"}
                                                className="cursor-pointer"
                                                onClick={() => setIsManualMode(true)}
                                            >
                                                يدوي
                                            </Badge>
                                        </div>
                                    )}

                                    {/* Manual Input */}
                                    {effectiveManualMode && (
                                        <div className="space-y-2">
                                            <Label>مبلغ البونص (يدوي)</Label>
                                            <Input
                                                type="number"
                                                min="0"
                                                value={manualBonusAmount}
                                                onChange={(e) => setManualBonusAmount(e.target.value)}
                                                placeholder="أدخل مبلغ البونص يدوياً"
                                            />
                                        </div>
                                    )}

                                    {/* Bonus Amount */}
                                    <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <DollarSign className="h-5 w-5 text-green-600" />
                                                <span className="font-semibold">البونص {effectiveManualMode ? "(يدوي)" : "(تلقائي)"}</span>
                                            </div>
                                            <span className="text-2xl font-bold text-green-600">{formatCurrency(bonusAmount)}</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Notes */}
                            <div className="space-y-2">
                                <Label>ملاحظات (اختياري)</Label>
                                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="أي ملاحظات إضافية..." />
                            </div>

                            {/* Submit Button */}
                            <Button
                                onClick={handleApplyBonus}
                                disabled={isLoading || teamSalesData.totalPayments <= 0 || (effectiveManualMode && bonusAmount <= 0)}
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
                                <div className="text-center py-8 text-muted-foreground">لا توجد سجلات بونص سابقة</div>
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
                                                        التحصيلات: {formatCurrency(bonus.totalPayments || 0)}
                                                    </p>
                                                    <p className="text-sm text-muted-foreground">
                                                        المندوبين: {bonus.salesReps.map((r: any) => r.name).join("، ")}
                                                    </p>
                                                    {bonus.isManual && (
                                                        <Badge variant="outline" className="mt-1">يدوي</Badge>
                                                    )}
                                                    {bonus.notes && (
                                                        <p className="text-sm text-muted-foreground mt-1">{bonus.notes}</p>
                                                    )}
                                                </div>
                                                <div className="text-left space-y-2">
                                                    <p className="text-xl font-bold text-green-600">{formatCurrency(bonus.bonusAmount)}</p>
                                                    <div className="flex gap-1 mt-2">
                                                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEditDialog(bonus)} title="تعديل">
                                                            <Pencil className="h-4 w-4 text-blue-500" />
                                                        </Button>
                                                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handlePrintReport(bonus)} title="طباعة تقرير">
                                                            <Printer className="h-4 w-4 text-gray-600" />
                                                        </Button>
                                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => setDeleteConfirmDialog(bonus.id)} title="حذف">
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
                                <p>التحصيلات: <strong>{editingBonus && formatCurrency(editingBonus.totalPayments || 0)}</strong></p>
                                <p>فواتير الإضاءة: <strong>{editingBonus && formatCurrency(editingBonus.lightingInvoicesTotal || 0)}</strong></p>
                                <p>بونص الإضاءة: <strong>{editingBonus && formatCurrency(editingBonus.lightingBonus || 0)}</strong></p>
                                <p>بونص الأقسام الأخرى: <strong>{editingBonus && formatCurrency(editingBonus.otherBonus || 0)}</strong></p>
                            </div>
                            <div className="space-y-2">
                                <Label>مبلغ البونص</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    value={editBonusAmount}
                                    onChange={(e) => setEditBonusAmount(e.target.value)}
                                    placeholder="مبلغ البونص"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>ملاحظات</Label>
                                <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="ملاحظات..." />
                            </div>
                            {editingBonus && (
                                <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                                    <p className="font-semibold text-green-700 dark:text-green-400">
                                        البونص الجديد: {formatCurrency(parseFloat(editBonusAmount) || 0)}
                                    </p>
                                </div>
                            )}
                        </div>
                        <DialogFooter className="gap-2">
                            <Button variant="outline" onClick={() => { setEditDialog(false); setEditingBonus(null); }}>إلغاء</Button>
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
                            <span className="text-muted-foreground text-sm">لا يمكن التراجع عن هذا الإجراء</span>
                        </p>
                        <DialogFooter className="gap-2">
                            <Button variant="outline" onClick={() => setDeleteConfirmDialog(null)}>لا، إلغاء</Button>
                            <Button variant="destructive" onClick={() => deleteConfirmDialog && handleDeleteBonus(deleteConfirmDialog)}>
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
