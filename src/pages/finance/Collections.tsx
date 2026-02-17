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
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
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
    FileSpreadsheet,
    Printer,
    Trash2,
    Edit,
    ShieldAlert,
    MessageCircle,
} from "lucide-react";
import { db, Customer, PaymentMethod, SalesRep, Supervisor } from "@/shared/lib/indexedDB";
import { useSettingsContext } from "@/contexts/SettingsContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { exportToExcel } from "@/lib/reportExport";
import { useCustomerBalances } from "@/hooks/useCustomerBalances";

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
    const { user, can } = useAuth();
    const currency = getSetting("currency") || "EGP";
    const amountInputRef = useRef<HTMLInputElement>(null);

    // صلاحيات القبض
    const canViewCollections = can("collections", "view");
    const canCreateCollection = can("collections", "create");
    const canEditCollection = can("collections", "edit");
    const canDeleteCollection = can("collections", "delete");

    // البيانات
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
    const [recentCollections, setRecentCollections] = useState<CollectionRecord[]>([]);

    const { getBalance, refresh: refreshBalances } = useCustomerBalances([customers]);

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
    const [filterDateFrom, setFilterDateFrom] = useState<string>(new Date().toISOString().split('T')[0]);
    const [filterDateTo, setFilterDateTo] = useState<string>(new Date().toISOString().split('T')[0]);
    const [filterPaymentMethodId, setFilterPaymentMethodId] = useState<string>("all");
    const [filterSupervisorId, setFilterSupervisorId] = useState<string>("all");
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

    // Supervisors and sales reps
    const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
    const [salesReps, setSalesReps] = useState<SalesRep[]>([]);

    // Edit dialog state
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [editingCollection, setEditingCollection] = useState<CollectionRecord | null>(null);
    const [editAmount, setEditAmount] = useState("");
    const [editNotes, setEditNotes] = useState("");
    const [editPaymentMethodId, setEditPaymentMethodId] = useState("");

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        // تحميل العملاء
        const allCustomers = await db.getAll<Customer>("customers");
        // ترتيب حسب الرصيد (الأعلى رصيد أولاً)
        const sortedCustomers = allCustomers.sort(
            (a, b) => Number(b.currentBalance || 0) - Number(a.currentBalance || 0)
        );
        setCustomers(sortedCustomers);

        // تحميل طرق الدفع
        const allMethods = await db.getAll<PaymentMethod>("paymentMethods");
        const activeMethods = allMethods.filter((m) => m.isActive);
        setPaymentMethods(activeMethods);

        // تحميل المندوبين والمشرفين
        const allReps = await db.getAll<SalesRep>("salesReps");
        setSalesReps(allReps);
        const allSupervisors = await db.getAll<Supervisor>("supervisors");
        setSupervisors(allSupervisors.filter(s => s.isActive));

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

        // Supervisor filter - filter by customers whose salesRep belongs to supervisor
        if (filterSupervisorId && filterSupervisorId !== "all") {
            const supervisorRepIds = salesReps
                .filter(r => r.supervisorId === filterSupervisorId)
                .map(r => r.id);
            const supervisorCustomerIds = customers
                .filter(c => c.salesRepId && supervisorRepIds.includes(c.salesRepId))
                .map(c => c.id);
            filtered = filtered.filter(c => supervisorCustomerIds.includes(c.customerId));
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
    }, [recentCollections, globalSearchQuery, filterDateFrom, filterDateTo, filterPaymentMethodId, filterSupervisorId, salesReps, customers]);

    // العميل المختار
    const selectedCustomer = useMemo(() => {
        return customers.find((c) => c.id === selectedCustomerId);
    }, [customers, selectedCustomerId]);

    // طباعة إيصال القبض
    const handlePrintReceipt = async (collection: CollectionRecord) => {
        const customer = customers.find(c => c.id === collection.customerId);
        const currentBalance = customer ? getBalance(customer.id, Number(customer.currentBalance || 0)) : 0;
        // The current balance already has this payment deducted, so previousBalance = currentBalance + amount
        const previousBalance = currentBalance + Number(collection.amount);

        // Reuse the same receipt design
        await generateCollectionReceipt(collection, previousBalance, currentBalance);
    };

    // تصدير البيانات إلى Excel
    const handleExportToExcel = () => {
        if (filteredCollections.length === 0) {
            toast.error("لا توجد بيانات للتصدير");
            return;
        }

        exportToExcel({
            title: "تقرير عمليات القبض",
            fileName: `تقرير_القبض_${filterDateFrom || 'all'}_${filterDateTo || 'all'}`,
            data: filteredCollections.map((c) => ({
                customerName: c.customerName,
                date: new Date(c.createdAt).toLocaleDateString("ar-EG"),
                amount: c.amount,
                transactionId: c.id,
                paymentMethod: c.paymentMethodName,
                user: c.userName,
                notes: c.notes || "",
            })),
            columns: [
                { header: "اسم العميل", dataKey: "customerName" },
                { header: "التاريخ", dataKey: "date" },
                { header: "المبلغ", dataKey: "amount" },
                { header: "رقم العملية", dataKey: "transactionId" },
                { header: "طريقة الدفع", dataKey: "paymentMethod" },
                { header: "المستخدم", dataKey: "user" },
                { header: "ملاحظات", dataKey: "notes" },
            ],
            summary: [
                { label: "إجمالي العمليات", value: filteredCollections.length },
                { label: "إجمالي المبلغ", value: filteredCollections.reduce((sum, c) => sum + c.amount, 0) },
            ],
        });

        toast.success("تم تصدير البيانات بنجاح");
    };

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
            const previousBalance = getBalance(customer.id, Number(customer.currentBalance || 0));
            const newBalance = previousBalance - amountValue;
            const updatedCustomer: Customer = {
                ...customer,
                currentBalance: newBalance,
            };
            await db.update("customers", updatedCustomer);

            // إنشاء رقم إيصال تسلسلي
            const existingCollections = localStorage.getItem('pos-collections');
            const prevCollections: CollectionRecord[] = existingCollections ? JSON.parse(existingCollections) : [];
            
            // حساب أعلى رقم إيصال موجود
            let maxReceiptNum = 0;
            prevCollections.forEach((c: CollectionRecord) => {
                const num = parseInt(c.id.replace('collection_', ''), 10);
                if (!isNaN(num) && num > maxReceiptNum && num < 1000000000) {
                    maxReceiptNum = num;
                }
            });
            
            // أيضاً التحقق من سجلات الدفع في IndexedDB
            try {
                const allPayments = await db.getAll<any>("payments");
                allPayments.forEach((p: any) => {
                    if (p.id && typeof p.id === 'string' && p.id.startsWith('collection_')) {
                        const num = parseInt(p.id.replace('collection_', ''), 10);
                        if (!isNaN(num) && num > maxReceiptNum && num < 1000000000) {
                            maxReceiptNum = num;
                        }
                    }
                });
            } catch (_e) { /* ignore */ }
            
            const nextReceiptNum = maxReceiptNum + 1;
            
            const paymentRecord: CollectionRecord = {
                id: `collection_${nextReceiptNum}`,
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

            // حفظ سجل الدفع في IndexedDB payments store (للظهور في كشف الحساب)
            const dbPaymentRecord = {
                id: paymentRecord.id,
                customerId: selectedCustomerId,
                customerName: customer.name,
                amount: amountValue,
                paymentMethodId: selectedPaymentMethodId,
                paymentMethodName: paymentMethod?.name || "",
                paymentType: "collection",
                createdAt: new Date().toISOString(),
                userId: user?.id || "",
                userName: user?.name || "",
                notes: notes || undefined,
            };
            await db.add("payments", dbPaymentRecord);

            // حفظ سجل الدفع في localStorage أيضاً
            const savedCollections = localStorage.getItem('pos-collections');
            const collections: CollectionRecord[] = savedCollections ? JSON.parse(savedCollections) : [];
            collections.unshift(paymentRecord);
            // الاحتفاظ بآخر 100 سجل فقط
            localStorage.setItem('pos-collections', JSON.stringify(collections.slice(0, 100)));

            // Shift update removed

            toast.success(
                `تم قبض ${amountValue.toFixed(2)} ${currency} من ${customer.name}`
            );

            // Generate and print receipt
            generateCollectionReceipt(paymentRecord, previousBalance, newBalance);

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

    // بناء HTML لإيصال القبض (بدون سكريبت الطباعة)
    const buildReceiptHTML = async (record: CollectionRecord, previousBalance: number, newBalance: number, forPrint = false) => {
        const receiptDate = new Date(record.createdAt).toLocaleDateString("ar-EG");
        const customer = customers.find(c => c.id === record.customerId);
        const customerCode = customer?.id?.slice(-8) || '';
        const rawNum = record.id.replace('collection_', '');
        const receiptNumber = parseInt(rawNum, 10) > 1000000000 ? String(parseInt(rawNum, 10) % 100000) : rawNum;

        // Load logo & QR
        let logoBase64: string | null = null;
        let qrBase64: string | null = null;
        try {
            const logoModule = await import("@/assets/images/longtime-logo.png");
            if (typeof logoModule.default === "string") logoBase64 = logoModule.default;
        } catch (_e) { /* ignore */ }
        try {
            const QRCode = (await import("qrcode")).default;
            qrBase64 = await QRCode.toDataURL("https://longtimelt.com", { width: 120, margin: 1 });
        } catch (_e) { /* ignore */ }

        const receiptContent = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
    <meta charset="UTF-8">
    <title>إيصال قبض - ${record.id}</title>
    <style>
        @page { size: A5 landscape; margin: 10mm; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
            background: #fff;
            color: #333;
            direction: rtl;
            width: 700px;
            margin: 0 auto;
            padding: 15px;
        }
        .receipt-container {
            border: 2px solid #2b7cba;
            padding: 0;
            position: relative;
        }
        /* Header */
        .receipt-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 15px 25px;
            border-bottom: 2px solid #2b7cba;
            background: linear-gradient(135deg, #f8fbff 0%, #eef5fc 100%);
        }
        .company-name {
            font-size: 36px;
            font-weight: bold;
            color: #2b7cba;
        }
        .logo-img {
            width: 90px;
            height: auto;
        }
        /* Title */
        .receipt-title {
            text-align: center;
            padding: 12px 20px;
            position: relative;
        }
        .receipt-title-box {
            display: inline-block;
            border: 2px solid #333;
            padding: 6px 30px;
            font-size: 18px;
            font-weight: bold;
            letter-spacing: 1px;
        }
        /* Type badge */
        .receipt-type {
            position: absolute;
            left: 25px;
            top: 50%;
            transform: translateY(-50%);
            background: #2b7cba;
            color: #fff;
            padding: 6px 20px;
            font-size: 16px;
            font-weight: bold;
            border-radius: 4px;
        }
        /* Info section */
        .receipt-info {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            padding: 15px 25px;
            border-bottom: 2px solid #2b7cba;
            background: #f0f7ff;
        }
        .customer-info {
            text-align: right;
        }
        .customer-name {
            font-size: 22px;
            font-weight: bold;
            color: #333;
        }
        .customer-contact {
            font-size: 13px;
            color: #666;
            margin-top: 3px;
        }
        .receipt-meta {
            text-align: left;
            font-size: 13px;
            line-height: 2;
        }
        .receipt-meta .label {
            color: #2b7cba;
            font-weight: bold;
        }
        /* Amounts section */
        .amounts-section {
            padding: 20px 25px;
        }
        .amount-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }
        .amount-label {
            background: #2b7cba;
            color: #fff;
            padding: 8px 22px;
            font-size: 16px;
            font-weight: bold;
            border-radius: 4px;
            min-width: 150px;
            text-align: center;
        }
        .amount-label.red {
            background: #e53935;
        }
        .amount-value {
            font-size: 26px;
            font-weight: bold;
            color: #333;
            min-width: 200px;
            text-align: center;
        }
        .amount-value.paid {
            font-size: 28px;
            border: 2px solid #333;
            padding: 5px 25px;
        }
        .amount-value.current {
            font-size: 28px;
            color: #333;
        }
        /* Notes */
        .notes-section {
            padding: 0 25px 10px;
            font-size: 13px;
            color: #666;
        }
        .notes-section span {
            font-weight: bold;
            color: #333;
        }
        /* Footer */
        .receipt-footer {
            border-top: 2px solid #2b7cba;
            padding: 15px 25px;
            text-align: center;
            background: #f8fbff;
        }
        .footer-text {
            font-size: 14px;
            color: #333;
            margin-bottom: 8px;
        }
        .footer-link {
            font-size: 18px;
            font-weight: bold;
            color: #2b7cba;
            text-decoration: underline;
        }
        .qr-code {
            margin-top: 10px;
        }
        .qr-code img {
            width: 100px;
            height: 100px;
        }
        .employee-info {
            font-size: 11px;
            color: #999;
            margin-top: 8px;
        }
        @media print {
            body { width: 100%; padding: 0; }
        }
    </style>
</head>
<body>
    <div class="receipt-container">
        <!-- Header -->
        <div class="receipt-header">
            <div class="company-name">لونج تايم</div>
            ${logoBase64 ? `<img src="${logoBase64}" class="logo-img" alt="Logo">` : ''}
        </div>

        <!-- Title -->
        <div class="receipt-title">
            <span class="receipt-title-box">ايصال استلام نقدية/تحويل بنكي</span>
            <span class="receipt-type">قبض</span>
        </div>

        <!-- Customer & Meta Info -->
        <div class="receipt-info">
            <div class="customer-info">
                <div class="customer-name">${record.customerName}</div>
                ${customer?.phone ? `<div class="customer-contact">${customer.phone}</div>` : ''}
            </div>
            <div class="receipt-meta">
                <div><span class="label">رقم الايصال: </span>${receiptNumber}</div>
                <div><span class="label">التاريخ: </span>${receiptDate}</div>
                <div><span class="label">كود العميل: </span>${customerCode}</div>
            </div>
        </div>

        <!-- Amounts -->
        <div class="amounts-section">
            <div class="amount-row">
                <span class="amount-label">الرصيد السابق</span>
                <span class="amount-value">${Number(previousBalance).toFixed(2)}</span>
            </div>
            <div class="amount-row">
                <span class="amount-label">المدفوع</span>
                <span class="amount-value paid">${Number(record.amount).toFixed(2)}</span>
            </div>
            <div class="amount-row">
                <span class="amount-label red">الرصيد الحالي</span>
                <span class="amount-value current">${Number(newBalance).toFixed(2)}</span>
            </div>
        </div>

        ${record.notes ? `
        <div class="notes-section">
            <span>ملاحظات: </span>${record.notes}
        </div>` : ''}

        <!-- Footer -->
        <div class="receipt-footer">
            <div class="footer-text">للاطلاع على صور منتجاتنا يمكنك زيارة موقعنا</div>
            <div class="footer-link">longtimelt.com</div>
            ${qrBase64 ? `<div class="qr-code"><img src="${qrBase64}" alt="QR Code"></div>` : ''}
            <div class="employee-info">المحصّل: ${record.userName}</div>
        </div>
    </div>
    ${forPrint ? `<script>window.onload = function() { window.print(); };</script>` : ''}
</body>
</html>`;

        return receiptContent;
    };

    // Generate collection receipt (for print)
    const generateCollectionReceipt = async (record: CollectionRecord, previousBalance: number, newBalance: number) => {
        const html = await buildReceiptHTML(record, previousBalance, newBalance, true);
        const printWindow = window.open("", "_blank");
        if (printWindow) {
            printWindow.document.write(html);
            printWindow.document.close();
        }
    };

    // إرسال إيصال القبض عبر واتساب
    const handleSendReceiptWhatsApp = async (collection: CollectionRecord) => {
        const customer = customers.find(c => c.id === collection.customerId);
        if (!customer?.phone) {
            toast.error("العميل ليس لديه رقم هاتف");
            return;
        }

        try {
            toast.info("📄 جاري تجهيز إيصال القبض...");

            // حساب الأرصدة
            const currentBalance = getBalance(customer.id, Number(customer.currentBalance || 0));
            const previousBalance = currentBalance + Number(collection.amount);

            // بناء HTML بدون سكريبت الطباعة
            const html = await buildReceiptHTML(collection, previousBalance, currentBalance, false);

            // تحويل HTML إلى PDF عبر iframe
            toast.info("🖨️ جاري توليد PDF...");
            const pdfBlob = await new Promise<Blob>((resolve, reject) => {
                const iframe = document.createElement("iframe");
                iframe.style.position = "fixed";
                iframe.style.right = "-9999px";
                iframe.style.top = "-9999px";
                iframe.style.width = "700px";
                iframe.style.height = "500px";
                document.body.appendChild(iframe);

                const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                if (!iframeDoc) {
                    document.body.removeChild(iframe);
                    reject(new Error("Failed to create iframe"));
                    return;
                }

                iframeDoc.open();
                iframeDoc.write(html);
                iframeDoc.close();

                // انتظار تحميل الصور
                setTimeout(async () => {
                    try {
                        const html2canvas = (await import("html2canvas")).default;
                        const canvas = await html2canvas(iframeDoc.body, {
                            scale: 2,
                            useCORS: true,
                            allowTaint: true,
                            backgroundColor: "#ffffff",
                        });

                        const { jsPDF } = await import("jspdf");
                        const imgData = canvas.toDataURL("image/png");
                        const imgWidth = 210; // A4 width mm
                        const imgHeight = (canvas.height * imgWidth) / canvas.width;

                        const pdf = new jsPDF({
                            orientation: imgHeight > imgWidth ? "portrait" : "landscape",
                            unit: "mm",
                            format: [imgWidth, Math.max(imgHeight, 148)],
                        });
                        pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
                        const blob = pdf.output("blob");

                        document.body.removeChild(iframe);
                        resolve(blob);
                    } catch (err) {
                        document.body.removeChild(iframe);
                        reject(err);
                    }
                }, 500);
            });

            toast.info("📤 جاري الإرسال عبر واتساب...");

            // تحويل PDF إلى Base64
            const base64data = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(pdfBlob);
            });

            const message = `💰 *إيصال قبض*\n` +
                `*العميل:* ${collection.customerName}\n` +
                `*المبلغ:* ${Number(collection.amount).toFixed(2)} ${currency}\n` +
                `*التاريخ:* ${new Date(collection.createdAt).toLocaleDateString("ar-EG")}\n` +
                `*الرصيد السابق:* ${Number(previousBalance).toFixed(2)}\n` +
                `*الرصيد الحالي:* ${Number(currentBalance).toFixed(2)}\n\n` +
                `شركة لونج تايم للصناعة الكهربائية`;

            const phone = customer.phone.replace(/[^0-9]/g, "");
            const rawNum2 = collection.id.replace('collection_', '');
            const receiptNumber = parseInt(rawNum2, 10) > 1000000000 ? String(parseInt(rawNum2, 10) % 100000) : rawNum2;

            // البحث عن حساب واتساب نشط
            const accounts = await db.getAll("whatsappAccounts");
            const activeAccount = accounts.find((a: any) => a.isActive && a.status === "connected");

            if (activeAccount) {
                const { whatsappService } = await import("@/services/whatsapp/whatsappService");

                const msgId = await whatsappService.sendMessage(
                    (activeAccount as any).id,
                    phone,
                    message,
                    {
                        type: "document",
                        url: base64data,
                        caption: message,
                        filename: `إيصال-قبض-${receiptNumber}.pdf`
                    },
                    {
                        customerId: customer.id,
                        type: "payment_receipt",
                    }
                );

                try {
                    const delivered = await (whatsappService as any).waitForMessage(msgId, 60000);
                    if (delivered) {
                        toast.success("✅ تم إرسال إيصال القبض بنجاح!");
                    } else {
                        toast.error("❌ فشل إرسال الإيصال");
                    }
                } catch {
                    toast.success("✅ تم إرسال إيصال القبض!");
                }
            } else {
                // Fallback to wa.me
                const encodedMessage = encodeURIComponent(message);
                window.open(`https://wa.me/${phone}?text=${encodedMessage}`, "_blank");
                toast.info("لا يوجد حساب واتساب متصل، تم فتح واتساب ويب");
            }
        } catch (error) {
            console.error("WhatsApp receipt send error:", error);
            toast.error("حدث خطأ أثناء إرسال الإيصال");
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
        (c) => getBalance(c.id, Number(c.currentBalance || 0)) > 0
    ).length;
    const totalDebt = customers.reduce(
        (sum, c) => sum + Math.max(0, getBalance(c.id, Number(c.currentBalance || 0))),
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

    // فتح نافذة تعديل القبض
    const handleEditCollection = (collection: CollectionRecord) => {
        setEditingCollection(collection);
        setEditAmount(collection.amount.toString());
        setEditNotes(collection.notes || "");
        setEditPaymentMethodId(collection.paymentMethodId);
        setEditDialogOpen(true);
    };

    // حفظ تعديل القبض
    const handleSaveEditCollection = async () => {
        if (!editingCollection) return;

        const newAmount = parseFloat(editAmount);
        if (!newAmount || newAmount <= 0) {
            toast.error("يرجى إدخال مبلغ صحيح");
            return;
        }

        const oldAmount = editingCollection.amount;
        const amountDiff = newAmount - oldAmount; // positive = increased, negative = decreased
        const paymentMethod = paymentMethods.find(m => m.id === editPaymentMethodId);

        try {
            // تحديث رصيد العميل بالفرق
            const customer = customers.find(c => c.id === editingCollection.customerId);
            if (customer) {
                const currentBalance = Number(customer.currentBalance || 0);
                // إذا زاد المبلغ → ينقص الرصيد أكثر، إذا نقص → يرجع جزء
                const updatedBalance = currentBalance - amountDiff;
                await db.update("customers", { ...customer, currentBalance: updatedBalance });
            }

            // تحديث في localStorage
            const saved = localStorage.getItem('pos-collections');
            if (saved) {
                const collections: CollectionRecord[] = JSON.parse(saved);
                const idx = collections.findIndex(c => c.id === editingCollection.id);
                if (idx !== -1) {
                    collections[idx] = {
                        ...collections[idx],
                        amount: newAmount,
                        notes: editNotes || undefined,
                        paymentMethodId: editPaymentMethodId,
                        paymentMethodName: paymentMethod?.name || collections[idx].paymentMethodName,
                    };
                    localStorage.setItem('pos-collections', JSON.stringify(collections));
                }
            }

            // تحديث في IndexedDB payments
            try {
                const payment = await db.get<any>("payments", editingCollection.id);
                if (payment) {
                    await db.update("payments", {
                        ...payment,
                        amount: newAmount,
                        notes: editNotes || undefined,
                        paymentMethodId: editPaymentMethodId,
                        paymentMethodName: paymentMethod?.name || payment.paymentMethodName,
                    });
                }
            } catch (_e) { /* قد لا يكون موجود */ }

            toast.success("تم تعديل عملية القبض بنجاح");
            setEditDialogOpen(false);
            setEditingCollection(null);
            await loadData();
        } catch (error) {
            console.error("Error editing collection:", error);
            toast.error("حدث خطأ أثناء تعديل عملية القبض");
        }
    };

    // حذف عملية قبض
    const handleDeleteCollection = async (collection: CollectionRecord) => {
        if (!confirm(`هل أنت متأكد من حذف عملية القبض بمبلغ ${Number(collection.amount || 0).toFixed(2)} ${currency} من ${collection.customerName}؟`)) {
            return;
        }
        try {
            // حذف من localStorage
            const saved = localStorage.getItem('pos-collections');
            if (saved) {
                const collections: CollectionRecord[] = JSON.parse(saved);
                const updated = collections.filter(c => c.id !== collection.id);
                localStorage.setItem('pos-collections', JSON.stringify(updated));
            }

            // حذف من payments في IndexedDB
            try {
                await db.delete("payments", collection.id);
            } catch (_e) { /* قد لا يكون موجود */ }

            // إعادة رصيد العميل
            const customer = customers.find(c => c.id === collection.customerId);
            if (customer) {
                const restoredBalance = Number(customer.currentBalance || 0) + Number(collection.amount);
                await db.update("customers", { ...customer, currentBalance: restoredBalance });
            }

            toast.success("تم حذف عملية القبض بنجاح");
            await loadData();
        } catch (error) {
            console.error("Error deleting collection:", error);
            toast.error("حدث خطأ أثناء حذف عملية القبض");
        }
    };

    return (
        <div className="min-h-screen bg-background" dir="rtl">
            <POSHeader />

            {!canViewCollections ? (
                <div className="container mx-auto p-6">
                    <Card className="p-8 text-center">
                        <ShieldAlert className="h-12 w-12 text-red-500 mx-auto mb-4" />
                        <h2 className="text-2xl font-bold mb-2">غير مصرح</h2>
                        <p className="text-muted-foreground">ليس لديك صلاحية عرض القبض</p>
                    </Card>
                </div>
            ) : (
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
                                    setFilterSupervisorId("all");
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
                                <Label>المشرف</Label>
                                <Select
                                    value={filterSupervisorId}
                                    onValueChange={setFilterSupervisorId}
                                >
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
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                            <div className="space-y-2">
                                <Label>النتائج</Label>
                                <div className="h-10 flex items-center">
                                    <Badge variant="secondary" className="text-lg px-4">
                                        {filteredCollections.length} عملية
                                    </Badge>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>تصدير</Label>
                                <Button
                                    variant="outline"
                                    onClick={handleExportToExcel}
                                    className="h-10 gap-2"
                                >
                                    <FileSpreadsheet className="h-4 w-4" />
                                    تصدير Excel
                                </Button>
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

                <div className={`grid grid-cols-1 ${canCreateCollection ? 'lg:grid-cols-3' : ''} gap-6`}>
                    {/* نموذج القبض السريع */}
                    {canCreateCollection && (
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
                                                        رصيد: {getBalance(selectedCustomer.id, Number(selectedCustomer.currentBalance || 0)).toFixed(2)}{" "}
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
                                                                    getBalance(customer.id, Number(customer.currentBalance || 0)) > 0
                                                                        ? "destructive"
                                                                        : "secondary"
                                                                }
                                                            >
                                                                {getBalance(customer.id, Number(customer.currentBalance || 0)).toFixed(2)}
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
                                                    getBalance(selectedCustomer.id, Number(selectedCustomer.currentBalance || 0)).toFixed(2)
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
                                                    (getBalance(selectedCustomer.id, Number(selectedCustomer.currentBalance || 0)) / 2).toFixed(2)
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
                    )}

                    {/* آخر عمليات القبض */}
                    <Card className={`p-6 ${canCreateCollection ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
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
                                    <TableHead>إجراءات</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredCollections.length === 0 ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={6}
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
                                                {Number(collection.amount || 0).toFixed(2)} {currency}
                                            </TableCell>
                                            <TableCell>{collection.paymentMethodName}</TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {formatDate(collection.createdAt)}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {collection.userName}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handlePrintReceipt(collection)}
                                                        title="طباعة إيصال"
                                                    >
                                                        <Printer className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleSendReceiptWhatsApp(collection)}
                                                        title="إرسال عبر واتساب"
                                                        className="text-green-600 hover:text-green-800 hover:bg-green-50"
                                                    >
                                                        <MessageCircle className="h-4 w-4" />
                                                    </Button>
                                                    {canEditCollection && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleEditCollection(collection)}
                                                            title="تعديل عملية القبض"
                                                            className="text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                                                        >
                                                            <Edit className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                    {canDeleteCollection && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleDeleteCollection(collection)}
                                                            title="حذف عملية القبض"
                                                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </Card>
                </div>
            </div>
            )}

            {/* نافذة تعديل القبض */}
            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                <DialogContent className="max-w-md" dir="rtl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Edit className="h-5 w-5" />
                            تعديل عملية القبض
                        </DialogTitle>
                    </DialogHeader>
                    {editingCollection && (
                        <div className="space-y-4 py-2">
                            <div className="p-3 bg-muted rounded-lg">
                                <p className="font-medium">{editingCollection.customerName}</p>
                                <p className="text-sm text-muted-foreground">
                                    التاريخ: {formatDate(editingCollection.createdAt)}
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label>المبلغ *</Label>
                                <Input
                                    type="number"
                                    value={editAmount}
                                    onChange={(e) => setEditAmount(e.target.value)}
                                    placeholder="0.00"
                                    className="h-12 text-xl font-bold text-center"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>طريقة الدفع</Label>
                                <Select
                                    value={editPaymentMethodId}
                                    onValueChange={setEditPaymentMethodId}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="اختر طريقة الدفع" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {paymentMethods.map((method) => (
                                            <SelectItem key={method.id} value={method.id}>
                                                {method.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>ملاحظات</Label>
                                <Input
                                    value={editNotes}
                                    onChange={(e) => setEditNotes(e.target.value)}
                                    placeholder="ملاحظات..."
                                />
                            </div>
                        </div>
                    )}
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                            إلغاء
                        </Button>
                        <Button onClick={handleSaveEditCollection}>
                            <Check className="h-4 w-4 ml-2" />
                            حفظ التعديل
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
