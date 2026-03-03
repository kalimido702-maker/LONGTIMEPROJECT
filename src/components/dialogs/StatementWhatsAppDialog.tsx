import { useState, useEffect, useMemo } from "react";
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
import { MessageCircle, Send, FileText, User, AlertCircle, Loader2, Search, Check, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { db, Customer, Invoice } from "@/shared/lib/indexedDB";
import { useToast } from "@/hooks/use-toast";
import { useSettingsContext } from "@/contexts/SettingsContext";
import { whatsappService, WhatsAppAccount } from "@/services/whatsapp/whatsappService";
import { generateAccountStatement } from "@/lib/accountStatementExport";
import { useCustomerBalances } from "@/hooks/useCustomerBalances";

interface StatementWhatsAppDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const StatementWhatsAppDialog = ({
    open,
    onOpenChange,
}: StatementWhatsAppDialogProps) => {
    const { toast } = useToast();
    const { getSetting } = useSettingsContext();
    const currency = getSetting("currency") || "EGP";
    const storeName = getSetting("storeName") || "المتجر";

    const [customers, setCustomers] = useState<Customer[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [activeAccount, setActiveAccount] = useState<WhatsAppAccount | null>(null);
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);

    // Options
    const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
    const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
    const [customerSearchQuery, setCustomerSearchQuery] = useState("");
    const [contentType, setContentType] = useState<"balanceOnly" | "balanceAndStatement">("balanceOnly");
    const [sendMethod, setSendMethod] = useState<"whatsapp" | "savePdf">("whatsapp");
    const [fromDate, setFromDate] = useState(new Date(new Date().getFullYear(), 0, 1).toLocaleDateString('en-CA'));
    const [toDate, setToDate] = useState(new Date().toLocaleDateString('en-CA'));
    const [calculatedBalance, setCalculatedBalance] = useState<number | null>(null);
    const { balanceMap, getBalance, refresh: refreshBalances } = useCustomerBalances([open]);

    useEffect(() => {
        if (open) {
            loadData();
        }
    }, [open]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [custs, invs, accounts] = await Promise.all([
                db.getAll<Customer>("customers"),
                db.getAll<Invoice>("invoices"),
                db.getAll<WhatsAppAccount>("whatsappAccounts"),
            ]);
            setCustomers(custs); // سيتم فلترة العملاء حسب الرصيد المحسوب
            setInvoices(invs);

            // Find active & connected WhatsApp account
            const active = accounts.find(a => a.isActive && a.status === "connected");
            setActiveAccount(active || null);
        } catch (error) {
            console.error("Error loading data:", error);
        }
        setLoading(false);
    };

    // Get selected customer
    const selectedCustomer = useMemo(() => {
        return customers.find((c) => c.id === selectedCustomerId);
    }, [customers, selectedCustomerId]);

    // Filtered customers for search (show ALL customers - no balance filter)
    const filteredCustomersForSearch = useMemo(() => {
        if (!customerSearchQuery.trim()) return customers;
        const q = customerSearchQuery.toLowerCase();
        return customers.filter(
            (c) => c.name?.toLowerCase().includes(q) || c.phone?.includes(q)
        );
    }, [customers, customerSearchQuery]);

    // Get customer invoices for statement
    const customerInvoices = useMemo(() => {
        if (!selectedCustomerId) return [];

        return invoices
            .filter((inv) => {
                if (inv.customerId !== selectedCustomerId) return false;
                // Use local date for comparison to avoid timezone issues
                const invDate = new Date(inv.createdAt).toLocaleDateString('en-CA');
                return invDate >= fromDate && invDate <= toDate;
            })
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }, [invoices, selectedCustomerId, fromDate, toDate]);

    // Calculate actual balance from account statement
    useEffect(() => {
        if (!selectedCustomerId) {
            setCalculatedBalance(null);
            return;
        }
        const calcBalance = async () => {
            try {
                const data = await generateAccountStatement(selectedCustomerId, new Date(fromDate), new Date(toDate));
                if (data) {
                    setCalculatedBalance(data.closingBalance);
                }
            } catch (e) {
                console.error('Error calculating balance:', e);
            }
        };
        calcBalance();
    }, [selectedCustomerId, fromDate, toDate]);

    // Format balance message
    const formatBalanceMessage = () => {
        if (!selectedCustomer) return "";

        const now = new Date();
        const dateStr = now.toLocaleDateString("ar-EG");
        const timeStr = now.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
        const balance = calculatedBalance !== null ? Math.round(calculatedBalance) : Math.round(getBalance(selectedCustomer.id, Number(selectedCustomer.currentBalance) || 0));

        return `شركة لونج تايم للصناعات الكهربائية 

رصيد المديونية 
*العميل:* ${selectedCustomer.name}
---
*الرصيد المستحق:* ${balance} جنيه

---

${dateStr} ${timeStr}`;
    };

    // Format full statement message
    const formatStatementMessage = () => {
        if (!selectedCustomer) return "";

        let message = `📋 *كشف حساب تفصيلي - ${storeName}*

*العميل:* ${selectedCustomer.name}
*الفترة:* من ${fromDate} إلى ${toDate}

`;

        if (customerInvoices.length > 0) {
            message += `*الفواتير:*\n`;
            let runningTotal = 0;

            customerInvoices.forEach((inv, idx) => {
                runningTotal += Number(inv.remainingAmount || 0);
                message += `${idx + 1}. ${new Date(inv.createdAt).toLocaleDateString("ar-EG")} - فاتورة #${inv.invoiceNumber || inv.id}\n`;
                message += `   المبلغ: ${Number(inv.total || 0).toFixed(2)} | المدفوع: ${Number(inv.paidAmount || 0).toFixed(2)} | المتبقي: ${Number(inv.remainingAmount || 0).toFixed(2)}\n`;
            });

            message += `\n---\n*إجمالي المتبقي:* ${runningTotal.toFixed(2)} ${currency}\n`;
        } else {
            message += `لا توجد فواتير في هذه الفترة.\n`;
        }

        const actualBal = calculatedBalance !== null ? calculatedBalance : getBalance(selectedCustomer.id, Number(selectedCustomer.currentBalance) || 0);
        message += `\n*الرصيد الحالي:* ${Number(actualBal).toFixed(2)} ${currency}\n`;
        message += `\nنرجو سداد المبلغ المستحق.\nشكراً`;

        return message;
    };

    // Save as PDF locally
    const handleSavePDF = async () => {
        if (!selectedCustomer) {
            toast({ title: "يرجى اختيار عميل", variant: "destructive" });
            return;
        }

        setSending(true);

        try {
            if (contentType === "balanceOnly") {
                // For balance only, generate a simple text-based PDF
                const { generateStatementPDF } = await import("@/services/statementPdfService");
                const from = new Date(fromDate);
                const to = new Date(toDate);
                const pdfBlob = await generateStatementPDF(selectedCustomer.id, from, to);

                if (!pdfBlob) {
                    throw new Error("فشل توليد ملف PDF");
                }

                const url = URL.createObjectURL(pdfBlob);
                const link = document.createElement("a");
                link.href = url;
                link.download = `رصيد ${selectedCustomer.name}.pdf`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            } else {
                // Generate full statement PDF
                toast({ title: "📊 جاري توليد كشف الحساب...", description: "يرجى الانتظار" });

                const { generateStatementPDF } = await import("@/services/statementPdfService");
                const from = new Date(fromDate);
                const to = new Date(toDate);
                const pdfBlob = await generateStatementPDF(selectedCustomer.id, from, to);

                if (!pdfBlob) {
                    throw new Error("فشل توليد ملف PDF");
                }

                const url = URL.createObjectURL(pdfBlob);
                const link = document.createElement("a");
                link.href = url;
                link.download = `كشف حساب ${selectedCustomer.name}.pdf`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            }

            toast({
                title: "✅ تم حفظ الملف بنجاح",
                description: `تم حفظ ملف PDF على الجهاز`,
            });

            onOpenChange(false);
        } catch (error: any) {
            console.error("Failed to save PDF:", error);
            toast({
                title: "فشل حفظ الملف",
                description: error.message || "حدث خطأ أثناء توليد الملف",
                variant: "destructive"
            });
        }

        setSending(false);
    };

    // Send statement using WhatsApp service
    const handleSend = async () => {
        // If save PDF mode, use separate handler
        if (sendMethod === "savePdf") {
            return handleSavePDF();
        }

        if (!activeAccount) {
            toast({
                title: "لا يوجد حساب واتساب متصل",
                description: "يرجى ربط حساب واتساب أولاً من صفحة إدارة الواتساب",
                variant: "destructive"
            });
            return;
        }

        if (!selectedCustomer) {
            toast({ title: "يرجى اختيار عميل", variant: "destructive" });
            return;
        }

        // تحديد وجهة الإرسال (جروب القبض/كشف الحساب أو رقم هاتف)
        const sendTarget = selectedCustomer.collectionGroupId || selectedCustomer.whatsappGroupId || selectedCustomer.phone;
        if (!sendTarget) {
            toast({ title: "العميل ليس لديه رقم هاتف أو جروب واتساب", variant: "destructive" });
            return;
        }

        setSending(true);

        try {
            if (contentType === "balanceOnly") {
                // Send simple text for balance
                const message = formatBalanceMessage();
                await whatsappService.sendMessage(
                    activeAccount.id,
                    sendTarget,
                    message,
                    undefined,
                    { customerId: selectedCustomer.id, type: "reminder" }
                );
            } else {
                // Send PDF for detailed statement
                toast({ title: "📊 جاري توليد كشف الحساب...", description: "يرجى الانتظار" });

                const { generateStatementPDF } = await import("@/services/statementPdfService");
                const from = new Date(fromDate);
                const to = new Date(toDate);

                // Use pre-calculated balance, or fallback to customer stored balance
                const actualBalance = calculatedBalance !== null ? Math.round(calculatedBalance) : Number(selectedCustomer.currentBalance || 0);

                const pdfBlob = await generateStatementPDF(selectedCustomer.id, from, to);

                if (!pdfBlob) {
                    throw new Error("فشل توليد ملف PDF");
                }

                toast({ title: "📤 جاري الإرسال...", description: "يتم رفع الملف" });

                // Convert blob to base64
                const base64data = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(pdfBlob);
                });

                const caption = `📊 *كشف حساب تفصيلي*\n` +
                    `*العميل:* ${selectedCustomer.name}\n` +
                    `*الفترة:* ${fromDate} إلى ${toDate}\n\n` +
                    `*الرصيد النهائي:* ${actualBalance} ${currency}\n\n` +
                    `يرجى مراجعة الملف المرفق.`;

                await whatsappService.sendMessage(
                    activeAccount.id,
                    sendTarget,
                    caption, // Message text used as caption
                    {
                        type: "document",
                        url: base64data,
                        caption: caption,
                        filename: `كشف حساب ${selectedCustomer.name}.pdf`
                    },
                    { customerId: selectedCustomer.id, type: "statement" }
                );
            }

            toast({
                title: "✅ تم الإرسال بنجاح",
                description: contentType === "balanceOnly" ? "تم إرسال الرصيد" : "تم إرسال ملف كشف الحساب",
            });

            onOpenChange(false);
        } catch (error: any) {
            console.error("Failed to send statement:", error);
            toast({
                title: "فشل الإرسال",
                description: error.message || "حدث خطأ أثناء الإرسال",
                variant: "destructive"
            });
        }

        setSending(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent dir="rtl" className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-blue-600" />
                        إرسال كشف حساب واتساب
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Customer Selection */}
                    <div className="space-y-2">
                        <Label>اختر العميل</Label>
                        <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
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
                                                رصيد: {getBalance(selectedCustomer.id, Number(selectedCustomer.currentBalance) || 0).toFixed(2)} {currency}
                                            </span>
                                        </div>
                                    ) : (
                                        <span className="text-muted-foreground">اختر أو ابحث عن عميل...</span>
                                    )}
                                    <Search className="h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[350px] p-0" align="start">
                                <Command shouldFilter={false}>
                                    <CommandInput
                                        placeholder="ابحث بالاسم أو رقم الهاتف..."
                                        value={customerSearchQuery}
                                        onValueChange={setCustomerSearchQuery}
                                    />
                                    <CommandList>
                                        <CommandEmpty>لا يوجد عملاء</CommandEmpty>
                                        <CommandGroup>
                                            {filteredCustomersForSearch.map((customer) => (
                                                <CommandItem
                                                    key={customer.id}
                                                    value={customer.id}
                                                    onSelect={() => {
                                                        setSelectedCustomerId(customer.id);
                                                        setCustomerSearchOpen(false);
                                                    }}
                                                >
                                                    <Check
                                                        className={cn(
                                                            "mr-2 h-4 w-4",
                                                            selectedCustomerId === customer.id ? "opacity-100" : "opacity-0"
                                                        )}
                                                    />
                                                    <div className="flex flex-col flex-1">
                                                        <span>{customer.name}</span>
                                                        <span className="text-xs text-muted-foreground">{customer.phone}</span>
                                                    </div>
                                                    <Badge variant="destructive" className="text-xs">
                                                        {getBalance(customer.id, Number(customer.currentBalance) || 0).toFixed(2)}
                                                    </Badge>
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Send Method */}
                    <div className="space-y-2">
                        <Label>طريقة الإرسال</Label>
                        <RadioGroup
                            value={sendMethod}
                            onValueChange={(v) => setSendMethod(v as "whatsapp" | "savePdf")}
                        >
                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                                    <RadioGroupItem value="whatsapp" id="method-whatsapp" />
                                    <Label htmlFor="method-whatsapp" className="cursor-pointer">
                                        <div className="font-medium flex items-center gap-1">
                                            <MessageCircle className="h-4 w-4 text-green-600" />
                                            إرسال واتساب
                                        </div>
                                        <div className="text-xs text-muted-foreground">إرسال عبر الواتساب</div>
                                    </Label>
                                </div>
                                <div className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                                    <RadioGroupItem value="savePdf" id="method-pdf" />
                                    <Label htmlFor="method-pdf" className="cursor-pointer">
                                        <div className="font-medium flex items-center gap-1">
                                            <Download className="h-4 w-4 text-blue-600" />
                                            حفظ PDF
                                        </div>
                                        <div className="text-xs text-muted-foreground">حفظ على الجهاز</div>
                                    </Label>
                                </div>
                            </div>
                        </RadioGroup>
                    </div>

                    {/* WhatsApp Account Status */}
                    {sendMethod === "whatsapp" && !activeAccount && (
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>
                                لا يوجد حساب واتساب متصل. يرجى ربط حساب من صفحة إدارة الواتساب أولاً.
                            </AlertDescription>
                        </Alert>
                    )}
                    {sendMethod === "whatsapp" && activeAccount && (
                        <Alert className="bg-green-50 border-green-200">
                            <MessageCircle className="h-4 w-4 text-green-600" />
                            <AlertDescription className="text-green-800">
                                متصل: {activeAccount.name} ({activeAccount.phone})
                            </AlertDescription>
                        </Alert>
                    )}

                    {/* Content Type */}
                    <div className="space-y-2">
                        <Label>نوع الكشف</Label>
                        <RadioGroup
                            value={contentType}
                            onValueChange={(v) => setContentType(v as "balanceOnly" | "balanceAndStatement")}
                        >
                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                                    <RadioGroupItem value="balanceOnly" id="balance" />
                                    <Label htmlFor="balance" className="cursor-pointer">
                                        <div className="font-medium">الرصيد فقط</div>
                                        <div className="text-xs text-muted-foreground">المبلغ المستحق</div>
                                    </Label>
                                </div>
                                <div className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                                    <RadioGroupItem value="balanceAndStatement" id="statement" />
                                    <Label htmlFor="statement" className="cursor-pointer">
                                        <div className="font-medium">كشف تفصيلي</div>
                                        <div className="text-xs text-muted-foreground">جميع الفواتير</div>
                                    </Label>
                                </div>
                            </div>
                        </RadioGroup>
                    </div>

                    {/* Date Range for Statement */}
                    {contentType === "balanceAndStatement" && (
                        <div className="space-y-2">
                            <Label>فترة الكشف</Label>
                            <div className="grid grid-cols-2 gap-4">
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
                        </div>
                    )}

                    {/* Preview */}
                    {selectedCustomer && (
                        <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                            <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium">{selectedCustomer.name}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">الرصيد المستحق:</span>
                                <span className="font-bold text-red-600">
                                    {calculatedBalance !== null ? Math.round(calculatedBalance) : Number(selectedCustomer.currentBalance || 0).toFixed(2)} {currency}
                                </span>
                            </div>
                            {contentType === "balanceAndStatement" && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">عدد الفواتير:</span>
                                    <Badge variant="secondary">{customerInvoices.length}</Badge>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
                        إلغاء
                    </Button>
                    <Button
                        onClick={handleSend}
                        disabled={!selectedCustomerId || loading || (sendMethod === "whatsapp" && !activeAccount) || sending}
                        className={cn("gap-2", sendMethod === "savePdf" ? "bg-blue-600 hover:bg-blue-700" : "bg-green-600 hover:bg-green-700")}
                    >
                        {sending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : sendMethod === "savePdf" ? (
                            <Download className="h-4 w-4" />
                        ) : (
                            <Send className="h-4 w-4" />
                        )}
                        {sendMethod === "savePdf" ? "حفظ PDF" : "إرسال الكشف"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default StatementWhatsAppDialog;
