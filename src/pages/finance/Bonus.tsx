/**
 * Bonus - صفحة البونص
 * لتطبيق البونص على العملاء بناءً على مدفوعاتهم خلال فترة معينة
 */
import { useState, useEffect, useMemo, useRef } from "react";
import { POSHeader } from "@/components/POS/POSHeader";
import { Card } from "@/components/ui/card";
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
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Gift,
    User,
    Check,
    Search,
    History,
    DollarSign,
    Percent,
    Calendar,
    Printer,
    Edit,
    Trash2,
} from "lucide-react";
import { db, Customer, Invoice } from "@/shared/lib/indexedDB";
import { useSettingsContext } from "@/contexts/SettingsContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn, getLocalDateString } from "@/lib/utils";
import { useCustomerBalances } from "@/hooks/useCustomerBalances";
import { usePagination } from "@/hooks/usePagination";
import { DataPagination } from "@/components/ui/DataPagination";

// نوع سجل البونص
interface BonusRecord {
    id: string;
    type: 'bonus' | 'discount'; // بونص أو خصم خاص
    customerId: string;
    customerName: string;
    periodStart: string;
    periodEnd: string;
    totalPayments: number;
    bonusPercentage: number;
    bonusAmount: number;
    createdAt: string;
    userId: string;
    userName: string;
    notes?: string;
}

export default function Bonus() {
    const { getSetting } = useSettingsContext();
    const { user } = useAuth();
    const currency = getSetting("currency") || "EGP";
    const bonusInputRef = useRef<HTMLInputElement>(null);

    // البيانات
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [recentBonuses, setRecentBonuses] = useState<BonusRecord[]>([]);

    const pagination = usePagination(recentBonuses);

    // نموذج الإدخال
    const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
    const [bonusPercentage, setBonusPercentage] = useState<string>("2");
    const [bonusAmount, setBonusAmount] = useState<string>("");
    const [notes, setNotes] = useState<string>("");
    const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
    const [customerSearchQuery, setCustomerSearchQuery] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [editingBonus, setEditingBonus] = useState<BonusRecord | null>(null);
    const [bonusType, setBonusType] = useState<'bonus' | 'discount'>('bonus');
    const [bonusDate, setBonusDate] = useState<string>(getLocalDateString());
    const { getBalance, refresh: refreshBalances } = useCustomerBalances([customers]);

    // الفترة الزمنية
    const currentYear = new Date().getFullYear();
    const [periodStart, setPeriodStart] = useState<string>(`${currentYear - 1}-01-01`);
    const [periodEnd, setPeriodEnd] = useState<string>(getLocalDateString());

    // مدفوعات العميل خلال الفترة
    const [customerPayments, setCustomerPayments] = useState<number>(0);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        // تحميل العملاء
        const allCustomers = await db.getAll<Customer>("customers");
        // ترتيب حسب الرصيد (الأعلى رصيد أولاً)
        const sortedCustomers = allCustomers.sort(
            (a, b) => (Number(b.currentBalance) || 0) - (Number(a.currentBalance) || 0)
        );
        setCustomers(sortedCustomers);

        // تحميل سجلات البونص
        await loadRecentBonuses();
    };

    const loadRecentBonuses = async () => {
        // سجلات البونص محفوظة في IndexedDB
        try {
            const bonuses = await db.getAll<BonusRecord>("customerBonuses");
            // ترتيب بالأحدث أولاً
            bonuses.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            setRecentBonuses(bonuses);

            // ميجريشن من localStorage لو فيه بيانات قديمة
            const saved = localStorage.getItem("pos-bonuses");
            if (saved) {
                const oldBonuses = JSON.parse(saved) as BonusRecord[];
                const existingIds = new Set(bonuses.map(b => b.id));
                let migratedCount = 0;
                for (const oldBonus of oldBonuses) {
                    if (!existingIds.has(oldBonus.id)) {
                        try {
                            await db.add("customerBonuses", oldBonus);
                            migratedCount++;
                        } catch { /* skip duplicates */ }
                    }
                }
                if (migratedCount > 0) {
                    console.log(`[بونص] ✅ تم ترحيل ${migratedCount} سجل بونص من localStorage إلى IndexedDB`);
                    // إعادة التحميل
                    const updatedBonuses = await db.getAll<BonusRecord>("customerBonuses");
                    updatedBonuses.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                    setRecentBonuses(updatedBonuses);
                }
                // حذف البيانات القديمة من localStorage
                localStorage.removeItem("pos-bonuses");
            }
        } catch {
            setRecentBonuses([]);
        }
    };

    // تحميل مدفوعات العميل عند اختياره
    const loadCustomerPayments = async (customerId: string) => {
        try {
            const allInvoices = await db.getAll<Invoice>("invoices");
            const customerInvoices = allInvoices.filter((inv) => {
                const invDate = new Date(inv.createdAt || inv.created_at || "");
                const startDate = new Date(periodStart);
                const endDate = new Date(periodEnd);
                endDate.setHours(23, 59, 59, 999);

                return (
                    inv.customerId === customerId &&
                    invDate >= startDate &&
                    invDate <= endDate
                );
            });

            // حساب إجمالي المدفوعات (المبالغ المدفوعة من الفواتير)
            const totalPaid = customerInvoices.reduce(
                (sum, inv) => sum + (inv.paidAmount || inv.paid_amount || 0),
                0
            );

            setCustomerPayments(totalPaid);

            // حساب البونص تلقائياً
            if (bonusPercentage) {
                const percentage = parseFloat(bonusPercentage) || 0;
                const calculatedBonus = Math.round(totalPaid * (percentage / 100));
                setBonusAmount(calculatedBonus.toString());
            }
        } catch (error) {
            console.error("Error loading customer payments:", error);
            setCustomerPayments(0);
        }
    };

    // تحديث البونص عند تغيير النسبة (فقط في نوع البونص)
    useEffect(() => {
        if (bonusType === 'bonus' && customerPayments > 0 && bonusPercentage) {
            const percentage = parseFloat(bonusPercentage) || 0;
            const calculatedBonus = Math.round(customerPayments * (percentage / 100));
            setBonusAmount(calculatedBonus.toString());
        }
    }, [bonusPercentage, customerPayments, bonusType]);

    // تصفية العملاء حسب البحث
    const filteredCustomers = useMemo(() => {
        if (!customerSearchQuery) return customers.slice(0, 50);
        const query = customerSearchQuery.toLowerCase();
        return customers
            .filter(
                (c) =>
                    c.name?.toLowerCase().includes(query) ||
                    c.phone?.includes(query)
            )
            .slice(0, 50);
    }, [customers, customerSearchQuery]);

    // العميل المختار
    const selectedCustomer = useMemo(() => {
        return customers.find((c) => c.id === selectedCustomerId);
    }, [customers, selectedCustomerId]);

    // معالجة تطبيق البونص
    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();

        if (!selectedCustomerId) {
            toast.error("يرجى اختيار العميل");
            return;
        }

        const bonusValue = parseFloat(bonusAmount);
        if (!bonusValue || bonusValue <= 0) {
            toast.error("يرجى إدخال مبلغ البونص");
            return;
        }

        setIsLoading(true);

        try {
            const customer = customers.find((c) => c.id === selectedCustomerId);
            if (!customer) {
                toast.error("العميل غير موجود");
                return;
            }

            // تحديث رصيد العميل (خصم مبلغ البونص)
            // البونص يُخصم من الرصيد لكن لا يُحتسب كدفعة
            if (!editingBonus) {
                const newBalance = (customer.currentBalance || 0) - bonusValue;
                const updatedCustomer: Customer = {
                    ...customer,
                    currentBalance: newBalance,
                };
                await db.update("customers", updatedCustomer);
            }

            // حفظ سجل البونص
            if (editingBonus) {
                // عند التعديل: نحسب الفرق ونعدل الرصيد
                const oldAmount = editingBonus.bonusAmount;
                const diff = bonusValue - oldAmount;
                const adjustedBalance = (customer.currentBalance || 0) - diff;
                const adjustedCustomer: Customer = { ...customer, currentBalance: adjustedBalance };
                await db.update("customers", adjustedCustomer);

                // تحديث السجل في IndexedDB
                const updatedBonus: BonusRecord = {
                    ...editingBonus,
                    type: bonusType,
                    periodStart: bonusType === 'bonus' ? periodStart : periodStart,
                    periodEnd: bonusType === 'bonus' ? periodEnd : '',
                    totalPayments: bonusType === 'bonus' ? customerPayments : 0,
                    bonusPercentage: bonusType === 'bonus' ? (parseFloat(bonusPercentage) || 0) : 0,
                    bonusAmount: bonusValue,
                    createdAt: new Date(bonusDate + 'T12:00:00').toISOString(),
                    notes: notes || undefined,
                };
                await db.update("customerBonuses", updatedBonus);
                setEditingBonus(null);
            } else {
                // إنشاء سجل جديد
                const bonusRecord: BonusRecord = {
                    id: `bonus_${Date.now()}`,
                    type: bonusType,
                    customerId: selectedCustomerId,
                    customerName: customer.name,
                    periodStart: bonusType === 'bonus' ? periodStart : periodStart,
                    periodEnd: bonusType === 'bonus' ? periodEnd : '',
                    totalPayments: bonusType === 'bonus' ? customerPayments : 0,
                    bonusPercentage: bonusType === 'bonus' ? (parseFloat(bonusPercentage) || 0) : 0,
                    bonusAmount: bonusValue,
                    createdAt: new Date(bonusDate + 'T12:00:00').toISOString(),
                    userId: user?.id || "",
                    userName: user?.name || "",
                    notes: notes || undefined,
                };
                await db.add("customerBonuses", bonusRecord);
            }

            toast.success(
                editingBonus
                    ? `تم تعديل ${bonusType === 'discount' ? 'خصم' : 'بونص'} ${Math.round(bonusValue)} ${currency} على ${customer.name}`
                    : `تم تطبيق ${bonusType === 'discount' ? 'خصم' : 'بونص'} ${Math.round(bonusValue)} ${currency} على ${customer.name}`
            );

            // إعادة تعيين النموذج
            setSelectedCustomerId("");
            setBonusAmount("");
            setNotes("");
            setCustomerSearchQuery("");
            setCustomerPayments(0);
            setBonusType('bonus');
            setBonusDate(getLocalDateString());

            // إعادة تحميل البيانات
            await loadData();
        } catch (error) {
            console.error("Error applying bonus:", error);
            toast.error("حدث خطأ أثناء تطبيق البونص");
        } finally {
            setIsLoading(false);
        }
    };

    // تعديل البونص
    const handleEdit = (bonus: BonusRecord) => {
        setEditingBonus(bonus);
        setBonusType(bonus.type || 'bonus');
        setSelectedCustomerId(bonus.customerId);
        setBonusPercentage(bonus.bonusPercentage.toString());
        setBonusAmount(bonus.bonusAmount.toString());
        setNotes(bonus.notes || "");
        setPeriodStart(bonus.periodStart);
        setPeriodEnd(bonus.periodEnd);
        setCustomerPayments(bonus.totalPayments);
        setBonusDate(bonus.createdAt ? getLocalDateString(new Date(bonus.createdAt)) : getLocalDateString());
    };

    // حذف البونص
    const handleDelete = async (bonusId: string) => {
        if (!confirm("هل أنت متأكد من حذف هذا البونص؟ سيتم إعادة المبلغ لرصيد العميل.")) return;

        try {
            const bonus = await db.get<BonusRecord>("customerBonuses", bonusId);
            if (!bonus) return;

            // إعادة المبلغ لرصيد العميل
            const customer = customers.find(c => c.id === bonus.customerId);
            if (customer) {
                const restoredBalance = (customer.currentBalance || 0) + bonus.bonusAmount;
                await db.update("customers", { ...customer, currentBalance: restoredBalance });
            }

            // حذف السجل من IndexedDB
            await db.delete("customerBonuses", bonusId);

            toast.success("تم حذف البونص وإعادة المبلغ للعميل");
            await loadData();
        } catch (error) {
            console.error("Error deleting bonus:", error);
            toast.error("حدث خطأ أثناء الحذف");
        }
    };

    // طباعة إيصال البونص / الخصم
    const handlePrintReceipt = async (bonus: BonusRecord) => {
        const customer = customers.find(c => c.id === bonus.customerId);
        const currentBalance = customer ? getBalance(customer.id, Number(customer.currentBalance || 0)) : 0;
        const previousBalance = currentBalance + bonus.bonusAmount;
        const isDiscount = bonus.type === 'discount';

        let logoBase64: string | null = null;
        try {
            const logoModule = await import("@/assets/images/longtime-logo.png");
            if (typeof logoModule.default === "string") logoBase64 = logoModule.default;
        } catch { /* ignore */ }

        const bonusDate = new Date(bonus.createdAt).toLocaleDateString("en-GB").replace(/\//g, '/');
        const receiptNumber = bonus.id.replace('bonus_', '');

        const titleText = isDiscount ? 'خصم خاص' : 'بونص';
        const titleColor = isDiscount ? '#e65100' : '#2e7d32';
        const amountLabel = isDiscount ? 'الخصم' : 'البونص';
        const periodStartFormatted = bonus.periodStart ? new Date(bonus.periodStart).toLocaleDateString('en-GB').replace(/\//g, '/') : '';
        const periodEndFormatted = bonus.periodEnd ? new Date(bonus.periodEnd).toLocaleDateString('en-GB').replace(/\//g, '/') : '';

        const bodyText = isDiscount
            ? (bonus.periodStart ? `نود اعلام سيادتكم انه بتاريخ ${periodStartFormatted} تم تنزيل خصم خاص وقدره:` : 'نود اعلام سيادتكم انه تم تنزيل خصم خاص وقدره:')
            : (bonus.periodStart && bonus.periodEnd
                ? `نود اعلام سيادتكم انه وفقا لمسحوباتكم عن الفترة من ${periodStartFormatted} الى ${periodEndFormatted} فقد تم خصم مبلغ وقدره`
                : 'نود اعلام سيادتكم انه وفقا لمسحوباتكم فقد تم خصم مبلغ وقدره');

        const formatAmount = (val: number) => {
            const abs = Math.abs(val);
            const formatted = abs % 1 !== 0 ? abs.toFixed(2) : abs.toLocaleString();
            return val < 0 ? `-${formatted}` : formatted;
        };

        const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
    <meta charset="UTF-8">
    <title>${titleText} - ${bonus.customerName}</title>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
    <style>
        @page { size: A4; margin: 15mm; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif; background: #fff; color: #333; direction: rtl; width: 800px; margin: 0 auto; padding: 20px; }
        
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0; }
        .header-right { }
        .header-title { font-size: 42px; font-weight: 800; color: ${titleColor}; background: ${isDiscount ? '#fff3e0' : '#e8f5e9'}; padding: 8px 40px; text-align: center; }
        .header-meta { margin-top: 8px; font-size: 14px; line-height: 2; }
        .header-meta .label { font-weight: 700; }
        .header-left { text-align: left; }
        .logo-img { width: 140px; height: auto; }
        .company-text { font-size: 20px; font-weight: 700; color: #2e7d32; margin-top: 5px; text-align: center; }
        
        .greeting { font-size: 14px; color: #666; margin: 5px 0 15px 0; }
        .customer-line { font-size: 24px; font-weight: 700; margin: 20px 0 5px 0; display: flex; align-items: baseline; gap: 20px; }
        .customer-line .label { font-size: 18px; color: #555; }
        
        .body-text { font-size: 18px; font-weight: 600; margin: 25px 0 15px 0; line-height: 1.8; }
        
        .amount-box { background: #fffde7; border: 2px solid #ccc; padding: 15px; text-align: center; margin: 15px 0 25px 0; }
        .amount-box .value { font-size: 36px; font-weight: 800; color: #333; }
        
        .notes-text { font-size: 20px; font-weight: 700; text-align: center; margin: 20px 0; color: #333; }
        
        .balance-section { margin: 25px 0; }
        .balance-row { display: flex; align-items: center; margin-bottom: 8px; font-size: 16px; }
        .balance-label { font-weight: 700; min-width: 130px; }
        .balance-value { font-weight: 700; font-size: 18px; border-bottom: 2px solid #333; padding-bottom: 2px; min-width: 180px; text-align: center; }
        
        @media print { body { width: 100%; padding: 15px; } }
    </style>
</head>
<body>
    <div class="header">
        <div class="header-right">
            <div class="header-title">${titleText}</div>
            <div class="header-meta">
                <div><span class="label">الرقم المرجعي</span>    ${receiptNumber}</div>
                <div><span class="label">تاريخ الاجراء:</span>    ${bonusDate}</div>
            </div>
        </div>
        <div class="header-left">
            ${logoBase64 ? `<img src="${logoBase64}" class="logo-img" alt="Logo">` : ''}
        </div>
    </div>

    <div class="greeting">تحية طيبة وبعد:</div>
    <div class="customer-line">
        <span class="label">السادة/</span>
        <span>${bonus.customerName}</span>
    </div>

    <div class="body-text">${bodyText}</div>

    <div class="amount-box">
        <div class="value">${formatAmount(-bonus.bonusAmount)}</div>
    </div>

    ${bonus.notes ? `<div class="notes-text">${bonus.notes}</div>` : ''}

    <div class="balance-section">
        <div class="balance-row">
            <span class="balance-label">الرصيد السابق:</span>
            <span class="balance-value">${formatAmount(previousBalance)}</span>
        </div>
        <div class="balance-row">
            <span class="balance-label">${amountLabel}:</span>
            <span class="balance-value">${formatAmount(-bonus.bonusAmount)}</span>
        </div>
        <div class="balance-row">
            <span class="balance-label">الرصيد الحالي:</span>
            <span class="balance-value">${formatAmount(currentBalance)}</span>
        </div>
    </div>
</body>
</html>`;

        const printWindow = window.open("", "_blank");
        if (printWindow) {
            printWindow.document.write(html);
            printWindow.document.close();
            printWindow.onload = () => {
                setTimeout(() => { printWindow.print(); }, 300);
            };
        }
    };

    // تنسيق التاريخ
    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString("ar-EG", {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    };

    // إحصائيات
    const totalBonusesThisYear = recentBonuses
        .filter((b) => new Date(b.createdAt).getFullYear() === currentYear)
        .reduce((sum, b) => sum + b.bonusAmount, 0);

    const totalBonusesCount = recentBonuses.length;

    return (
        <div className="min-h-screen bg-background" dir="rtl">
            <POSHeader />

            <div className="container mx-auto p-6">
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-3xl font-bold flex items-center gap-2">
                        <Gift className="h-8 w-8 text-primary" />
                        نظام البونص
                    </h1>
                </div>

                {/* الإحصائيات */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <Card className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">
                                    إجمالي البونصات هذا العام
                                </p>
                                <p className="text-2xl font-bold text-green-600">
                                    {Math.round(totalBonusesThisYear)} {currency}
                                </p>
                            </div>
                            <DollarSign className="h-8 w-8 text-green-600" />
                        </div>
                    </Card>
                    <Card className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">عدد البونصات</p>
                                <p className="text-2xl font-bold">{totalBonusesCount}</p>
                            </div>
                            <Gift className="h-8 w-8 text-primary" />
                        </div>
                    </Card>
                    <Card className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">
                                    مدفوعات العميل المختار
                                </p>
                                <p className="text-2xl font-bold text-blue-600">
                                    {Math.round(customerPayments)} {currency}
                                </p>
                            </div>
                            <User className="h-8 w-8 text-blue-600" />
                        </div>
                    </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* نموذج البونص */}
                    <Card className="p-6 lg:col-span-1">
                        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                            <Gift className="h-5 w-5" />
                            {editingBonus ? "تعديل البونص" : "تطبيق بونص جديد"}
                        </h2>
                        {editingBonus && (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="mb-4"
                                onClick={() => {
                                    setEditingBonus(null);
                                    setSelectedCustomerId("");
                                    setBonusAmount("");
                                    setNotes("");
                                    setCustomerSearchQuery("");
                                    setCustomerPayments(0);
                                }}
                            >
                                إلغاء التعديل
                            </Button>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {/* نوع العملية */}
                            <div className="space-y-2">
                                <Label>نوع العملية</Label>
                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        variant={bonusType === 'bonus' ? 'default' : 'outline'}
                                        className={`flex-1 ${bonusType === 'bonus' ? 'bg-green-600 hover:bg-green-700' : ''}`}
                                        onClick={() => {
                                            setBonusType('bonus');
                                            setBonusAmount('');
                                        }}
                                    >
                                        <Gift className="h-4 w-4 ml-2" />
                                        بونص
                                    </Button>
                                    <Button
                                        type="button"
                                        variant={bonusType === 'discount' ? 'default' : 'outline'}
                                        className={`flex-1 ${bonusType === 'discount' ? 'bg-orange-600 hover:bg-orange-700' : ''}`}
                                        onClick={() => {
                                            setBonusType('discount');
                                            setBonusAmount('');
                                            setCustomerPayments(0);
                                        }}
                                    >
                                        <Percent className="h-4 w-4 ml-2" />
                                        خصم خاص
                                    </Button>
                                </div>
                            </div>

                            {/* الفترة الزمنية */}
                            {bonusType === 'bonus' ? (
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-2">
                                        <Label className="flex items-center gap-1">
                                            <Calendar className="h-4 w-4" />
                                            من تاريخ
                                        </Label>
                                        <Input
                                            type="date"
                                            value={periodStart}
                                            onChange={(e) => setPeriodStart(e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="flex items-center gap-1">
                                            <Calendar className="h-4 w-4" />
                                            إلى تاريخ
                                        </Label>
                                        <Input
                                            type="date"
                                            value={periodEnd}
                                            onChange={(e) => setPeriodEnd(e.target.value)}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <Label className="flex items-center gap-1">
                                        <Calendar className="h-4 w-4" />
                                        تاريخ التسجيل
                                    </Label>
                                    <Input
                                        type="date"
                                        value={periodStart}
                                        onChange={(e) => setPeriodStart(e.target.value)}
                                    />
                                </div>
                            )}

                            {/* اختيار العميل */}
                            <div className="space-y-2">
                                <Label>العميل *</Label>
                                <Popover
                                    open={customerSearchOpen}
                                    onOpenChange={setCustomerSearchOpen}
                                >
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={customerSearchOpen}
                                            className="w-full justify-between h-12"
                                        >
                                            {selectedCustomer ? (
                                                <div className="flex flex-col items-start">
                                                    <span>{selectedCustomer.name}</span>
                                                    <span className="text-xs text-muted-foreground">
                                                        رصيد: {Math.round(getBalance(selectedCustomer.id, Number(selectedCustomer.currentBalance) || 0))}{" "}
                                                        {currency}
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground">
                                                    اختر أو ابحث عن عميل...
                                                </span>
                                            )}
                                            <Search className="h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[350px] p-0" align="start">
                                        <Command>
                                            <CommandInput
                                                placeholder="ابحث بالاسم أو رقم الهاتف..."
                                                value={customerSearchQuery}
                                                onValueChange={setCustomerSearchQuery}
                                            />
                                            <CommandList>
                                                <CommandEmpty>لا يوجد عملاء</CommandEmpty>
                                                <CommandGroup>
                                                    {filteredCustomers.map((customer) => (
                                                        <CommandItem
                                                            key={customer.id}
                                                            value={`${customer.name} ${customer.phone || ''}`}
                                                            onSelect={() => {
                                                                setSelectedCustomerId(customer.id);
                                                                setCustomerSearchOpen(false);
                                                                loadCustomerPayments(customer.id);
                                                                setTimeout(() => {
                                                                    bonusInputRef.current?.focus();
                                                                }, 100);
                                                            }}
                                                        >
                                                            <Check
                                                                className={cn(
                                                                    "mr-2 h-4 w-4",
                                                                    selectedCustomerId === customer.id
                                                                        ? "opacity-100"
                                                                        : "opacity-0"
                                                                )}
                                                            />
                                                            <div className="flex flex-col flex-1">
                                                                <span>{customer.name}</span>
                                                                <span className="text-xs text-muted-foreground">
                                                                    {customer.phone}
                                                                </span>
                                                            </div>
                                                            <Badge
                                                                variant={
                                                                    getBalance(customer.id, Number(customer.currentBalance) || 0) > 0
                                                                        ? "destructive"
                                                                        : "secondary"
                                                                }
                                                            >
                                                                {Math.round(getBalance(customer.id, Number(customer.currentBalance) || 0))}
                                                            </Badge>
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            </div>

                            {/* معلومات المدفوعات - تظهر فقط في البونص */}
                            {bonusType === 'bonus' && selectedCustomer && (
                                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                                    <p className="text-sm text-muted-foreground">
                                        مدفوعات العميل خلال الفترة:
                                    </p>
                                    <p className="text-xl font-bold text-blue-600">
                                        {Math.round(customerPayments)} {currency}
                                    </p>
                                </div>
                            )}

                            {/* نسبة البونص - تظهر فقط في البونص */}
                            {bonusType === 'bonus' && (
                                <div className="space-y-2">
                                    <Label className="flex items-center gap-1">
                                        <Percent className="h-4 w-4" />
                                        نسبة البونص (%)
                                    </Label>
                                    <Input
                                        type="number"
                                        value={bonusPercentage}
                                        onChange={(e) => setBonusPercentage(e.target.value)}
                                        placeholder="2"
                                        min="0"
                                        max="100"
                                        step="0.5"
                                        className="h-11"
                                    />
                                    <div className="flex gap-2">
                                        {[1, 2, 3, 5, 10].map((p) => (
                                            <Button
                                                key={p}
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setBonusPercentage(p.toString())}
                                            >
                                                {p}%
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* مبلغ البونص/الخصم */}
                            <div className="space-y-2">
                                <Label>{bonusType === 'discount' ? 'قيمة الخصم' : 'مبلغ البونص'}</Label>
                                <Input
                                    ref={bonusInputRef}
                                    type="number"
                                    value={bonusAmount}
                                    onChange={(e) => setBonusAmount(e.target.value)}
                                    placeholder="0"
                                    className={`h-14 text-2xl font-bold text-center ${bonusType === 'discount' ? 'text-orange-600' : 'text-green-600'}`}
                                />
                                <p className="text-xs text-muted-foreground text-center">
                                    سيتم خصم هذا المبلغ من رصيد العميل
                                </p>
                            </div>

                            {/* تاريخ الإجراء */}
                            <div className="space-y-2">
                                <Label className="flex items-center gap-1">
                                    <Calendar className="h-4 w-4" />
                                    تاريخ الإجراء
                                </Label>
                                <Input
                                    type="date"
                                    value={bonusDate}
                                    onChange={(e) => setBonusDate(e.target.value)}
                                />
                            </div>

                            {/* ملاحظات */}
                            <div className="space-y-2">
                                <Label>ملاحظات (اختياري)</Label>
                                <Input
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="ملاحظات على البونص..."
                                />
                            </div>

                            {/* زر التطبيق */}
                            <Button
                                type="submit"
                                className={`w-full h-12 text-lg ${editingBonus ? 'bg-blue-600 hover:bg-blue-700' : bonusType === 'discount' ? 'bg-orange-600 hover:bg-orange-700' : 'bg-green-600 hover:bg-green-700'}`}
                                disabled={isLoading || !selectedCustomerId || !bonusAmount}
                            >
                                {isLoading ? (
                                    "جاري الحفظ..."
                                ) : editingBonus ? (
                                    <>
                                        <Edit className="h-5 w-5 ml-2" />
                                        تعديل {bonusType === 'discount' ? 'الخصم' : 'البونص'}{" "}
                                        {bonusAmount ? `${Math.round(parseFloat(bonusAmount))} ${currency}` : ""}
                                    </>
                                ) : (
                                    <>
                                        {bonusType === 'discount' ? <Percent className="h-5 w-5 ml-2" /> : <Gift className="h-5 w-5 ml-2" />}
                                        تطبيق {bonusType === 'discount' ? 'خصم خاص' : 'بونص'}{" "}
                                        {bonusAmount ? `${Math.round(parseFloat(bonusAmount))} ${currency}` : ""}
                                    </>
                                )}
                            </Button>
                        </form>
                    </Card>

                    {/* سجل البونصات */}
                    <Card className="p-6 lg:col-span-2">
                        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                            <History className="h-5 w-5" />
                            سجل البونصات
                        </h2>

                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>العميل</TableHead>
                                    <TableHead>النوع</TableHead>
                                    <TableHead>الفترة / التاريخ</TableHead>
                                    <TableHead>المبلغ</TableHead>
                                    <TableHead>تاريخ التسجيل</TableHead>
                                    <TableHead className="text-center">إجراءات</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {recentBonuses.length === 0 ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={6}
                                            className="text-center text-muted-foreground py-8"
                                        >
                                            لا توجد بونصات / خصومات حتى الآن
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    pagination.paginatedItems.map((bonus) => (
                                        <TableRow key={bonus.id}>
                                            <TableCell className="font-medium">
                                                {bonus.customerName}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={(!bonus.type || bonus.type === 'bonus') ? 'default' : 'secondary'}
                                                    className={(!bonus.type || bonus.type === 'bonus') ? 'bg-green-600' : 'bg-orange-600 text-white'}>
                                                    {(!bonus.type || bonus.type === 'bonus') ? 'بونص' : 'خصم خاص'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground">
                                                {(!bonus.type || bonus.type === 'bonus') && bonus.periodStart ? (
                                                    <>{formatDate(bonus.periodStart)} - {formatDate(bonus.periodEnd)}</>
                                                ) : bonus.periodStart ? (
                                                    <>{formatDate(bonus.periodStart)}</>
                                                ) : (
                                                    <>{formatDate(bonus.createdAt)}</>
                                                )}
                                            </TableCell>
                                            <TableCell className={`font-bold ${(!bonus.type || bonus.type === 'bonus') ? 'text-green-600' : 'text-orange-600'}`}>
                                                {Math.round(bonus.bonusAmount)} {currency}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {formatDate(bonus.createdAt)}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1 justify-center">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-blue-600 hover:text-blue-700"
                                                        onClick={() => handlePrintReceipt(bonus)}
                                                        title="طباعة إيصال"
                                                    >
                                                        <Printer className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-amber-600 hover:text-amber-700"
                                                        onClick={() => handleEdit(bonus)}
                                                        title="تعديل"
                                                    >
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-red-600 hover:text-red-700"
                                                        onClick={() => handleDelete(bonus.id)}
                                                        title="حذف"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </Card>

                    <DataPagination {...pagination} entityName="بونص" />
                </div>
            </div>
        </div>
    );
}
