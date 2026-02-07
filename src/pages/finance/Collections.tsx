/**
 * Collections - صفحة القبض السريع
 * لتسهيل عمليات القبض من العملاء بشكل سريع
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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
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
    Wallet,
    User,
    CreditCard,
    Banknote,
    Plus,
    Check,
    Search,
    History,
    DollarSign,
    Filter,
    Calendar,
    X,
} from "lucide-react";
import { db, Customer, PaymentMethod } from "@/shared/lib/indexedDB";
import { useSettingsContext } from "@/contexts/SettingsContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// نوع سجل القبض
interface CollectionRecord {
    id: string;
    customerId: string;
    customerName: string;
    amount: number;
    paymentMethodId: string;
    paymentMethodName: string;
    createdAt: string;
    userId: string;
    userName: string;
    notes?: string;
}

export default function Collections() {
    const { getSetting } = useSettingsContext();
    const { user } = useAuth();
    const currency = getSetting("currency") || "EGP";
    const amountInputRef = useRef<HTMLInputElement>(null);

    // البيانات
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
    const [recentCollections, setRecentCollections] = useState<CollectionRecord[]>([]);

    // نموذج الإدخال
    const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
    const [amount, setAmount] = useState<string>("");
    const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string>("");
    const [notes, setNotes] = useState<string>("");
    const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
    const [customerSearchQuery, setCustomerSearchQuery] = useState("");
    const [globalSearchQuery, setGlobalSearchQuery] = useState(""); // Global filter for everything
    const [isLoading, setIsLoading] = useState(false);

    // Advanced filters
    const [filterDateFrom, setFilterDateFrom] = useState<string>("");
    const [filterDateTo, setFilterDateTo] = useState<string>("");
    const [filterPaymentMethodId, setFilterPaymentMethodId] = useState<string>("all");
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        // تحميل العملاء
        const allCustomers = await db.getAll<Customer>("customers");
        // ترتيب حسب الرصيد (الأعلى رصيد أولاً)
        const sortedCustomers = allCustomers.sort(
            (a, b) => (b.currentBalance || 0) - (a.currentBalance || 0)
        );
        setCustomers(sortedCustomers);

        // تحميل طرق الدفع
        const allMethods = await db.getAll<PaymentMethod>("paymentMethods");
        const activeMethods = allMethods.filter((m) => m.isActive);
        setPaymentMethods(activeMethods);

        // تحميل آخر عمليات القبض
        await loadRecentCollections();
    };

    const loadRecentCollections = async () => {
        // سجلات القبض محفوظة في localStorage
        try {
            const saved = localStorage.getItem('pos-collections');
            if (saved) {
                const collections = JSON.parse(saved) as CollectionRecord[];
                setRecentCollections(collections.slice(0, 20));
            }
        } catch {
            setRecentCollections([]);
        }
    };

    // تأثير لضمان اختيار طريقة الدفع "آجل" تلقائياً عند تحميل طرق الدفع
    useEffect(() => {
        if (paymentMethods.length > 0 && !selectedPaymentMethodId) {
            const selectDefaultMethod = async () => {
                let creditMethod = paymentMethods.find((m) => m.type === "credit") ||
                    paymentMethods.find((m) => m.name.includes("آجل")) ||
                    paymentMethods.find((m) => m.name.includes("اجل"));

                // إذا لم توجد طريقة دفع "آجل"، قم بإنشائها تلقائياً
                if (!creditMethod) {
                    try {
                        const newCreditMethod: PaymentMethod = {
                            id: `pm_${Date.now()}`,
                            name: "آجل",
                            type: "credit",
                            isActive: true,
                            createdAt: new Date().toISOString()
                        };
                        await db.add("paymentMethods", newCreditMethod);
                        creditMethod = newCreditMethod;

                        // تحديث القائمة
                        setPaymentMethods(prev => [...prev, newCreditMethod]);
                    } catch (error) {
                        console.error("Failed to auto-create credit payment method:", error);
                    }
                }

                if (creditMethod) {
                    setSelectedPaymentMethodId(creditMethod.id);
                } else {
                    const cashMethod = paymentMethods.find((m) => m.type === "cash");
                    if (cashMethod) {
                        setSelectedPaymentMethodId(cashMethod.id);
                    } else {
                        setSelectedPaymentMethodId(paymentMethods[0].id);
                    }
                }
            };

            selectDefaultMethod();
        }
    }, [paymentMethods, selectedPaymentMethodId]);

    // تصفية العملاء حسب البحث العام والبحث المحلي
    const filteredCustomers = useMemo(() => {
        // Combine both search queries
        const query = (globalSearchQuery || customerSearchQuery || "").toLowerCase();
        if (!query) return customers.slice(0, 20);
        return customers
            .filter(
                (c) =>
                    c.name?.toLowerCase().includes(query) ||
                    c.phone?.includes(query) ||
                    c.address?.toLowerCase().includes(query)
            )
            .slice(0, 20);
    }, [customers, customerSearchQuery, globalSearchQuery]);

    // تصفية سجلات القبض حسب البحث العام والفلاتر المتقدمة
    const filteredCollections = useMemo(() => {
        let filtered = [...recentCollections];

        // Date range filter
        if (filterDateFrom) {
            const fromDate = new Date(filterDateFrom);
            fromDate.setHours(0, 0, 0, 0);
            filtered = filtered.filter(c => new Date(c.createdAt) >= fromDate);
        }
        if (filterDateTo) {
            const toDate = new Date(filterDateTo);
            toDate.setHours(23, 59, 59, 999);
            filtered = filtered.filter(c => new Date(c.createdAt) <= toDate);
        }

        // Payment method filter
        if (filterPaymentMethodId && filterPaymentMethodId !== "all") {
            filtered = filtered.filter(c => c.paymentMethodId === filterPaymentMethodId);
        }

        // Global text search
        if (globalSearchQuery) {
            const query = globalSearchQuery.toLowerCase();
            filtered = filtered.filter(
                (c) =>
                    c.customerName?.toLowerCase().includes(query) ||
                    c.paymentMethodName?.toLowerCase().includes(query) ||
                    c.notes?.toLowerCase().includes(query) ||
                    c.userName?.toLowerCase().includes(query)
            );
        }

        return filtered;
    }, [recentCollections, globalSearchQuery, filterDateFrom, filterDateTo, filterPaymentMethodId]);

    // العميل المختار
    const selectedCustomer = useMemo(() => {
        return customers.find((c) => c.id === selectedCustomerId);
    }, [customers, selectedCustomerId]);

    // معالجة القبض
    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();

        if (!selectedCustomerId) {
            toast.error("يرجى اختيار العميل");
            return;
        }

        const amountValue = parseFloat(amount);
        if (!amountValue || amountValue <= 0) {
            toast.error("يرجى إدخال مبلغ صحيح");
            return;
        }

        if (!selectedPaymentMethodId) {
            toast.error("يرجى اختيار طريقة الدفع");
            return;
        }

        setIsLoading(true);

        try {
            const customer = customers.find((c) => c.id === selectedCustomerId);
            if (!customer) {
                toast.error("العميل غير موجود");
                return;
            }

            const paymentMethod = paymentMethods.find(
                (m) => m.id === selectedPaymentMethodId
            );

            // تحديث رصيد العميل (خصم المبلغ المدفوع)
            const newBalance = (customer.currentBalance || 0) - amountValue;
            const updatedCustomer: Customer = {
                ...customer,
                currentBalance: newBalance,
            };
            await db.update("customers", updatedCustomer);

            // إنشاء سجل الدفع وحفظه في localStorage
            const paymentRecord: CollectionRecord = {
                id: `collection_${Date.now()}`,
                customerId: selectedCustomerId,
                customerName: customer.name,
                amount: amountValue,
                paymentMethodId: selectedPaymentMethodId,
                paymentMethodName: paymentMethod?.name || "",
                createdAt: new Date().toISOString(),
                userId: user?.id || "",
                userName: user?.name || "",
                notes: notes || undefined,
            };

            // حفظ سجل الدفع في localStorage
            const existingCollections = localStorage.getItem('pos-collections');
            const collections: CollectionRecord[] = existingCollections ? JSON.parse(existingCollections) : [];
            collections.unshift(paymentRecord);
            // الاحتفاظ بآخر 100 سجل فقط
            localStorage.setItem('pos-collections', JSON.stringify(collections.slice(0, 100)));

            // Shift update removed

            toast.success(
                `تم قبض ${amountValue.toFixed(2)} ${currency} من ${customer.name}`
            );

            // إعادة تعيين النموذج
            setSelectedCustomerId("");
            setAmount("");
            setNotes("");
            setCustomerSearchQuery("");

            // إعادة تحميل البيانات
            await loadData();

            // التركيز على حقل البحث
            setCustomerSearchOpen(true);
        } catch (error) {
            console.error("Error processing collection:", error);
            toast.error("حدث خطأ أثناء عملية القبض");
        } finally {
            setIsLoading(false);
        }
    };

    // معالجة الضغط على Enter
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && selectedCustomerId && amount) {
            e.preventDefault();
            handleSubmit();
        }
    };

    // تنسيق التاريخ
    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString("ar-EG", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    // إحصائيات
    const totalCustomersWithDebt = customers.filter(
        (c) => (c.currentBalance || 0) > 0
    ).length;
    const totalDebt = customers.reduce(
        (sum, c) => sum + (c.currentBalance || 0),
        0
    );
    // Filtered statistics based on current filters
    const filteredTotal = filteredCollections.reduce((sum, c) => sum + c.amount, 0);
    // Today's collections (unfiltered)
    const todayCollections = recentCollections.filter((c) => {
        const today = new Date().toDateString();
        return new Date(c.createdAt).toDateString() === today;
    });
    const todayTotal = todayCollections.reduce((sum, c) => sum + c.amount, 0);

    return (
        <div className="min-h-screen bg-background" dir="rtl">
            <POSHeader />

            <div className="container mx-auto p-6">
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-3xl font-bold flex items-center gap-2">
                        <Wallet className="h-8 w-8 text-primary" />
                        القبض السريع
                    </h1>
                    {/* Global Search and Advanced Filters */}
                    <div className="flex items-center gap-2">
                        <div className="relative w-64">
                            <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                            <Input
                                placeholder="بحث شامل..."
                                value={globalSearchQuery}
                                onChange={(e) => setGlobalSearchQuery(e.target.value)}
                                className="pr-10"
                            />
                        </div>
                        <Button
                            variant={showAdvancedFilters ? "default" : "outline"}
                            size="icon"
                            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                        >
                            <Filter className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* Advanced Filters Panel */}
                {showAdvancedFilters && (
                    <Card className="p-4 mb-6">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-semibold flex items-center gap-2">
                                <Filter className="h-4 w-4" />
                                فلتر متقدم
                            </h3>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setFilterDateFrom("");
                                    setFilterDateTo("");
                                    setFilterPaymentMethodId("all");
                                    setGlobalSearchQuery("");
                                }}
                            >
                                <X className="h-4 w-4 ml-1" />
                                مسح الفلاتر
                            </Button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="space-y-2">
                                <Label className="flex items-center gap-1">
                                    <Calendar className="h-4 w-4" />
                                    من تاريخ
                                </Label>
                                <Input
                                    type="date"
                                    value={filterDateFrom}
                                    onChange={(e) => setFilterDateFrom(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="flex items-center gap-1">
                                    <Calendar className="h-4 w-4" />
                                    إلى تاريخ
                                </Label>
                                <Input
                                    type="date"
                                    value={filterDateTo}
                                    onChange={(e) => setFilterDateTo(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>طريقة الدفع</Label>
                                <Select
                                    value={filterPaymentMethodId}
                                    onValueChange={setFilterPaymentMethodId}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="جميع الطرق" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">جميع الطرق</SelectItem>
                                        {paymentMethods.map((method) => (
                                            <SelectItem key={method.id} value={method.id}>
                                                {method.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>النتائج</Label>
                                <div className="h-10 flex items-center">
                                    <Badge variant="secondary" className="text-lg px-4">
                                        {filteredCollections.length} عملية
                                    </Badge>
                                </div>
                            </div>
                        </div>
                    </Card>
                )}

                {/* الإحصائيات */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <Card className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">إجمالي المديونية</p>
                                <p className="text-2xl font-bold text-red-600">
                                    {totalDebt.toFixed(2)} {currency}
                                </p>
                            </div>
                            <DollarSign className="h-8 w-8 text-red-600" />
                        </div>
                    </Card>
                    <Card className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">عملاء مدينين</p>
                                <p className="text-2xl font-bold">{totalCustomersWithDebt}</p>
                            </div>
                            <User className="h-8 w-8 text-primary" />
                        </div>
                    </Card>
                    <Card className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">
                                    {(filterDateFrom || filterDateTo || filterPaymentMethodId !== "all" || globalSearchQuery)
                                        ? "إجمالي المُفلتر"
                                        : "قبض اليوم"}
                                </p>
                                <p className="text-2xl font-bold text-green-600">
                                    {(filterDateFrom || filterDateTo || filterPaymentMethodId !== "all" || globalSearchQuery)
                                        ? filteredTotal.toFixed(2)
                                        : todayTotal.toFixed(2)} {currency}
                                </p>
                            </div>
                            <CreditCard className="h-8 w-8 text-green-600" />
                        </div>
                    </Card>
                    <Card className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">
                                    {(filterDateFrom || filterDateTo || filterPaymentMethodId !== "all" || globalSearchQuery)
                                        ? "العمليات المُفلترة"
                                        : "عمليات اليوم"}
                                </p>
                                <p className="text-2xl font-bold">
                                    {(filterDateFrom || filterDateTo || filterPaymentMethodId !== "all" || globalSearchQuery)
                                        ? filteredCollections.length
                                        : todayCollections.length}
                                </p>
                            </div>
                            <History className="h-8 w-8 text-blue-600" />
                        </div>
                    </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* نموذج القبض السريع */}
                    <Card className="p-6 lg:col-span-1">
                        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                            <Plus className="h-5 w-5" />
                            قبض جديد
                        </h2>

                        <form onSubmit={handleSubmit} className="space-y-4">
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
                                                    <span className="text-xs text-red-500">
                                                        رصيد: {(selectedCustomer.currentBalance || 0).toFixed(2)}{" "}
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
                                                                // التركيز على حقل المبلغ
                                                                setTimeout(() => {
                                                                    amountInputRef.current?.focus();
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
                                                                    (customer.currentBalance || 0) > 0
                                                                        ? "destructive"
                                                                        : "secondary"
                                                                }
                                                            >
                                                                {(customer.currentBalance || 0).toFixed(2)}
                                                            </Badge>
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            </div>

                            {/* المبلغ */}
                            <div className="space-y-2">
                                <Label>المبلغ *</Label>
                                <Input
                                    ref={amountInputRef}
                                    type="number"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder="0.00"
                                    className="h-14 text-2xl font-bold text-center"
                                />
                                {selectedCustomer && (
                                    <div className="flex gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() =>
                                                setAmount(
                                                    (selectedCustomer.currentBalance || 0).toFixed(2)
                                                )
                                            }
                                        >
                                            كامل الرصيد
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() =>
                                                setAmount(
                                                    ((selectedCustomer.currentBalance || 0) / 2).toFixed(2)
                                                )
                                            }
                                        >
                                            نصف الرصيد
                                        </Button>
                                    </div>
                                )}
                            </div>

                            {/* طريقة الدفع */}
                            <div className="space-y-2">
                                <Label>طريقة الدفع</Label>
                                <Select
                                    value={selectedPaymentMethodId}
                                    onValueChange={setSelectedPaymentMethodId}
                                >
                                    <SelectTrigger className="h-11">
                                        <SelectValue placeholder="اختر طريقة الدفع" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {paymentMethods.map((method) => (
                                            <SelectItem key={method.id} value={method.id}>
                                                <div className="flex items-center gap-2">
                                                    {method.type === "cash" && (
                                                        <Banknote className="h-4 w-4" />
                                                    )}
                                                    {method.type === "visa" && (
                                                        <CreditCard className="h-4 w-4" />
                                                    )}
                                                    {method.type === "wallet" && (
                                                        <Wallet className="h-4 w-4" />
                                                    )}
                                                    <span>{method.name}</span>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* ملاحظات */}
                            <div className="space-y-2">
                                <Label>ملاحظات (اختياري)</Label>
                                <Input
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder="ملاحظات على عملية القبض..."
                                />
                            </div>

                            {/* زر الحفظ */}
                            <Button
                                type="submit"
                                className="w-full h-12 text-lg"
                                disabled={isLoading || !selectedCustomerId || !amount}
                            >
                                {isLoading ? (
                                    "جاري الحفظ..."
                                ) : (
                                    <>
                                        <Check className="h-5 w-5 ml-2" />
                                        قبض {amount ? `${parseFloat(amount).toFixed(2)} ${currency}` : ""}
                                    </>
                                )}
                            </Button>
                        </form>
                    </Card>

                    {/* آخر عمليات القبض */}
                    <Card className="p-6 lg:col-span-2">
                        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                            <History className="h-5 w-5" />
                            آخر عمليات القبض
                        </h2>

                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>العميل</TableHead>
                                    <TableHead>المبلغ</TableHead>
                                    <TableHead>طريقة الدفع</TableHead>
                                    <TableHead>التاريخ</TableHead>
                                    <TableHead>الموظف</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredCollections.length === 0 ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={5}
                                            className="text-center text-muted-foreground py-8"
                                        >
                                            لا توجد عمليات قبض حتى الآن
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredCollections.map((collection) => (
                                        <TableRow key={collection.id}>
                                            <TableCell className="font-medium">
                                                {collection.customerName}
                                            </TableCell>
                                            <TableCell className="text-green-600 font-bold">
                                                {collection.amount.toFixed(2)} {currency}
                                            </TableCell>
                                            <TableCell>{collection.paymentMethodName}</TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {formatDate(collection.createdAt)}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {collection.userName}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </Card>
                </div>
            </div>
        </div>
    );
}
