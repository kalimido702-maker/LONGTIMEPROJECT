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
} from "lucide-react";
import { db, Customer, Invoice } from "@/shared/lib/indexedDB";
import { useSettingsContext } from "@/contexts/SettingsContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCustomerBalances } from "@/hooks/useCustomerBalances";
import { usePagination } from "@/hooks/usePagination";
import { DataPagination } from "@/components/ui/DataPagination";

// نوع سجل البونص
interface BonusRecord {
    id: string;
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
    const { getBalance, refresh: refreshBalances } = useCustomerBalances([customers]);

    // الفترة الزمنية
    const currentYear = new Date().getFullYear();
    const [periodStart, setPeriodStart] = useState<string>(`${currentYear - 1}-01-01`);
    const [periodEnd, setPeriodEnd] = useState<string>(new Date().toISOString().split("T")[0]);

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
        // سجلات البونص محفوظة في localStorage
        try {
            const saved = localStorage.getItem("pos-bonuses");
            if (saved) {
                const bonuses = JSON.parse(saved) as BonusRecord[];
                setRecentBonuses(bonuses.slice(0, 20));
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

    // تحديث البونص عند تغيير النسبة
    useEffect(() => {
        if (customerPayments > 0 && bonusPercentage) {
            const percentage = parseFloat(bonusPercentage) || 0;
            const calculatedBonus = Math.round(customerPayments * (percentage / 100));
            setBonusAmount(calculatedBonus.toString());
        }
    }, [bonusPercentage, customerPayments]);

    // تصفية العملاء حسب البحث
    const filteredCustomers = useMemo(() => {
        if (!customerSearchQuery) return customers.slice(0, 20);
        const query = customerSearchQuery.toLowerCase();
        return customers
            .filter(
                (c) =>
                    c.name?.toLowerCase().includes(query) ||
                    c.phone?.includes(query)
            )
            .slice(0, 20);
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
            const newBalance = (customer.currentBalance || 0) - bonusValue;
            const updatedCustomer: Customer = {
                ...customer,
                currentBalance: newBalance,
            };
            await db.update("customers", updatedCustomer);

            // إنشاء سجل البونص وحفظه
            const bonusRecord: BonusRecord = {
                id: `bonus_${Date.now()}`,
                customerId: selectedCustomerId,
                customerName: customer.name,
                periodStart,
                periodEnd,
                totalPayments: customerPayments,
                bonusPercentage: parseFloat(bonusPercentage) || 0,
                bonusAmount: bonusValue,
                createdAt: new Date().toISOString(),
                userId: user?.id || "",
                userName: user?.name || "",
                notes: notes || undefined,
            };

            // حفظ سجل البونص في localStorage
            const existingBonuses = localStorage.getItem("pos-bonuses");
            const bonuses: BonusRecord[] = existingBonuses
                ? JSON.parse(existingBonuses)
                : [];
            bonuses.unshift(bonusRecord);
            // الاحتفاظ بآخر 100 سجل فقط
            localStorage.setItem("pos-bonuses", JSON.stringify(bonuses.slice(0, 100)));

            toast.success(
                `تم تطبيق بونص ${Math.round(bonusValue)} ${currency} على ${customer.name}`
            );

            // إعادة تعيين النموذج
            setSelectedCustomerId("");
            setBonusAmount("");
            setNotes("");
            setCustomerSearchQuery("");
            setCustomerPayments(0);

            // إعادة تحميل البيانات
            await loadData();
        } catch (error) {
            console.error("Error applying bonus:", error);
            toast.error("حدث خطأ أثناء تطبيق البونص");
        } finally {
            setIsLoading(false);
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
                            تطبيق بونص جديد
                        </h2>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {/* الفترة الزمنية */}
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
                                                            value={customer.id}
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

                            {/* معلومات المدفوعات */}
                            {selectedCustomer && (
                                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                                    <p className="text-sm text-muted-foreground">
                                        مدفوعات العميل خلال الفترة:
                                    </p>
                                    <p className="text-xl font-bold text-blue-600">
                                        {Math.round(customerPayments)} {currency}
                                    </p>
                                </div>
                            )}

                            {/* نسبة البونص */}
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

                            {/* مبلغ البونص */}
                            <div className="space-y-2">
                                <Label>مبلغ البونص</Label>
                                <Input
                                    ref={bonusInputRef}
                                    type="number"
                                    value={bonusAmount}
                                    onChange={(e) => setBonusAmount(e.target.value)}
                                    placeholder="0"
                                    className="h-14 text-2xl font-bold text-center text-green-600"
                                />
                                <p className="text-xs text-muted-foreground text-center">
                                    سيتم خصم هذا المبلغ من رصيد العميل
                                </p>
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
                                className="w-full h-12 text-lg bg-green-600 hover:bg-green-700"
                                disabled={isLoading || !selectedCustomerId || !bonusAmount}
                            >
                                {isLoading ? (
                                    "جاري الحفظ..."
                                ) : (
                                    <>
                                        <Gift className="h-5 w-5 ml-2" />
                                        تطبيق بونص{" "}
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
                                    <TableHead>الفترة</TableHead>
                                    <TableHead>المدفوعات</TableHead>
                                    <TableHead>النسبة</TableHead>
                                    <TableHead>البونص</TableHead>
                                    <TableHead>التاريخ</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {recentBonuses.length === 0 ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={6}
                                            className="text-center text-muted-foreground py-8"
                                        >
                                            لا توجد بونصات حتى الآن
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    pagination.paginatedItems.map((bonus) => (
                                        <TableRow key={bonus.id}>
                                            <TableCell className="font-medium">
                                                {bonus.customerName}
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground">
                                                {formatDate(bonus.periodStart)} -{" "}
                                                {formatDate(bonus.periodEnd)}
                                            </TableCell>
                                            <TableCell>
                                                {Math.round(bonus.totalPayments)} {currency}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="secondary">{bonus.bonusPercentage}%</Badge>
                                            </TableCell>
                                            <TableCell className="text-green-600 font-bold">
                                                {Math.round(bonus.bonusAmount)} {currency}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {formatDate(bonus.createdAt)}
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
