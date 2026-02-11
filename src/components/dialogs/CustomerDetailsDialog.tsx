import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
    ChevronDown,
    ChevronUp,
    FileText,
    CreditCard,
    Calendar,
    Package,
    DollarSign,
    Phone,
    MapPin,
    Award,
    Banknote,
} from "lucide-react";
import { db, Customer, Invoice, PaymentMethod } from "@/shared/lib/indexedDB";
import { useSettingsContext } from "@/contexts/SettingsContext";
import { calculateSingleCustomerBalance } from "@/hooks/useCustomerBalances";

interface Payment {
    id: string;
    invoiceId?: string;
    customerId?: string;
    amount: number;
    paymentMethodId: string;
    paymentMethodName: string;
    paymentType: string;
    shiftId?: string;
    createdAt: string;
}

interface CustomerDetailsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    customer: Customer | null;
}

export const CustomerDetailsDialog = ({
    open,
    onOpenChange,
    customer,
}: CustomerDetailsDialogProps) => {
    const { getSetting } = useSettingsContext();
    const currency = getSetting("currency") || "EGP";

    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [calculatedBalance, setCalculatedBalance] = useState<number | null>(null);
    const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (open && customer) {
            loadCustomerData();
        }
    }, [open, customer]);

    const loadCustomerData = async () => {
        if (!customer) return;
        setLoading(true);

        try {
            // جلب جميع الفواتير
            const allInvoices = await db.getAll<Invoice>("invoices");
            const customerInvoices = allInvoices
                .filter((inv) => inv.customerId === customer.id)
                .sort(
                    (a, b) =>
                        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                );
            setInvoices(customerInvoices);

            // جلب طرق الدفع
            const methods = await db.getAll<PaymentMethod>("paymentMethods");
            setPaymentMethods(methods);

            // جلب سجل التسديدات للعميل
            const allPayments = await db.getAll<Payment>("payments");
            const customerPayments = allPayments
                .filter((p) => p.customerId === customer.id)
                .sort(
                    (a, b) =>
                        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                );
            setPayments(customerPayments);

            // حساب الرصيد الفعلي من الحركات
            const actualBalance = await calculateSingleCustomerBalance(customer.id);
            setCalculatedBalance(actualBalance);
        } catch (error) {
            console.error("Error loading customer data:", error);
        } finally {
            setLoading(false);
        }
    };

    const getPaymentMethodName = (methodId: string): string => {
        const method = paymentMethods.find((m) => m.id === methodId);
        return method?.name || methodId;
    };

    const getStatusBadge = (invoice: Invoice) => {
        if (invoice.paymentStatus === "paid") {
            return <Badge className="bg-green-500">مدفوعة</Badge>;
        } else if (invoice.paymentStatus === "partial") {
            return <Badge className="bg-yellow-500">دفع جزئي</Badge>;
        } else {
            return <Badge className="bg-red-500">غير مدفوعة</Badge>;
        }
    };

    const getPaymentTypeBadge = (invoice: Invoice) => {
        if (invoice.paymentType === "cash") {
            return <Badge variant="outline">نقدي</Badge>;
        } else if (invoice.paymentType === "credit") {
            return <Badge variant="outline" className="border-orange-500 text-orange-600">آجل</Badge>;
        } else if (invoice.paymentType === "installment") {
            return <Badge variant="outline" className="border-purple-500 text-purple-600">تقسيط</Badge>;
        }
        return null;
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString("ar-EG", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    // Calculate totals
    const totalPurchases = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
    const totalPaid = invoices.reduce((sum, inv) => sum + (inv.paidAmount || 0), 0);
    // استخدام الرصيد المحسوب الفعلي بدلاً من الرصيد المخزن
    const totalRemaining = calculatedBalance !== null ? calculatedBalance : Number(customer?.currentBalance || 0);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" dir="rtl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-2xl">
                        <FileText className="h-6 w-6 text-primary" />
                        تفاصيل العميل
                    </DialogTitle>
                </DialogHeader>

                {customer && (
                    <div className="flex-1 overflow-y-auto space-y-4">
                        {/* Customer Info Card */}
                        <Card className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-200 dark:border-blue-800">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                    <p className="text-sm text-muted-foreground">اسم العميل</p>
                                    <p className="font-bold text-lg">{customer.name}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Phone className="h-4 w-4 text-muted-foreground" />
                                    <div>
                                        <p className="text-sm text-muted-foreground">الهاتف</p>
                                        <p className="font-semibold">{customer.phone}</p>
                                    </div>
                                </div>
                                {customer.address && (
                                    <div className="flex items-center gap-2">
                                        <MapPin className="h-4 w-4 text-muted-foreground" />
                                        <div>
                                            <p className="text-sm text-muted-foreground">العنوان</p>
                                            <p className="font-semibold">{customer.address}</p>
                                        </div>
                                    </div>
                                )}
                                <div className="flex items-center gap-2">
                                    <Award className="h-4 w-4 text-muted-foreground" />
                                    <div>
                                        <p className="text-sm text-muted-foreground">نقاط الولاء</p>
                                        <p className="font-semibold text-primary">{customer.loyaltyPoints}</p>
                                    </div>
                                </div>
                            </div>
                        </Card>

                        {/* Summary Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <Card className="p-3 text-center">
                                <p className="text-xs text-muted-foreground">عدد الفواتير</p>
                                <p className="text-2xl font-bold text-primary">{invoices.length}</p>
                            </Card>
                            <Card className="p-3 text-center">
                                <p className="text-xs text-muted-foreground">إجمالي المشتريات</p>
                                <p className="text-2xl font-bold text-blue-600">{totalPurchases.toFixed(2)}</p>
                            </Card>
                            <Card className="p-3 text-center">
                                <p className="text-xs text-muted-foreground">إجمالي المدفوع</p>
                                <p className="text-2xl font-bold text-green-600">{totalPaid.toFixed(2)}</p>
                            </Card>
                            <Card className="p-3 text-center">
                                <p className="text-xs text-muted-foreground">الرصيد المستحق</p>
                                <p className={`text-2xl font-bold ${totalRemaining > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                    {totalRemaining.toFixed(2)}
                                </p>
                            </Card>
                        </div>

                        {/* Payments History */}
                        {payments.length > 0 && (
                            <div className="space-y-2">
                                <h3 className="font-semibold text-lg flex items-center gap-2">
                                    <Banknote className="h-5 w-5 text-green-600" />
                                    سجل التسديدات ({payments.length})
                                </h3>
                                <div className="max-h-48 overflow-y-auto space-y-2">
                                    {payments.map((payment) => (
                                        <Card key={payment.id} className="p-3 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
                                            <div className="flex justify-between items-center">
                                                <div>
                                                    <p className="font-semibold text-green-700">
                                                        {payment.amount.toFixed(2)} {currency}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {payment.paymentMethodName} - {formatDate(payment.createdAt)}
                                                    </p>
                                                    {payment.invoiceId && (
                                                        <p className="text-xs text-blue-600">
                                                            فاتورة #{payment.invoiceId}
                                                        </p>
                                                    )}
                                                </div>
                                                <Badge className="bg-green-500">
                                                    {payment.paymentType === "credit_payment" ? "تسديد آجل" :
                                                        payment.paymentType === "installment_payment" ? "تسديد قسط" :
                                                            "دفعة"}
                                                </Badge>
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Invoices List */}
                        <div className="space-y-2">
                            <h3 className="font-semibold text-lg flex items-center gap-2">
                                <FileText className="h-5 w-5" />
                                سجل الفواتير ({invoices.length})
                            </h3>

                            {loading ? (
                                <p className="text-center py-4 text-muted-foreground">جاري التحميل...</p>
                            ) : invoices.length === 0 ? (
                                <p className="text-center py-8 text-muted-foreground">لا توجد فواتير لهذا العميل</p>
                            ) : (
                                <div className="space-y-2">
                                    {invoices.map((invoice) => (
                                        <Collapsible
                                            key={invoice.id}
                                            open={expandedInvoice === invoice.id}
                                            onOpenChange={(isOpen) =>
                                                setExpandedInvoice(isOpen ? invoice.id : null)
                                            }
                                        >
                                            <Card className="overflow-hidden">
                                                <CollapsibleTrigger asChild>
                                                    <div className="p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                                                        <div className="flex justify-between items-center">
                                                            <div className="flex items-center gap-3">
                                                                {expandedInvoice === invoice.id ? (
                                                                    <ChevronUp className="h-4 w-4" />
                                                                ) : (
                                                                    <ChevronDown className="h-4 w-4" />
                                                                )}
                                                                <div>
                                                                    <p className="font-semibold">فاتورة #{invoice.id}</p>
                                                                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                                                                        <Calendar className="h-3 w-3" />
                                                                        {formatDate(invoice.createdAt)}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                {getPaymentTypeBadge(invoice)}
                                                                {getStatusBadge(invoice)}
                                                                <span className="font-bold text-lg">
                                                                    {invoice.total.toFixed(2)} {currency}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </CollapsibleTrigger>

                                                <CollapsibleContent>
                                                    <div className="border-t p-4 bg-muted/30 space-y-4">
                                                        {/* Products */}
                                                        <div>
                                                            <h4 className="font-semibold mb-2 flex items-center gap-2">
                                                                <Package className="h-4 w-4" />
                                                                المنتجات ({invoice.items?.length || 0})
                                                            </h4>
                                                            <div className="space-y-1">
                                                                {invoice.items?.map((item, idx) => (
                                                                    <div
                                                                        key={idx}
                                                                        className="flex justify-between text-sm bg-white p-2 rounded dark:bg-gray-800"
                                                                    >
                                                                        <span>
                                                                            {item.productName} x {item.quantity}
                                                                        </span>
                                                                        <span className="font-semibold">
                                                                            {item.total?.toFixed(2)} {currency}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>

                                                        {/* Payment Info */}
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div>
                                                                <h4 className="font-semibold mb-2 flex items-center gap-2">
                                                                    <CreditCard className="h-4 w-4" />
                                                                    معلومات الدفع
                                                                </h4>
                                                                <div className="space-y-1 text-sm">
                                                                    {invoice.paymentMethodAmounts &&
                                                                        Object.entries(invoice.paymentMethodAmounts).map(
                                                                            ([methodId, amount]: [string, any]) =>
                                                                                amount > 0 && (
                                                                                    <div
                                                                                        key={methodId}
                                                                                        className="flex justify-between bg-white dark:bg-slate-900 p-2 rounded"
                                                                                    >
                                                                                        <span>{getPaymentMethodName(methodId)}</span>
                                                                                        <span>{parseFloat(amount).toFixed(2)} {currency}</span>
                                                                                    </div>
                                                                                )
                                                                        )}
                                                                </div>
                                                            </div>

                                                            <div>
                                                                <h4 className="font-semibold mb-2 flex items-center gap-2">
                                                                    <DollarSign className="h-4 w-4" />
                                                                    ملخص المبالغ
                                                                </h4>
                                                                <div className="space-y-1 text-sm">
                                                                    <div className="flex justify-between bg-white dark:bg-slate-900 p-2 rounded">
                                                                        <span>الإجمالي</span>
                                                                        <span className="font-semibold">{invoice.total?.toFixed(2)} {currency}</span>
                                                                    </div>
                                                                    <div className="flex justify-between bg-green-50 dark:bg-green-950/30 p-2 rounded">
                                                                        <span>المدفوع</span>
                                                                        <span className="font-semibold text-green-600">
                                                                            {invoice.paidAmount?.toFixed(2)} {currency}
                                                                        </span>
                                                                    </div>
                                                                    {invoice.remainingAmount > 0 && (
                                                                        <div className="flex justify-between bg-red-50 dark:bg-red-950/30 p-2 rounded">
                                                                            <span>المتبقي</span>
                                                                            <span className="font-semibold text-red-600">
                                                                                {invoice.remainingAmount?.toFixed(2)} {currency}
                                                                            </span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Due Date for credit invoices */}
                                                        {invoice.dueDate && (
                                                            <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded p-2 text-sm">
                                                                <span className="text-yellow-800">
                                                                    📅 تاريخ الاستحقاق: {formatDate(invoice.dueDate)}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </CollapsibleContent>
                                            </Card>
                                        </Collapsible>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="pt-4 border-t">
                    <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full">
                        إغلاق
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};
