import { useState, useEffect, useMemo, useCallback } from "react";
import { POSHeader } from "@/components/POS/POSHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
    Search,
    Calendar,
    FileText,
    Package,
    CreditCard,
    DollarSign,
    User,
    RotateCcw,
    Printer,
    Truck,
    PackageCheck,
    Check,
    X,
    Trash2,
    Edit, // Import Edit icon
    MessageSquare, // Import MessageSquare icon for WhatsApp
    ChevronRight,
    ChevronLeft,
} from "lucide-react";
import { useNavigate } from "react-router-dom"; // Import useNavigate
import { db, Invoice, Customer, PaymentMethod, SalesReturn, SalesReturnItem, Product, Shift, SalesRep } from "@/shared/lib/indexedDB";
import { useSettingsContext } from "@/contexts/SettingsContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { printInvoiceReceipt, type InvoiceReceiptData, type InvoiceItem } from "@/lib/printing";
import { ExcelExportButton } from "@/components/common/ExcelExportButton";
import { TABLE_SETTINGS } from "@/lib/constants";

export default function Invoices() {
    const { getSetting } = useSettingsContext();
    const { user, can } = useAuth();
    const navigate = useNavigate(); // Hook for navigation
    const currency = getSetting("currency") || "EGP";

    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);

    // Filters
    const [searchQuery, setSearchQuery] = useState("");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [paymentTypeFilter, setPaymentTypeFilter] = useState<string>("all");
    const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>("all");

    // Return Dialog States
    const [isReturnDialogOpen, setIsReturnDialogOpen] = useState(false);
    const [returnInvoice, setReturnInvoice] = useState<Invoice | null>(null);
    const [returnItems, setReturnItems] = useState<(SalesReturnItem & { maxQuantity?: number })[]>([]);
    const [returnReason, setReturnReason] = useState("");
    const [refundMethod, setRefundMethod] = useState<"cash" | "credit" | "balance">("cash");

    // Delivery Status Filter
    const [deliveryStatusFilter, setDeliveryStatusFilter] = useState<string>("all");

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState<number>(TABLE_SETTINGS.DEFAULT_PAGE_SIZE);

    // Permissions
    const canEditInvoice = can("invoices", "edit");
    const canDeleteInvoice = can("invoices", "delete");
    const [editInvoiceDate, setEditInvoiceDate] = useState<string>("");
    const [isEditingDate, setIsEditingDate] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        const allInvoices = await db.getAll<Invoice>("invoices");
        // Sort by date descending
        const sortedInvoices = allInvoices.sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setInvoices(sortedInvoices);

        const allCustomers = await db.getAll<Customer>("customers");
        setCustomers(allCustomers);

        const allMethods = await db.getAll<PaymentMethod>("paymentMethods");
        setPaymentMethods(allMethods);
    };

    const getCustomerName = (customerId?: string) => {
        if (!customerId) return "عميل نقدي";
        const customer = customers.find((c) => c.id === customerId);
        return customer?.name || "غير محدد";
    };

    const getPaymentMethodName = (methodId: string): string => {
        const method = paymentMethods.find((m) => m.id === methodId);
        return method?.name || methodId;
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString("ar-EG", {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    };

    // Filter invoices
    const filteredInvoices = useMemo(() => {
        return invoices.filter((invoice) => {
            // Search filter - بحث برقم الفاتورة أو اسم العميل أو اسم المنتج
            const searchLower = searchQuery.toLowerCase();
            const matchesSearch =
                searchQuery === "" ||
                invoice.id.toLowerCase().includes(searchLower) ||
                getCustomerName(invoice.customerId)
                    .toLowerCase()
                    .includes(searchLower) ||
                // البحث في المنتجات داخل الفاتورة
                invoice.items?.some((item) =>
                    item.productName?.toLowerCase().includes(searchLower)
                );

            // Date filters
            const invoiceDate = new Date(invoice.createdAt);
            const matchesDateFrom = dateFrom === "" || invoiceDate >= new Date(dateFrom);
            const matchesDateTo =
                dateTo === "" || invoiceDate <= new Date(dateTo + "T23:59:59");

            // Payment type filter
            const matchesPaymentType =
                paymentTypeFilter === "all" || invoice.paymentType === paymentTypeFilter;

            // Payment status filter - مع معالجة الداتا القديمة
            let actualStatus = invoice.paymentStatus;
            // الفاتورة النقدية الي ليها طريقة دفع بس paidAmount = 0 تعتبر مدفوعة
            const hasPaymentMethod = invoice.paymentMethodIds && invoice.paymentMethodIds.length > 0;
            const isCashInvoice = invoice.paymentType === "cash";
            if (isCashInvoice && hasPaymentMethod && Number(invoice.paidAmount || 0) === 0) {
                actualStatus = "paid";
            }
            const matchesPaymentStatus =
                paymentStatusFilter === "all" ||
                actualStatus === paymentStatusFilter;

            // Delivery status filter
            const matchesDeliveryStatus =
                deliveryStatusFilter === "all" || invoice.deliveryStatus === deliveryStatusFilter ||
                (deliveryStatusFilter === "not_delivered" && !invoice.deliveryStatus);

            return (
                matchesSearch &&
                matchesDateFrom &&
                matchesDateTo &&
                matchesPaymentType &&
                matchesPaymentStatus &&
                matchesDeliveryStatus
            );

        }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [
        invoices,
        searchQuery,
        dateFrom,
        dateTo,
        paymentTypeFilter,
        paymentStatusFilter,
        deliveryStatusFilter,
    ]);

    // Reset page when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, dateFrom, dateTo, paymentTypeFilter, paymentStatusFilter, deliveryStatusFilter]);

    // Pagination calculations
    const totalPages = Math.ceil(filteredInvoices.length / pageSize);
    const paginatedInvoices = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredInvoices.slice(start, start + pageSize);
    }, [filteredInvoices, currentPage, pageSize]);

    // Generate visible page numbers
    const getVisiblePages = useCallback(() => {
        const maxVisible = TABLE_SETTINGS.MAX_VISIBLE_PAGES;
        const pages: number[] = [];
        let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
        let end = Math.min(totalPages, start + maxVisible - 1);
        if (end - start + 1 < maxVisible) {
            start = Math.max(1, end - maxVisible + 1);
        }
        for (let i = start; i <= end; i++) {
            pages.push(i);
        }
        return pages;
    }, [currentPage, totalPages]);

    const openInvoiceDetails = (invoice: Invoice) => {
        setSelectedInvoice(invoice);
        setIsDetailsOpen(true);
    };

    const getStatusBadge = (invoice: Invoice) => {
        // معالجة الداتا القديمة: الفواتير النقدية الي ليها طريقة دفع بس paidAmount = 0
        // تعتبر مدفوعة بالكامل
        const hasPaymentMethod = invoice.paymentMethodIds && invoice.paymentMethodIds.length > 0;
        const isCashInvoice = invoice.paymentType === "cash";
        const isLegacyPaidCash = isCashInvoice && hasPaymentMethod && Number(invoice.paidAmount || 0) === 0;

        const actualStatus = isLegacyPaidCash ? "paid" : invoice.paymentStatus;

        if (actualStatus === "paid") {
            return <Badge className="bg-green-500">مدفوعة</Badge>;
        } else if (actualStatus === "partial") {
            return <Badge className="bg-yellow-500">دفع جزئي</Badge>;
        } else {
            return <Badge className="bg-red-500">غير مدفوعة</Badge>;
        }
    };

    const getPaymentTypeBadge = (invoice: Invoice) => {
        if (invoice.paymentType === "cash") {
            return <Badge variant="outline">نقدي</Badge>;
        } else if (invoice.paymentType === "credit") {
            return (
                <Badge variant="outline" className="border-orange-500 text-orange-600">
                    آجل
                </Badge>
            );
        } else if (invoice.paymentType === "installment") {
            return (
                <Badge variant="outline" className="border-purple-500 text-purple-600">
                    تقسيط
                </Badge>
            );
        }
        return null;
    };

    // Delivery status badge
    const getDeliveryStatusBadge = (invoice: Invoice) => {
        const status = invoice.deliveryStatus || "not_delivered";
        switch (status) {
            case "delivered":
                return (
                    <Badge className="bg-green-500 gap-1">
                        <PackageCheck className="h-3 w-3" />
                        تم التسليم
                    </Badge>
                );
            case "shipped":
                return (
                    <Badge className="bg-blue-500 gap-1">
                        <Truck className="h-3 w-3" />
                        تم الشحن
                    </Badge>
                );
            default:
                return (
                    <Badge variant="outline" className="border-orange-500 text-orange-600 gap-1">
                        <Package className="h-3 w-3" />
                        لم يتم التسليم
                    </Badge>
                );
        }
    };

    // تغيير حالة التسليم
    const handleUpdateDeliveryStatus = async (invoice: Invoice, newStatus: "not_delivered" | "shipped" | "delivered") => {
        try {
            const updatedInvoice = { ...invoice, deliveryStatus: newStatus };
            await db.update("invoices", updatedInvoice);
            loadData();
            toast.success("تم تحديث حالة التسليم");
        } catch (error) {
            toast.error("فشل في تحديث حالة التسليم");
        }
    };

    // تغيير تاريخ الفاتورة (للأدمن فقط)
    const handleUpdateInvoiceDate = async () => {
        if (!selectedInvoice || !editInvoiceDate) return;
        try {
            const newDate = new Date(editInvoiceDate + 'T' + new Date(selectedInvoice.createdAt).toTimeString().split(' ')[0]).toISOString();
            const updatedInvoice = {
                ...selectedInvoice,
                createdAt: newDate,
                dueDate: new Date(new Date(editInvoiceDate).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
            };
            await db.update("invoices", updatedInvoice);
            setSelectedInvoice(updatedInvoice);
            setIsEditingDate(false);
            loadData();
            toast.success("تم تحديث تاريخ الفاتورة");
        } catch (error) {
            toast.error("فشل في تحديث تاريخ الفاتورة");
        }
    };

    // حذف الفاتورة مع استرجاع المخزون
    const handleDeleteInvoice = async (invoice: Invoice) => {
        if (!confirm(`هل أنت متأكد من حذف الفاتورة رقم ${invoice.invoiceNumber || invoice.id}؟ سيتم استرجاع الكميات للمخزون.`)) return;

        try {
            // 1. استرجاع المخزون
            if (invoice.items && invoice.items.length > 0) {
                const products = await db.getAll<Product>("products");

                for (const item of invoice.items) {
                    const product = products.find(p => p.id === item.productId || p.id === item.id); // try both IDs
                    if (product) {
                        // Calculate quantity to restore (checking for units/packaging)
                        // If complex units, logic might be needed. Assuming standard quantity here.
                        // Ideally we should use the same logic as Sales to deduct, but reversed.
                        // Simple restoration:
                        const qtyToRestore = item.quantity * (item.conversionFactor || 1);

                        await db.update("products", {
                            ...product,
                            stock: (product.stock || 0) + qtyToRestore
                        });
                    }
                }
            }

            // 2. حذف الفاتورة
            await db.delete("invoices", invoice.id);

            // 3. حذف عناصر الفاتورة المرتبطة (إن وجدت في جدول منفصل)
            // Note: invoiceItems table might need cleanup if used elsewhere, but mainly invoices table holds the data structure here.

            toast.success("تم حذف الفاتورة واسترجاع المخزون بنجاح");
            setIsDetailsOpen(false);
            setSelectedInvoice(null);
            loadData();
        } catch (error) {
            console.error("Delete error:", error);
            toast.error("فشل في حذف الفاتورة");
        }
    };

    // دالة مساعدة لحساب المبلغ المدفوع الفعلي (للداتا القديمة)
    const getActualPaidAmount = (invoice: Invoice): number => {
        const hasPaymentMethod = invoice.paymentMethodIds && invoice.paymentMethodIds.length > 0;
        const isCashInvoice = invoice.paymentType === "cash";
        // لو فاتورة نقدية وليها طريقة دفع بس paidAmount = 0، يبقى مدفوعة بالكامل
        if (isCashInvoice && hasPaymentMethod && Number(invoice.paidAmount || 0) === 0) {
            return Number(invoice.total) || 0;
        }
        return Number(invoice.paidAmount) || 0;
    };

    // حساب المتبقي الفعلي
    const getActualRemainingAmount = (invoice: Invoice): number => {
        const actualPaid = getActualPaidAmount(invoice);
        return Math.max(0, Number(invoice.total || 0) - actualPaid);
    };

    // تنسيق العملة - بدون كسور عشرية
    const formatCurrency = (amount: number) => `${Math.round(amount)} ${currency}`;

    // إرسال الفاتورة عبر واتساب مع PDF
    const handleSendInvoiceWhatsApp = async (invoice: Invoice) => {
        const customer = customers.find(c => c.id === invoice.customerId);
        if (!customer?.phone) {
            toast.error("العميل ليس لديه رقم هاتف");
            return;
        }

        try {
            toast.info("📄 جاري تجهيز الفاتورة...");

            const { generateInvoicePDF, convertToPDFData } = await import("@/services/invoicePdfService");
            const allProducts = await db.getAll("products");
            const allReps = await db.getAll<SalesRep>("salesReps");

            const items = (invoice.items || []).map((item: any) => {
                const product = allProducts.find((p: any) => p.id === item.productId || p.name === item.productName || p.name === item.name);
                return {
                    ...item,
                    unitsPerCarton: (product as any)?.unitsPerCarton || (product as any)?.cartonCount,
                    productCode: item.productCode || (product as any)?.code || (product as any)?.sku || "-"
                };
            });

            const rep = customer.salesRepId ? allReps.find(r => r.id === customer.salesRepId) : null;
            const pdfData = await convertToPDFData(invoice, customer, items, rep || undefined);

            toast.info("🖨️ جاري توليد PDF...");
            const pdfBlob = await generateInvoicePDF(pdfData);

            toast.info("📤 جاري الإرسال عبر واتساب...");

            const base64data = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(pdfBlob);
            });

            const message = `🧾 *فاتورة رقم ${invoice.invoiceNumber || invoice.id}*\n` +
                `*العميل:* ${invoice.customerName}\n` +
                `*الإجمالي:* ${formatCurrency(invoice.total)}\n\n` +
                `شركة لونج تايم للصناعات الكهربائية`;

            const phone = customer.phone.replace(/[^0-9]/g, "");

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
                        filename: `فاتورة-${invoice.invoiceNumber || invoice.id}.pdf`
                    },
                    {
                        invoiceId: invoice.id,
                        customerId: customer.id,
                        type: "invoice",
                    }
                );

                try {
                    const delivered = await (whatsappService as any).waitForMessage(msgId, 60000);
                    if (delivered) {
                        toast.success("✅ تم إرسال الفاتورة بنجاح!");
                    } else {
                        toast.error("❌ فشل إرسال الفاتورة");
                    }
                } catch {
                    toast.success("✅ تم إرسال الفاتورة!");
                }
            } else {
                // Fallback to wa.me
                const encodedMessage = encodeURIComponent(message);
                window.open(`https://wa.me/${phone}?text=${encodedMessage}`, "_blank");
                toast.info("لا يوجد حساب واتساب متصل، تم فتح واتساب ويب");
            }
        } catch (error) {
            console.error("WhatsApp send error:", error);
            toast.error("حدث خطأ أثناء إرسال الفاتورة");
        }
    };

    // طباعة الفاتورة
    const handlePrintInvoice = async (invoice: Invoice) => {
        try {
            toast.info("جاري تجهيز الطباعة...");
            const { printInvoice, convertToPDFData } = await import("@/services/invoicePdfService");

            // تحضير بيانات العميل
            const customer = customers.find(c => c.id === invoice.customerId) || { name: invoice.customerName || "عميل" };

            // تحويل البيانات للتنسيق الجديد
            const pdfData = await convertToPDFData(
                invoice,
                customer,
                invoice.items || [],
                { name: user?.name } // المندوب/المستخدم الحالي
            );

            // طباعة
            await printInvoice(pdfData);
        } catch (error) {
            console.error("Print error:", error);
            toast.error("حدث خطأ أثناء الطباعة");
        }
    };

    // ===== Return Functions =====


    // فتح dialog الإرجاع
    const handleOpenReturnDialog = (invoice: Invoice) => {
        setReturnInvoice(invoice);
        // تحويل عناصر الفاتورة لعناصر مرتجع
        const items: SalesReturnItem[] = invoice.items.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            quantity: 0, // سيحدد المستخدم الكمية
            maxQuantity: item.quantity - (item.returnedQuantity || 0), // الكمية القابلة للإرجاع
            price: item.price,
            total: 0,
            reason: "",
        }));
        setReturnItems(items);
        setReturnReason("");
        setRefundMethod("cash");
        setIsReturnDialogOpen(true);
        setIsDetailsOpen(false);
    };

    // تحديث كمية الإرجاع
    const updateReturnQuantity = (index: number, quantity: number) => {
        const updatedItems = [...returnItems];
        const maxQty = updatedItems[index].maxQuantity ?? 0;

        // التحقق من عدم تجاوز الكمية المتاحة
        if (quantity > maxQty) {
            toast.error(`الحد الأقصى للكمية المرتجعة: ${maxQty}`);
            quantity = maxQty;
        }

        const validQty = Math.min(Math.max(0, quantity), maxQty);
        updatedItems[index].quantity = validQty;
        updatedItems[index].total = validQty * updatedItems[index].price;
        setReturnItems(updatedItems);
    };

    // إنشاء المرتجع
    const handleCreateReturn = async () => {
        if (!returnInvoice || !returnReason) {
            toast.error("يرجى إدخال سبب الإرجاع");
            return;
        }

        // التحقق من أن طريقة الاسترجاع مناسبة للعميل
        if (!returnInvoice.customerId && (refundMethod === "credit" || refundMethod === "balance")) {
            toast.error("لا يمكن استخدام طرق الرصيد مع فاتورة نقدية. يرجى اختيار 'نقداً'");
            return;
        }

        // تصفية العناصر التي تم إرجاعها فقط
        const itemsToReturn = returnItems.filter((item) => item.quantity > 0);

        if (itemsToReturn.length === 0) {
            toast.error("يرجى اختيار المنتجات المراد إرجاعها");
            return;
        }

        // التحقق من أن لا تتجاوز أي كمية الحد المتاح
        const invalidItem = itemsToReturn.find((item) => item.quantity > (item.maxQuantity ?? 0));
        if (invalidItem) {
            toast.error(`الكمية المطلوبة للمنتج "${invalidItem.productName}" تتجاوز الكمية المتاحة (${invalidItem.maxQuantity})`);
            return;
        }

        const subtotal = itemsToReturn.reduce((sum, item) => sum + item.total, 0);
        const taxRate = parseFloat(getSetting("taxRate") || "0") / 100;
        const tax = subtotal * taxRate;
        const total = subtotal + tax;

        // التحقق من رصيد العميل إذا كانت الطريقة "خصم من رصيد العميل"
        if (refundMethod === "balance" && returnInvoice.customerId) {
            const customer = await db.get<Customer>("customers", returnInvoice.customerId);
            if (customer && customer.currentBalance < total) {
                toast.error(`رصيد العميل (${formatCurrency(customer.currentBalance)}) غير كافٍ. المبلغ المطلوب: ${formatCurrency(total)}`);
                return;
            }
        }

        // الحصول على الوردية الحالية
        const allShifts = await db.getAll<Shift>("shifts");
        const currentShift = allShifts.find((s) => s.status === "active");

        if (!currentShift) {
            toast.error("يجب فتح وردية أولاً لعمل مرتجع مبيعات");
            return;
        }

        const newReturn: SalesReturn = {
            id: `return_${Date.now()}`,
            originalInvoiceId: returnInvoice.id,
            customerId: returnInvoice.customerId,
            customerName: returnInvoice.customerName,
            items: itemsToReturn,
            subtotal,
            tax,
            total,
            reason: returnReason,
            userId: user?.id || "",
            userName: user?.username || user?.name || "",
            createdAt: new Date().toISOString(),
            refundMethod,
            refundStatus: "pending",
            shiftId: currentShift.id,
        };

        try {
            await db.add("salesReturns", newReturn);

            // تحديث الفاتورة الأصلية - إضافة الكمية المرتجعة
            const updatedInvoice = { ...returnInvoice };
            updatedInvoice.items = updatedInvoice.items.map((item) => {
                const returnedItem = itemsToReturn.find((r) => r.productId === item.productId);
                if (returnedItem) {
                    return {
                        ...item,
                        returnedQuantity: (item.returnedQuantity || 0) + returnedItem.quantity,
                    };
                }
                return item;
            });
            await db.update("invoices", updatedInvoice);

            // إرجاع المنتجات للمخزون
            for (const item of itemsToReturn) {
                const product = await db.get<Product>("products", item.productId);
                if (product) {
                    product.stock += item.quantity;
                    await db.update("products", product);
                }
            }

            // تحديث الوردية - خصم قيمة المرتجع
            const updatedShift: Shift = {
                ...currentShift,
                sales: {
                    ...currentShift.sales,
                    returns: currentShift.sales.returns + total,
                    totalAmount: currentShift.sales.totalAmount - total,
                },
            };
            await db.update("shifts", updatedShift);

            // معالجة طريقة الاسترجاع
            if (returnInvoice.customerId) {
                const customer = await db.get<Customer>("customers", returnInvoice.customerId);
                if (customer) {
                    if (refundMethod === "credit") {
                        customer.currentBalance += total;
                        await db.update("customers", customer);
                        toast.success(`تم إضافة ${formatCurrency(total)} إلى رصيد العميل`);
                    } else if (refundMethod === "balance") {
                        customer.currentBalance -= total;
                        await db.update("customers", customer);
                        toast.success(`تم خصم ${formatCurrency(total)} من رصيد العميل`);
                    }
                }
            }

            // تحديث حالة المرجع إلى مكتمل
            newReturn.refundStatus = "completed";
            await db.update("salesReturns", newReturn);

            toast.success("تم إنشاء فاتورة المرتجع بنجاح");
            setIsReturnDialogOpen(false);
            setReturnInvoice(null);
            loadData();
        } catch (error) {
            toast.error("حدث خطأ أثناء إنشاء المرتجع");
            console.error(error);
        }
    };

    // Calculate totals
    const totalInvoices = filteredInvoices.length;
    const totalAmount = filteredInvoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0);
    const totalPaid = filteredInvoices.reduce((sum, inv) => sum + getActualPaidAmount(inv), 0);

    return (
        <div className="min-h-screen bg-background" dir="rtl">
            <POSHeader />

            <div className="container mx-auto p-6">
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-3xl font-bold flex items-center gap-2">
                        <FileText className="h-8 w-8 text-primary" />
                        سجل الفواتير
                    </h1>
                    <ExcelExportButton
                        data={filteredInvoices}
                        columns={[
                            { header: "رقم الفاتورة", key: "invoiceNumber", width: 15, formatter: (val, row) => val || row.id },
                            { header: "العميل", key: "customerName", width: 20, formatter: (val, row) => val || getCustomerName(row.customerId) },
                            { header: "التاريخ", key: "createdAt", width: 18, formatter: (val) => formatDate(val) },
                            { header: "الإجمالي", key: "total", width: 12 },
                            { header: "المدفوع", key: "paidAmount", width: 12, formatter: (_, row) => getActualPaidAmount(row) },
                            { header: "المتبقي", key: "remainingAmount", width: 12, formatter: (_, row) => getActualRemainingAmount(row) },
                            { header: "نوع الدفع", key: "paymentType", width: 10, formatter: (val) => val === "cash" ? "نقدي" : val === "credit" ? "آجل" : "تقسيط" },
                            { header: "الحالة", key: "paymentStatus", width: 10, formatter: (val) => val === "paid" ? "مدفوعة" : val === "partial" ? "جزئي" : "غير مدفوعة" },
                        ]}
                        filename={`الفواتير_${new Date().toLocaleDateString("ar-EG")}`}
                        sheetName="الفواتير"
                    />
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <Card className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">عدد الفواتير</p>
                                <p className="text-2xl font-bold text-primary">{totalInvoices}</p>
                            </div>
                            <FileText className="h-8 w-8 text-primary" />
                        </div>
                    </Card>
                    <Card className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">إجمالي المبيعات</p>
                                <p className="text-2xl font-bold text-blue-600">
                                    {Math.round(totalAmount)} {currency}
                                </p>
                            </div>
                            <DollarSign className="h-8 w-8 text-blue-600" />
                        </div>
                    </Card>
                    <Card className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-muted-foreground">إجمالي المحصل</p>
                                <p className="text-2xl font-bold text-green-600">
                                    {Math.round(totalPaid)} {currency}
                                </p>
                            </div>
                            <CreditCard className="h-8 w-8 text-green-600" />
                        </div>
                    </Card>
                </div>

                {/* Filters */}
                <Card className="mb-6 p-4">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                        {/* Search */}
                        <div className="space-y-1">
                            <Label className="text-xs">بحث</Label>
                            <div className="relative">
                                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="فاتورة أو عميل أو منتج..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pr-10"
                                />
                            </div>
                        </div>

                        {/* Date From */}
                        <div className="space-y-1">
                            <Label className="text-xs">من تاريخ</Label>
                            <Input
                                type="date"
                                value={dateFrom}
                                onChange={(e) => setDateFrom(e.target.value)}
                            />
                        </div>

                        {/* Date To */}
                        <div className="space-y-1">
                            <Label className="text-xs">إلى تاريخ</Label>
                            <Input
                                type="date"
                                value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)}
                            />
                        </div>

                        {/* Payment Type Filter */}
                        <div className="space-y-1">
                            <Label className="text-xs">نوع الدفع</Label>
                            <Select value={paymentTypeFilter} onValueChange={setPaymentTypeFilter}>
                                <SelectTrigger>
                                    <SelectValue placeholder="نوع الدفع" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">جميع الأنواع</SelectItem>
                                    <SelectItem value="cash">نقدي</SelectItem>
                                    <SelectItem value="credit">آجل</SelectItem>
                                    <SelectItem value="installment">تقسيط</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Payment Status Filter */}
                        <div className="space-y-1">
                            <Label className="text-xs">حالة الدفع</Label>
                            <Select
                                value={paymentStatusFilter}
                                onValueChange={setPaymentStatusFilter}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="حالة الدفع" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">جميع الحالات</SelectItem>
                                    <SelectItem value="paid">مدفوعة</SelectItem>
                                    <SelectItem value="partial">دفع جزئي</SelectItem>
                                    <SelectItem value="unpaid">غير مدفوعة</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Delivery Status Filter */}
                        <div className="space-y-1">
                            <Label className="text-xs">حالة التسليم</Label>
                            <Select
                                value={deliveryStatusFilter}
                                onValueChange={setDeliveryStatusFilter}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="حالة التسليم" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">جميع الحالات</SelectItem>
                                    <SelectItem value="not_delivered">لم يتم التسليم</SelectItem>
                                    <SelectItem value="shipped">تم الشحن</SelectItem>
                                    <SelectItem value="delivered">تم التسليم</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Clear filters button */}
                    {(searchQuery || dateFrom || dateTo || paymentTypeFilter !== "all" || paymentStatusFilter !== "all" || deliveryStatusFilter !== "all") && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="mt-2"
                            onClick={() => {
                                setSearchQuery("");
                                setDateFrom("");
                                setDateTo("");
                                setPaymentTypeFilter("all");
                                setPaymentStatusFilter("all");
                                setDeliveryStatusFilter("all");
                            }}
                        >
                            إزالة الفلاتر
                        </Button>
                    )}
                </Card>

                {/* Invoices Table */}
                <Card>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>رقم الفاتورة</TableHead>
                                <TableHead>العميل</TableHead>
                                <TableHead>التاريخ</TableHead>
                                <TableHead>الإجمالي</TableHead>
                                <TableHead>المدفوع</TableHead>
                                <TableHead>المتبقي</TableHead>
                                <TableHead>نوع الدفع</TableHead>
                                <TableHead>الحالة</TableHead>
                                <TableHead>التسليم</TableHead>
                                <TableHead>إجراءات</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paginatedInvoices.map((invoice) => (
                                <TableRow
                                    key={invoice.id}
                                    className="hover:bg-muted/50"
                                >
                                    <TableCell
                                        className="font-medium cursor-pointer"
                                        onClick={() => openInvoiceDetails(invoice)}
                                    >
                                        {invoice.invoiceNumber || invoice.id}
                                    </TableCell>
                                    <TableCell
                                        className="cursor-pointer"
                                        onClick={() => openInvoiceDetails(invoice)}
                                    >
                                        {getCustomerName(invoice.customerId)}
                                    </TableCell>
                                    <TableCell
                                        className="cursor-pointer"
                                        onClick={() => openInvoiceDetails(invoice)}
                                    >
                                        {formatDate(invoice.createdAt)}
                                    </TableCell>
                                    <TableCell
                                        className="cursor-pointer"
                                        onClick={() => openInvoiceDetails(invoice)}
                                    >
                                        {Math.round(invoice.total || 0)} {currency}
                                    </TableCell>
                                    <TableCell
                                        className="text-green-600 cursor-pointer"
                                        onClick={() => openInvoiceDetails(invoice)}
                                    >
                                        {Math.round(getActualPaidAmount(invoice))} {currency}
                                    </TableCell>
                                    <TableCell
                                        className={`cursor-pointer ${getActualRemainingAmount(invoice) > 0 ? "text-red-600 font-semibold" : ""}`}
                                        onClick={() => openInvoiceDetails(invoice)}
                                    >
                                        {Math.round(getActualRemainingAmount(invoice))} {currency}
                                    </TableCell>
                                    <TableCell
                                        className="cursor-pointer"
                                        onClick={() => openInvoiceDetails(invoice)}
                                    >
                                        {getPaymentTypeBadge(invoice)}
                                    </TableCell>
                                    <TableCell
                                        className="cursor-pointer"
                                        onClick={() => openInvoiceDetails(invoice)}
                                    >
                                        {getStatusBadge(invoice)}
                                    </TableCell>
                                    <TableCell>
                                        <Select
                                            value={invoice.deliveryStatus || "not_delivered"}
                                            onValueChange={(v) => handleUpdateDeliveryStatus(invoice, v as "not_delivered" | "shipped" | "delivered")}
                                        >
                                            <SelectTrigger className="h-8 w-[140px]">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="not_delivered">
                                                    <div className="flex items-center gap-1">
                                                        <Package className="h-3 w-3 text-orange-500" />
                                                        لم يتم التسليم
                                                    </div>
                                                </SelectItem>
                                                <SelectItem value="shipped">
                                                    <div className="flex items-center gap-1">
                                                        <Truck className="h-3 w-3 text-blue-500" />
                                                        تم الشحن
                                                    </div>
                                                </SelectItem>
                                                <SelectItem value="delivered">
                                                    <div className="flex items-center gap-1">
                                                        <PackageCheck className="h-3 w-3 text-green-500" />
                                                        تم التسليم
                                                    </div>
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell>
                                        {can("returns", "create") && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleOpenReturnDialog(invoice);
                                            }}
                                        >
                                            <RotateCcw className="h-4 w-4 ml-1" />
                                            مرتجع
                                        </Button>
                                        )}

                                        <Button
                                            size="sm"
                                            className="mr-2"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handlePrintInvoice(invoice);
                                            }}
                                        >
                                            <Printer className="h-4 w-4 ml-1" />
                                            طباعة
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {filteredInvoices.length === 0 && (
                                <TableRow>
                                    <TableCell
                                        colSpan={10}
                                        className="text-center text-muted-foreground py-8"
                                    >
                                        لا توجد فواتير مطابقة للبحث
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </Card>

                {/* Pagination Controls */}
                {filteredInvoices.length > 0 && (
                    <div className="flex items-center justify-between mt-4 flex-wrap gap-3">
                        {/* Page size selector */}
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">عرض</span>
                            <Select
                                value={pageSize.toString()}
                                onValueChange={(v) => {
                                    setPageSize(Number(v));
                                    setCurrentPage(1);
                                }}
                            >
                                <SelectTrigger className="w-[80px] h-8">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {TABLE_SETTINGS.PAGE_SIZE_OPTIONS.map((size) => (
                                        <SelectItem key={size} value={size.toString()}>
                                            {size}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <span className="text-sm text-muted-foreground">
                                من أصل {filteredInvoices.length} فاتورة
                            </span>
                        </div>

                        {/* Page navigation */}
                        {totalPages > 1 && (
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                >
                                    <ChevronRight className="h-4 w-4" />
                                    السابق
                                </Button>

                                {getVisiblePages()[0] > 1 && (
                                    <>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setCurrentPage(1)}
                                            className="w-8 h-8 p-0"
                                        >
                                            1
                                        </Button>
                                        {getVisiblePages()[0] > 2 && (
                                            <span className="px-1 text-muted-foreground">...</span>
                                        )}
                                    </>
                                )}

                                {getVisiblePages().map((page) => (
                                    <Button
                                        key={page}
                                        variant={page === currentPage ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => setCurrentPage(page)}
                                        className="w-8 h-8 p-0"
                                    >
                                        {page}
                                    </Button>
                                ))}

                                {getVisiblePages()[getVisiblePages().length - 1] < totalPages && (
                                    <>
                                        {getVisiblePages()[getVisiblePages().length - 1] < totalPages - 1 && (
                                            <span className="px-1 text-muted-foreground">...</span>
                                        )}
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setCurrentPage(totalPages)}
                                            className="w-8 h-8 p-0"
                                        >
                                            {totalPages}
                                        </Button>
                                    </>
                                )}

                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                >
                                    التالي
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                            </div>
                        )}

                        {/* Current page info */}
                        <div className="text-sm text-muted-foreground">
                            صفحة {currentPage} من {totalPages}
                        </div>
                    </div>
                )}
            </div>

            {/* Invoice Details Dialog */}
            <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-2xl">
                            <FileText className="h-6 w-6 text-primary" />
                            تفاصيل الفاتورة #{selectedInvoice?.invoiceNumber || selectedInvoice?.id}
                        </DialogTitle>
                    </DialogHeader>

                    {selectedInvoice && (
                        <div className="space-y-6">
                            {/* Invoice Info */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg">
                                <div>
                                    <p className="text-sm text-muted-foreground">التاريخ</p>
                                    {canEditInvoice && isEditingDate ? (
                                        <div className="flex items-center gap-2">
                                            <Input
                                                type="date"
                                                value={editInvoiceDate}
                                                onChange={(e) => setEditInvoiceDate(e.target.value)}
                                                className="h-8 w-36"
                                            />
                                            <Button size="sm" variant="ghost" onClick={handleUpdateInvoiceDate}>
                                                <Check className="h-4 w-4 text-green-600" />
                                            </Button>
                                            <Button size="sm" variant="ghost" onClick={() => setIsEditingDate(false)}>
                                                <X className="h-4 w-4 text-red-600" />
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium">{formatDate(selectedInvoice.createdAt)}</span>
                                            {canEditInvoice && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6"
                                                    onClick={() => {
                                                        setEditInvoiceDate(new Date(selectedInvoice.createdAt).toISOString().split('T')[0]);
                                                        setIsEditingDate(true);
                                                    }}
                                                >
                                                    <Calendar className="h-3 w-3" />
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">العميل</p>
                                    <p className="font-semibold flex items-center gap-1">
                                        <User className="h-4 w-4" />
                                        {getCustomerName(selectedInvoice.customerId)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">نوع الدفع</p>
                                    <div className="mt-1">{getPaymentTypeBadge(selectedInvoice)}</div>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">الحالة</p>
                                    <div className="mt-1">{getStatusBadge(selectedInvoice)}</div>
                                </div>
                            </div>

                            {/* Products */}
                            <div>
                                <h3 className="font-semibold mb-3 flex items-center gap-2">
                                    <Package className="h-5 w-5" />
                                    المنتجات ({selectedInvoice.items?.length || 0})
                                </h3>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>المنتج</TableHead>
                                            <TableHead>الكمية</TableHead>
                                            <TableHead>المرتجع</TableHead>
                                            <TableHead>المتبقي</TableHead>
                                            <TableHead>السعر</TableHead>
                                            <TableHead>الإجمالي</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {selectedInvoice.items?.map((item, idx) => {
                                            const returnedQty = item.returnedQuantity || 0;
                                            const remainingQty = item.quantity - returnedQty;
                                            const isFullyReturned = remainingQty === 0;
                                            const isPartiallyReturned = returnedQty > 0 && remainingQty > 0;

                                            return (
                                                <TableRow
                                                    key={idx}
                                                    className={`${isFullyReturned
                                                        ? 'bg-red-50 dark:bg-red-950/30 line-through opacity-60'
                                                        : isPartiallyReturned
                                                            ? 'bg-yellow-50 dark:bg-yellow-950/30'
                                                            : ''
                                                        }`}
                                                >
                                                    <TableCell>
                                                        {item.productName}
                                                        {isFullyReturned && (
                                                            <span className="text-xs text-red-500 mr-2">(مرتجع بالكامل)</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>{item.quantity}</TableCell>
                                                    <TableCell>
                                                        {returnedQty > 0 ? (
                                                            <span className="text-red-600 font-medium">-{returnedQty}</span>
                                                        ) : (
                                                            <span className="text-muted-foreground">-</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <span className={remainingQty === 0 ? 'text-red-500' : 'text-green-600 font-medium'}>
                                                            {remainingQty}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell>
                                                        {Math.round(item.price || 0)} {currency}
                                                    </TableCell>
                                                    <TableCell className="font-semibold">
                                                        {Math.round(item.total || 0)} {currency}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>

                                {/* إجماليات المرتجعات */}
                                {selectedInvoice.items?.some(item => (item.returnedQuantity || 0) > 0) && (
                                    <div className="mt-4 p-3 bg-orange-50 dark:bg-orange-950/30 rounded-lg border border-orange-200 dark:border-orange-800">
                                        <div className="flex justify-between items-center">
                                            <span className="font-medium text-orange-700 dark:text-orange-300">إجمالي المرتجعات:</span>
                                            <span className="font-bold text-orange-700 dark:text-orange-300">
                                                {Math.round(selectedInvoice.items.reduce((sum, item) => {
                                                    const returnedQty = item.returnedQuantity || 0;
                                                    return sum + (returnedQty * item.price);
                                                }, 0))} {currency}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center mt-2 pt-2 border-t border-orange-200 dark:border-orange-800">
                                            <span className="font-semibold text-green-700 dark:text-green-300">الصافي بعد المرتجعات:</span>
                                            <span className="font-bold text-green-700 dark:text-green-300">
                                                {Math.round(Number(selectedInvoice.total || 0) - selectedInvoice.items.reduce((sum, item) => {
                                                    const returnedQty = Number(item.returnedQuantity || 0);
                                                    return sum + (returnedQty * Number(item.price || 0));
                                                }, 0))} {currency}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Payment Methods */}
                            {selectedInvoice.paymentMethodAmounts &&
                                Object.keys(selectedInvoice.paymentMethodAmounts).length > 0 && (
                                    <div>
                                        <h3 className="font-semibold mb-3 flex items-center gap-2">
                                            <CreditCard className="h-5 w-5" />
                                            طرق الدفع
                                        </h3>
                                        <div className="space-y-2">
                                            {Object.entries(selectedInvoice.paymentMethodAmounts).map(
                                                ([methodId, amount]: [string, any]) => {
                                                    // معالجة الداتا القديمة: لو الفاتورة نقدية والمبلغ = 0، نعرض الإجمالي
                                                    let displayAmount = parseFloat(amount) || 0;
                                                    if (displayAmount === 0 && selectedInvoice.paymentType === "cash") {
                                                        displayAmount = Number(selectedInvoice.total) || 0;
                                                    }

                                                    return displayAmount > 0 ? (
                                                        <div
                                                            key={methodId}
                                                            className="flex justify-between p-3 bg-green-50 rounded-lg"
                                                        >
                                                            <span className="font-medium">
                                                                {getPaymentMethodName(methodId)}
                                                            </span>
                                                            <span className="font-bold text-green-600">
                                                                {Math.round(displayAmount)} {currency}
                                                            </span>
                                                        </div>
                                                    ) : null;
                                                }
                                            )}
                                        </div>
                                    </div>
                                )}

                            {/* Totals */}
                            <div className="border-t pt-4 space-y-2">
                                <div className="flex justify-between text-lg">
                                    <span>المجموع الفرعي</span>
                                    <span>{Math.round(Number(selectedInvoice.subtotal) || 0)} {currency}</span>
                                </div>
                                {Number(selectedInvoice.discount) > 0 && (
                                    <div className="flex justify-between text-red-600">
                                        <span>الخصم</span>
                                        <span>-{Math.round(Number(selectedInvoice.discount) || 0)} {currency}</span>
                                    </div>
                                )}
                                {Number(selectedInvoice.tax) > 0 && (
                                    <div className="flex justify-between">
                                        <span>الضريبة</span>
                                        <span>{Math.round(Number(selectedInvoice.tax) || 0)} {currency}</span>
                                    </div>
                                )}
                                <div className="flex justify-between text-xl font-bold border-t pt-2">
                                    <span>الإجمالي</span>
                                    <span>{Math.round(Number(selectedInvoice.total) || 0)} {currency}</span>
                                </div>
                                <div className="flex justify-between text-green-600">
                                    <span>المدفوع</span>
                                    <span>{Math.round(getActualPaidAmount(selectedInvoice))} {currency}</span>
                                </div>
                                {getActualRemainingAmount(selectedInvoice) > 0 && (
                                    <div className="flex justify-between text-red-600 font-bold">
                                        <span>المتبقي</span>
                                        <span>{Math.round(getActualRemainingAmount(selectedInvoice))} {currency}</span>
                                    </div>
                                )}
                            </div>

                            {/* Notes */}
                            {selectedInvoice.notes && (
                                <div className="border-t pt-4">
                                    <h3 className="font-semibold mb-2 flex items-center gap-2">
                                        <FileText className="h-5 w-5" />
                                        ملاحظات
                                    </h3>
                                    <p className="text-sm bg-muted/30 p-3 rounded-lg">{selectedInvoice.notes}</p>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex gap-2 justify-end border-t pt-4 flex-wrap">
                                <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>
                                    إغلاق
                                </Button>
                                {selectedInvoice.customerId && (
                                    <Button
                                        variant="outline"
                                        className="bg-green-50 hover:bg-green-100 text-green-700 border-green-200"
                                        onClick={() => handleSendInvoiceWhatsApp(selectedInvoice)}
                                    >
                                        <MessageSquare className="h-4 w-4 ml-2" />
                                        واتساب
                                    </Button>
                                )}
                                <Button
                                    variant="outline"
                                    onClick={() => selectedInvoice && handlePrintInvoice(selectedInvoice)}
                                >
                                    <Printer className="h-4 w-4 ml-2" />
                                    طباعة
                                </Button>
                                {canEditInvoice && (
                                    <Button
                                        variant="default"
                                        className="bg-blue-600 hover:bg-blue-700 text-white"
                                        onClick={() => {
                                            if (selectedInvoice) {
                                                navigate(`/pos?invoiceId=${selectedInvoice.id}`);
                                            }
                                        }}
                                    >
                                        <Edit className="h-4 w-4 ml-2" />
                                        تعديل الفاتورة
                                    </Button>
                                )}
                                {canDeleteInvoice && (
                                    <Button
                                        variant="destructive"
                                        onClick={() => selectedInvoice && handleDeleteInvoice(selectedInvoice)}
                                    >
                                        <Trash2 className="h-4 w-4 ml-2" />
                                        حذف الفاتورة
                                    </Button>
                                )}
                                {can("returns", "create") && (
                                <Button
                                    variant="outline"
                                    onClick={() => selectedInvoice && handleOpenReturnDialog(selectedInvoice)}
                                >
                                    <RotateCcw className="h-4 w-4 ml-2" />
                                    مرتجع
                                </Button>
                                )}
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Return Dialog */}
            <Dialog open={isReturnDialogOpen} onOpenChange={setIsReturnDialogOpen}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-2xl">
                            <RotateCcw className="h-6 w-6 text-orange-500" />
                            إنشاء مرتجع للفاتورة #{returnInvoice?.id}
                        </DialogTitle>
                    </DialogHeader>

                    {returnInvoice && (
                        <div className="space-y-6">
                            {/* Invoice Info */}
                            <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                                <div>
                                    <span className="text-muted-foreground">العميل: </span>
                                    <span className="font-medium">{returnInvoice.customerName || "عميل نقدي"}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">إجمالي الفاتورة: </span>
                                    <span className="font-medium">{formatCurrency(returnInvoice.total)}</span>
                                </div>
                            </div>

                            {/* Products Table */}
                            <div>
                                <Label className="text-lg mb-2 block">اختر المنتجات للإرجاع</Label>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>المنتج</TableHead>
                                            <TableHead>السعر</TableHead>
                                            <TableHead>الكمية الأصلية</TableHead>
                                            <TableHead>المرتجع سابقاً</TableHead>
                                            <TableHead>كمية الإرجاع</TableHead>
                                            <TableHead>الإجمالي</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {returnItems.map((item, index) => (
                                            <TableRow key={index}>
                                                <TableCell>{item.productName}</TableCell>
                                                <TableCell>{formatCurrency(item.price)}</TableCell>
                                                <TableCell>
                                                    {returnInvoice.items[index]?.quantity || 0}
                                                </TableCell>
                                                <TableCell className="text-orange-600">
                                                    {returnInvoice.items[index]?.returnedQuantity || 0}
                                                </TableCell>
                                                <TableCell>
                                                    <Input
                                                        type="number"
                                                        min={0}
                                                        max={item.maxQuantity}
                                                        value={item.quantity}
                                                        onChange={(e) => updateReturnQuantity(index, parseInt(e.target.value) || 0)}
                                                        className="w-24"
                                                    />
                                                    <span className="text-xs text-muted-foreground mr-2">
                                                        (الحد الأقصى: {item.maxQuantity})
                                                    </span>
                                                </TableCell>
                                                <TableCell className="font-medium">
                                                    {formatCurrency(item.total)}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>

                            {/* Return Total */}
                            <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
                                <div className="flex justify-between text-lg font-bold">
                                    <span>إجمالي المرتجع</span>
                                    <span className="text-orange-600">
                                        {formatCurrency(returnItems.reduce((sum, item) => sum + item.total, 0))}
                                    </span>
                                </div>
                            </div>

                            {/* Reason */}
                            <div>
                                <Label>سبب الإرجاع *</Label>
                                <Textarea
                                    value={returnReason}
                                    onChange={(e) => setReturnReason(e.target.value)}
                                    placeholder="أدخل سبب إرجاع المنتجات..."
                                    className="mt-2"
                                />
                            </div>

                            {/* Refund Method */}
                            <div>
                                <Label>طريقة الاسترداد</Label>
                                <Select
                                    value={refundMethod}
                                    onValueChange={(value: "cash" | "credit" | "balance") => setRefundMethod(value)}
                                >
                                    <SelectTrigger className="mt-2">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="cash">💵 نقداً</SelectItem>
                                        {returnInvoice.customerId && (
                                            <>
                                                <SelectItem value="credit">
                                                    📈 رصيد للعميل - إضافة المبلغ إلى رصيد العميل
                                                </SelectItem>
                                                <SelectItem value="balance">
                                                    📉 خصم من رصيد العميل
                                                </SelectItem>
                                            </>
                                        )}
                                    </SelectContent>
                                </Select>
                                {refundMethod === "credit" && (
                                    <p className="text-sm text-green-600 mt-2">
                                        💡 سيتم إضافة المبلغ إلى رصيد العميل ليستخدمه في مشتريات مستقبلية
                                    </p>
                                )}
                                {refundMethod === "balance" && (
                                    <p className="text-sm text-orange-600 mt-2">
                                        ⚠️ سيتم خصم المبلغ من رصيد العميل الحالي
                                    </p>
                                )}
                            </div>

                            <DialogFooter className="gap-2">
                                <Button variant="outline" onClick={() => setIsReturnDialogOpen(false)}>
                                    إلغاء
                                </Button>
                                <Button
                                    onClick={handleCreateReturn}
                                    className="bg-orange-500 hover:bg-orange-600"
                                    disabled={returnItems.filter(i => i.quantity > 0).length === 0}
                                >
                                    <RotateCcw className="h-4 w-4 ml-2" />
                                    إنشاء المرتجع
                                </Button>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
