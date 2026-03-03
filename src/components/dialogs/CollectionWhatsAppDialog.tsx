import { useState, useMemo, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MessageCircle, Send, AlertCircle, Loader2, Wallet } from "lucide-react";
import { db, Customer } from "@/shared/lib/indexedDB";
import { useToast } from "@/hooks/use-toast";
import { useSettingsContext } from "@/contexts/SettingsContext";
import { whatsappService, WhatsAppAccount } from "@/services/whatsapp/whatsappService";
import { useCustomerBalances } from "@/hooks/useCustomerBalances";

interface SalesRep {
    id: string;
    name: string;
    phone: string;
    whatsappGroupId?: string;
}

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

interface CollectionWhatsAppDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const CollectionWhatsAppDialog = ({
    open,
    onOpenChange,
}: CollectionWhatsAppDialogProps) => {
    const { toast } = useToast();
    const { getSetting } = useSettingsContext();
    const currency = getSetting("currency") || "EGP";

    const [collections, setCollections] = useState<CollectionRecord[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [salesReps, setSalesReps] = useState<SalesRep[]>([]);
    const [activeAccount, setActiveAccount] = useState<WhatsAppAccount | null>(null);
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [sendProgress, setSendProgress] = useState({ sent: 0, total: 0 });

    // Options
    const [dateRange, setDateRange] = useState<"today" | "range">("today");
    const [fromDate, setFromDate] = useState(new Date().toISOString().split("T")[0]);
    const [toDate, setToDate] = useState(new Date().toISOString().split("T")[0]);
    const [recipient, setRecipient] = useState<"customer" | "salesRep" | "repGroup" | "both">("customer");

    const { getBalance } = useCustomerBalances([open]);

    // Load data when dialog opens
    useEffect(() => {
        if (open) {
            loadData();
        }
    }, [open]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [custs, reps, accounts] = await Promise.all([
                db.getAll<Customer>("customers"),
                db.getAll<SalesRep>("salesReps"),
                db.getAll<WhatsAppAccount>("whatsappAccounts"),
            ]);
            setCustomers(custs);
            setSalesReps(reps);

            // Find active & connected WhatsApp account
            const active = accounts.find(a => a.isActive && a.status === "connected");
            setActiveAccount(active || null);

            // Load collections from localStorage
            const saved = localStorage.getItem('pos-collections');
            const allCollections: CollectionRecord[] = saved ? JSON.parse(saved) : [];
            setCollections(allCollections);
        } catch (error) {
            console.error("Error loading data:", error);
        }
        setLoading(false);
    };

    // Filter collections based on criteria
    const filteredCollections = useMemo(() => {
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        return collections.filter((col) => {
            if (!col.createdAt) return false;

            const colDateObj = new Date(col.createdAt);
            const colDate = `${colDateObj.getFullYear()}-${String(colDateObj.getMonth() + 1).padStart(2, '0')}-${String(colDateObj.getDate()).padStart(2, '0')}`;

            if (dateRange === "today") {
                if (colDate !== today) return false;
            } else {
                if (colDate < fromDate || colDate > toDate) return false;
            }

            return true;
        });
    }, [collections, dateRange, fromDate, toDate]);

    // Build receipt HTML for a collection
    const buildReceiptHTML = async (record: CollectionRecord, previousBalance: number, newBalance: number) => {
        const receiptDate = new Date(record.createdAt).toLocaleDateString("ar-EG");
        const customer = customers.find(c => c.id === record.customerId);
        const customerCode = customer?.id?.slice(-8) || '';
        const receiptNumber = record.id.replace('collection_', '');

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

        return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
    <meta charset="UTF-8">
    <title>إيصال قبض - ${record.id}</title>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
    <style>
        @page { size: A5 landscape; margin: 10mm; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif;
            background: #fff;
            color: #333;
            direction: rtl;
            width: 750px;
            margin: 0 auto;
            padding: 15px;
        }
        .receipt-container {
            border: 2px solid #2b7cba;
            padding: 0;
            position: relative;
        }
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
        }
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
        .receipt-info {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            padding: 15px 25px;
            border-bottom: 2px solid #2b7cba;
            background: #f0f7ff;
        }
        .customer-info { text-align: right; }
        .customer-name {
            font-size: 22px;
            font-weight: bold;
            color: #333;
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
        .amounts-section { padding: 20px 25px; }
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
        .amount-label.red { background: #e53935; }
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
        .notes-section {
            padding: 0 25px 10px;
            font-size: 13px;
            color: #666;
        }
        .notes-section span {
            font-weight: bold;
            color: #333;
        }
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
        .qr-code { margin-top: 10px; }
        .qr-code img { width: 100px; height: 100px; }
        @media print { body { width: 100%; padding: 0; } }
    </style>
</head>
<body>
    <div class="receipt-container">
        <div class="receipt-header">
            <div class="company-name">لونج تايم</div>
            ${logoBase64 ? `<img src="${logoBase64}" class="logo-img" alt="Logo">` : ''}
        </div>
        <div class="receipt-title">
            <span class="receipt-title-box">إيصال استلام نقدية - تحويل بنكي</span>
            <span class="receipt-type">قبض</span>
        </div>
        <div class="receipt-info">
            <div class="customer-info">
                <div class="customer-name">${record.customerName}</div>
            </div>
            <div class="receipt-meta">
                <div><span class="label">رقم الايصال: </span>${receiptNumber}</div>
                <div><span class="label">التاريخ: </span>${receiptDate}</div>
                <div><span class="label">كود العميل: </span>${customerCode}</div>
            </div>
        </div>
        <div class="amounts-section">
            <div class="amount-row">
                <span class="amount-label">الرصيد السابق</span>
                <span class="amount-value">${Number(previousBalance) % 1 !== 0 ? Number(previousBalance).toFixed(2) : Number(previousBalance).toLocaleString()}</span>
            </div>
            <div class="amount-row">
                <span class="amount-label">المدفوع</span>
                <span class="amount-value paid">${Number(record.amount) % 1 !== 0 ? Number(record.amount).toFixed(2) : Number(record.amount).toLocaleString()}</span>
            </div>
            <div class="amount-row">
                <span class="amount-label red">الرصيد الحالي</span>
                <span class="amount-value current">${Number(newBalance) % 1 !== 0 ? Number(newBalance).toFixed(2) : Number(newBalance).toLocaleString()}</span>
            </div>
        </div>
        ${record.notes ? `<div class="notes-section"><span>ملاحظات: </span>${record.notes}</div>` : ''}
        <div class="receipt-footer">
            <div class="footer-text">للاطلاع على صور منتجاتنا يمكنك زيارة موقعنا</div>
            <div class="footer-link">longtimelt.com</div>
            ${qrBase64 ? `<div class="qr-code"><img src="${qrBase64}" alt="QR Code"></div>` : ''}
        </div>
    </div>
</body>
</html>`;
    };

    // Convert HTML to PDF blob using iframe + html2canvas
    const htmlToPdfBlob = async (html: string): Promise<Blob> => {
        return new Promise<Blob>((resolve, reject) => {
            const iframe = document.createElement("iframe");
            iframe.style.position = "fixed";
            iframe.style.right = "-9999px";
            iframe.style.top = "-9999px";
            iframe.style.width = "800px";
            iframe.style.height = "600px";
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

            setTimeout(async () => {
                try {
                    try {
                        await (iframeDoc as any).fonts?.ready;
                    } catch (_e) { /* ignore */ }

                    const html2canvas = (await import("html2canvas")).default;
                    const canvas = await html2canvas(iframeDoc.body, {
                        scale: 2,
                        useCORS: true,
                        allowTaint: true,
                        backgroundColor: "#ffffff",
                        width: 800,
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
            }, 1500);
        });
    };

    // Convert blob to base64
    const blobToBase64 = (blob: Blob): Promise<string> => {
        return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    };

    // Send collections via WhatsApp
    const handleSend = async () => {
        if (!activeAccount) {
            toast({
                title: "لا يوجد حساب واتساب متصل",
                description: "يرجى ربط حساب واتساب أولاً من صفحة إدارة الواتساب",
                variant: "destructive"
            });
            return;
        }

        if (filteredCollections.length === 0) {
            toast({ title: "لا توجد عمليات قبض للإرسال", variant: "destructive" });
            return;
        }

        setSending(true);

        // Group collections by customer
        const byCustomer = new Map<string, CollectionRecord[]>();
        for (const col of filteredCollections) {
            const list = byCustomer.get(col.customerId) || [];
            list.push(col);
            byCustomer.set(col.customerId, list);
        }

        const totalMessages = byCustomer.size * (recipient === "both" ? 2 : 1);
        setSendProgress({ sent: 0, total: totalMessages });

        let sentCount = 0;
        let failedCount = 0;
        const fmtAmt = (v: number) => v % 1 !== 0 ? v.toFixed(2) : v.toLocaleString();

        try {
            for (const [customerId, customerCollections] of byCustomer) {
                const customer = await db.get<Customer>("customers", customerId);
                if (!customer) {
                    failedCount++;
                    setSendProgress(prev => ({ ...prev, sent: prev.sent + 1 }));
                    continue;
                }

                const salesRep = salesReps.find((r) => r.id === customer?.salesRepId);

                toast({
                    title: `📄 جاري تجهيز إيصال قبض ${customer.name}...`,
                    description: `التقدم: ${sentCount + failedCount + 1}/${totalMessages}`
                });

                // حساب الأرصدة
                const currentBalance = getBalance(customer.id, Number(customer.currentBalance || 0));

                // Generate receipt PDFs for each collection
                const pdfBlobs: { blob: Blob; collection: CollectionRecord }[] = [];
                for (const col of customerCollections) {
                    const previousBalance = currentBalance + Number(col.amount);
                    const html = await buildReceiptHTML(col, previousBalance, currentBalance);
                    const pdfBlob = await htmlToPdfBlob(html);
                    pdfBlobs.push({ blob: pdfBlob, collection: col });
                }

                // Also generate account statement PDF
                let statementBlob: Blob | null = null;
                try {
                    const { generateStatementPDF } = await import("@/services/statementPdfService");
                    const now = new Date();
                    const yearStart = new Date(now.getFullYear(), 0, 1);
                    statementBlob = await generateStatementPDF(customer.id, yearStart, now);
                } catch (_e) { /* ignore */ }

                // Build summary message
                const totalCollected = customerCollections.reduce((s, c) => s + Number(c.amount), 0);
                const todayStr = new Date().toLocaleDateString("ar-EG");

                let message = `💰 *إيصال قبض*\n`;
                message += `📅 *التاريخ:* ${todayStr}\n`;
                message += `*العميل:* ${customer.name}\n\n`;

                if (customerCollections.length === 1) {
                    message += `*المبلغ:* ${fmtAmt(totalCollected)} ${currency}\n`;
                } else {
                    customerCollections.forEach((c, i) => {
                        message += `${i + 1}. ${fmtAmt(Number(c.amount))} ${currency}`;
                        if (c.notes) message += ` (${c.notes})`;
                        message += `\n`;
                    });
                    message += `\n*الإجمالي:* ${fmtAmt(totalCollected)} ${currency}\n`;
                }

                message += `*الرصيد الحالي:* ${fmtAmt(currentBalance)} ${currency}\n\n`;
                message += `شركة لونج تايم للصناعات الكهربائية`;

                const phone = (customer.phone || "").replace(/[^0-9]/g, "");

                // Helper to send to a target
                const sendToTarget = async (targetPhone: string, targetType: string) => {
                    try {
                        // Send each receipt PDF
                        for (const { blob, collection } of pdfBlobs) {
                            const base64data = await blobToBase64(blob);
                            const receiptNumber = collection.id.replace('collection_', '');

                            await whatsappService.sendMessage(
                                activeAccount.id,
                                targetPhone,
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
                        }

                        // Send account statement if available
                        if (statementBlob) {
                            const statementBase64 = await blobToBase64(statementBlob);
                            const statementCaption = `📊 *كشف حساب*\n` +
                                `*العميل:* ${customer.name}\n` +
                                `*الرصيد الحالي:* ${fmtAmt(currentBalance)} ${currency}\n` +
                                `يرجى مراجعة الملف المرفق.`;

                            await whatsappService.sendMessage(
                                activeAccount.id,
                                targetPhone,
                                statementCaption,
                                {
                                    type: "document",
                                    url: statementBase64,
                                    caption: statementCaption,
                                    filename: `كشف حساب ${customer.name}.pdf`
                                },
                                {
                                    customerId: customer.id,
                                    type: "statement",
                                }
                            );
                        }

                        sentCount++;
                        setSendProgress(prev => ({ ...prev, sent: prev.sent + 1 }));
                        console.log(`✅ Sent collection receipts to ${targetType} for ${customer.name}`);
                    } catch (error) {
                        console.error(`❌ Failed to send collection receipts to ${targetType} for ${customer.name}:`, error);
                        failedCount++;
                        setSendProgress(prev => ({ ...prev, sent: prev.sent + 1 }));
                    }
                };

                // Send to Customer (prefer collectionGroupId, fallback to whatsappGroupId, then phone)
                if ((recipient === "customer" || recipient === "both") && (customer?.collectionGroupId || customer?.whatsappGroupId || customer?.phone)) {
                    await sendToTarget(customer.collectionGroupId || customer.whatsappGroupId || phone, "Customer");
                }

                // Send to Sales Rep
                if ((recipient === "salesRep") && salesRep?.phone) {
                    await sendToTarget(salesRep.phone, "SalesRep");
                }

                // Send to Sales Rep Group
                if ((recipient === "repGroup" || recipient === "both") && salesRep?.whatsappGroupId) {
                    await sendToTarget(salesRep.whatsappGroupId, "SalesRepGroup");
                }

                // Small delay between customers
                await new Promise(r => setTimeout(r, 500));
            }

            if (sentCount > 0) {
                toast({
                    title: `✅ تم إرسال إيصالات القبض لـ ${sentCount} عميل`,
                    description: failedCount > 0 ? `فشل ${failedCount} عميل` : `تم الإرسال كمرفقات PDF`,
                });
            } else {
                toast({
                    title: "فشل إرسال إيصالات القبض",
                    variant: "destructive"
                });
            }
        } catch (error: any) {
            console.error("Critical error in sending loop:", error);
            toast({
                title: "خطأ غير متوقع",
                description: error.message || "حدث خطأ أثناء المعالجة",
                variant: "destructive"
            });
        } finally {
            setSending(false);
            onOpenChange(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent dir="rtl" className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Wallet className="h-5 w-5 text-green-600" />
                        إرسال إيصالات القبض عبر واتساب
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* WhatsApp Account Status */}
                    {!activeAccount ? (
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>
                                لا يوجد حساب واتساب متصل. يرجى ربط حساب من صفحة إدارة الواتساب أولاً.
                            </AlertDescription>
                        </Alert>
                    ) : (
                        <Alert className="bg-green-50 border-green-200">
                            <MessageCircle className="h-4 w-4 text-green-600" />
                            <AlertDescription className="text-green-800">
                                متصل: {activeAccount.name} ({activeAccount.phone})
                            </AlertDescription>
                        </Alert>
                    )}

                    {/* Date Range */}
                    <div className="space-y-2">
                        <Label>نطاق التاريخ</Label>
                        <RadioGroup value={dateRange} onValueChange={(v) => setDateRange(v as "today" | "range")}>
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <RadioGroupItem value="today" id="col-today" />
                                    <Label htmlFor="col-today">قبض اليوم</Label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <RadioGroupItem value="range" id="col-range" />
                                    <Label htmlFor="col-range">نطاق محدد</Label>
                                </div>
                            </div>
                        </RadioGroup>

                        {dateRange === "range" && (
                            <div className="grid grid-cols-2 gap-4 mt-2">
                                <div className="space-y-1">
                                    <Label className="text-xs">من</Label>
                                    <Input
                                        type="date"
                                        value={fromDate}
                                        onChange={(e) => setFromDate(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs">إلى</Label>
                                    <Input
                                        type="date"
                                        value={toDate}
                                        onChange={(e) => setToDate(e.target.value)}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Recipient */}
                    <div className="space-y-2">
                        <Label>إرسال إلى</Label>
                        <RadioGroup value={recipient} onValueChange={(v) => setRecipient(v as "customer" | "salesRep" | "repGroup" | "both")}>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="flex items-center gap-2">
                                    <RadioGroupItem value="customer" id="col-r-customer" />
                                    <Label htmlFor="col-r-customer" className="text-sm">العميل</Label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <RadioGroupItem value="salesRep" id="col-r-salesRep" />
                                    <Label htmlFor="col-r-salesRep" className="text-sm">المندوب</Label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <RadioGroupItem value="repGroup" id="col-r-repGroup" />
                                    <Label htmlFor="col-r-repGroup" className="text-sm">جروب المندوب</Label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <RadioGroupItem value="both" id="col-r-both" />
                                    <Label htmlFor="col-r-both" className="text-sm">العميل + الجروب</Label>
                                </div>
                            </div>
                        </RadioGroup>
                    </div>

                    {/* Preview */}
                    <div className="bg-muted/50 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                            <span className="text-sm">عمليات القبض المحددة:</span>
                            <Badge variant="secondary" className="text-lg">
                                {filteredCollections.length} عملية
                            </Badge>
                        </div>
                        {filteredCollections.length > 0 && (
                            <>
                                <p className="text-xs text-muted-foreground mt-2">
                                    إجمالي: {filteredCollections.reduce((sum, c) => sum + (Number(c.amount) || 0), 0).toFixed(2)} {currency}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    عدد العملاء: {new Set(filteredCollections.map(c => c.customerId)).size}
                                </p>
                            </>
                        )}
                    </div>

                    {/* Sending Progress */}
                    {sending && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                            <div className="flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                                <span className="text-sm text-blue-800">
                                    جاري الإرسال... ({sendProgress.sent}/{sendProgress.total})
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
                        إلغاء
                    </Button>
                    <Button
                        onClick={handleSend}
                        disabled={filteredCollections.length === 0 || loading || !activeAccount || sending}
                        className="gap-2 bg-green-600 hover:bg-green-700"
                    >
                        {sending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Send className="h-4 w-4" />
                        )}
                        إرسال ({filteredCollections.length})
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default CollectionWhatsAppDialog;
