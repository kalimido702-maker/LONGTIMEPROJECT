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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MessageCircle, Send, AlertCircle, Loader2 } from "lucide-react";
import { db, Invoice, Customer } from "@/shared/lib/indexedDB";
import { useToast } from "@/hooks/use-toast";
import { useSettingsContext } from "@/contexts/SettingsContext";
import { whatsappService, WhatsAppAccount } from "@/services/whatsapp/whatsappService";

interface SalesRep {
    id: string;
    name: string;
    phone: string;
    whatsappGroupId?: string;
}

interface InvoiceWhatsAppDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const InvoiceWhatsAppDialog = ({
    open,
    onOpenChange,
}: InvoiceWhatsAppDialogProps) => {
    const { toast } = useToast();
    const { getSetting } = useSettingsContext();
    const currency = getSetting("currency") || "EGP";
    const storeName = getSetting("storeName") || "المتجر";

    const [invoices, setInvoices] = useState<Invoice[]>([]);
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
    const [includeUnpaid, setIncludeUnpaid] = useState(true);
    const [includePaid, setIncludePaid] = useState(false);

    // Load data when dialog opens
    useEffect(() => {
        if (open) {
            loadData();
        }
    }, [open]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [invs, custs, reps, accounts] = await Promise.all([
                db.getAll<Invoice>("invoices"),
                db.getAll<Customer>("customers"),
                db.getAll<SalesRep>("salesReps"),
                db.getAll<WhatsAppAccount>("whatsappAccounts"),
            ]);
            setInvoices(invs);
            setCustomers(custs);
            setSalesReps(reps);

            // Find active & connected WhatsApp account
            const active = accounts.find(a => a.isActive && a.status === "connected");
            setActiveAccount(active || null);
        } catch (error) {
            console.error("Error loading data:", error);
        }
        setLoading(false);
    };

    // Filter invoices based on criteria
    const filteredInvoices = useMemo(() => {
        // Use local date for "today" to match user expectation
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        return invoices.filter((inv) => {
            if (!inv.createdAt) return false;

            // Date filter - convert invoice UTC/ISO date to local YYYY-MM-DD
            const invDateObj = new Date(inv.createdAt);
            const invDate = `${invDateObj.getFullYear()}-${String(invDateObj.getMonth() + 1).padStart(2, '0')}-${String(invDateObj.getDate()).padStart(2, '0')}`;

            if (dateRange === "today") {
                if (invDate !== today) return false;
            } else {
                if (invDate < fromDate || invDate > toDate) return false;
            }

            // Payment status filter
            const isPaid = inv.paymentStatus === "paid";
            if (isPaid && !includePaid) return false;
            if (!isPaid && !includeUnpaid) return false;

            return true;
        });
    }, [invoices, dateRange, fromDate, toDate, includeUnpaid, includePaid]);

    // Format invoice message
    const formatInvoiceMessage = (inv: Invoice) => {
        return `🧾 *فاتورة رقم ${inv.invoiceNumber || inv.id}*

*العميل:* ${inv.customerName}
*التاريخ:* ${new Date(inv.createdAt).toLocaleDateString("ar-EG")}
*الإجمالي:* ${Math.round(inv.total)} ${currency}

شركة لونج تايم للصناعة الكهربائية`;
    };

    // Send invoices using WhatsApp service
    const handleSend = async () => {
        if (!activeAccount) {
            toast({
                title: "لا يوجد حساب واتساب متصل",
                description: "يرجى ربط حساب واتساب أولاً من صفحة إدارة الواتساب",
                variant: "destructive"
            });
            return;
        }

        if (filteredInvoices.length === 0) {
            toast({ title: "لا توجد فواتير للإرسال", variant: "destructive" });
            return;
        }

        setSending(true);
        let sentCount = 0;
        let failedCount = 0;
        const totalMessages = filteredInvoices.length * (recipient === "both" ? 2 : 1);
        setSendProgress({ sent: 0, total: totalMessages });

        try {
            // Import PDF service and DB
            const { generateInvoicePDF, convertToPDFData } = await import("@/services/invoicePdfService");

            // Fetch products for data enrichment (unitsPerCarton)
            const allProducts = await db.getAll("products");

            for (const inv of filteredInvoices) {
                const customer = customers.find((c) => c.id === inv.customerId);
                const salesRep = salesReps.find((r) => r.id === customer?.salesRepId);

                // Update Progress Toast
                toast({
                    title: `📑 جاري معالجة الفاتورة ${inv.invoiceNumber || inv.id}...`,
                    description: `التقدم: ${sentCount + failedCount + 1}/${totalMessages}`
                });

                // enrich items with unitsPerCarton
                const enrichedItems = (inv.items || []).map((item: any) => {
                    const product = allProducts.find((p: any) => p.id === item.productId || p.name === item.productName || p.name === item.name);
                    return {
                        ...item,
                        unitsPerCarton: product?.unitsPerCarton || product?.cartonCount,
                        productCode: item.productCode || product?.code || product?.sku || "-"
                    };
                });

                // Prepare PDF Data
                const pdfData = convertToPDFData(
                    inv,
                    customer || { name: inv.customerName } as any,
                    enrichedItems,
                    salesRep
                );

                // Generate PDF Blob
                const pdfBlob = await generateInvoicePDF(pdfData);

                // Convert to Base64
                const base64data = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(pdfBlob);
                });

                const caption = formatInvoiceMessage(inv);
                const filename = `فاتورة-${inv.invoiceNumber || inv.id}.pdf`;

                // Helper to send to a target
                const sendToTarget = async (targetPhone: string, targetType: string) => {
                    try {
                        await whatsappService.sendMessage(
                            activeAccount.id,
                            targetPhone,
                            caption,
                            {
                                type: "document",
                                url: base64data,
                                caption: caption,
                                filename: filename
                            },
                            { invoiceId: inv.id, customerId: customer?.id, type: "invoice" }
                        );
                        sentCount++;
                        setSendProgress(prev => ({ ...prev, sent: prev.sent + 1 }));
                        console.log(`✅ Sent PDF invoice ${inv.id} to ${targetType}`);
                    } catch (error) {
                        console.error(`❌ Failed to send PDF invoice ${inv.id} to ${targetType}:`, error);
                        failedCount++;
                        setSendProgress(prev => ({ ...prev, sent: prev.sent + 1 })); // Increment progress even for failures
                    }
                };

                // Send to Customer
                if ((recipient === "customer" || recipient === "both") && customer?.phone) {
                    await sendToTarget(customer.phone, "Customer");
                }

                // Send to Sales Rep
                if ((recipient === "salesRep") && salesRep?.phone) {
                    await sendToTarget(salesRep.phone, "SalesRep");
                }

                // Send to Sales Rep Group
                if ((recipient === "repGroup" || recipient === "both") && salesRep?.whatsappGroupId) {
                    await sendToTarget(salesRep.whatsappGroupId, "SalesRepGroup");
                }

                // Small delay to prevent blocking UI
                await new Promise(r => setTimeout(r, 500));
            }

            if (sentCount > 0) {
                toast({
                    title: `✅ تم إرسال ${sentCount} فاتورة بنجاح`,
                    description: failedCount > 0 ? `فشل ${failedCount} فاتورة` : `تم الإرسال كمرفقات PDF`,
                });
            } else {
                toast({
                    title: "فشل إرسال الفواتير",
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
                        <MessageCircle className="h-5 w-5 text-green-600" />
                        إرسال فواتير واتساب
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
                                    <RadioGroupItem value="today" id="today" />
                                    <Label htmlFor="today">فواتير اليوم</Label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <RadioGroupItem value="range" id="range" />
                                    <Label htmlFor="range">نطاق محدد</Label>
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

                    {/* Payment Status Filter */}
                    <div className="space-y-2">
                        <Label>حالة الدفع</Label>
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <Checkbox
                                    id="unpaid"
                                    checked={includeUnpaid}
                                    onCheckedChange={(c) => setIncludeUnpaid(!!c)}
                                />
                                <Label htmlFor="unpaid" className="text-sm">غير مدفوع</Label>
                            </div>
                            <div className="flex items-center gap-2">
                                <Checkbox
                                    id="paid"
                                    checked={includePaid}
                                    onCheckedChange={(c) => setIncludePaid(!!c)}
                                />
                                <Label htmlFor="paid" className="text-sm">مدفوع</Label>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>إرسال إلى</Label>
                        <RadioGroup value={recipient} onValueChange={(v) => setRecipient(v as "customer" | "salesRep" | "repGroup" | "both")}>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="flex items-center gap-2">
                                    <RadioGroupItem value="customer" id="r-customer" />
                                    <Label htmlFor="r-customer" className="text-sm">العميل</Label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <RadioGroupItem value="salesRep" id="r-salesRep" />
                                    <Label htmlFor="r-salesRep" className="text-sm">المندوب</Label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <RadioGroupItem value="repGroup" id="r-repGroup" />
                                    <Label htmlFor="r-repGroup" className="text-sm">جروب المندوب</Label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <RadioGroupItem value="both" id="r-both" />
                                    <Label htmlFor="r-both" className="text-sm">العميل + الجروب</Label>
                                </div>
                            </div>
                        </RadioGroup>
                    </div>

                    {/* Preview */}
                    <div className="bg-muted/50 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                            <span className="text-sm">الفواتير المحددة:</span>
                            <Badge variant="secondary" className="text-lg">
                                {filteredInvoices.length} فاتورة
                            </Badge>
                        </div>
                        {filteredInvoices.length > 0 && (
                            <p className="text-xs text-muted-foreground mt-2">
                                إجمالي: {filteredInvoices.reduce((sum, i) => sum + (Number(i.total) || 0), 0).toFixed(2)} {currency}
                            </p>
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
                        disabled={filteredInvoices.length === 0 || loading || !activeAccount || sending}
                        className="gap-2 bg-green-600 hover:bg-green-700"
                    >
                        {sending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Send className="h-4 w-4" />
                        )}
                        إرسال ({filteredInvoices.length})
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default InvoiceWhatsAppDialog;
