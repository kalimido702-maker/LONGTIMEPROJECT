import React, { useState, useEffect } from "react";
import { POSHeader } from "@/components/POS/POSHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  UserPlus,
  Phone,
  MapPin,
  CreditCard,
  Award,
  Edit,
  Trash2,
  DollarSign,
  Download,
  Upload,
  FileSpreadsheet,
  MessageCircle,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { db, Customer, Invoice, PaymentMethod, Supervisor, SalesRep, CustomerPhone, CustomerIdentification } from "@/shared/lib/indexedDB";
import { toast } from "sonner";
import { useSettingsContext } from "@/contexts/SettingsContext";
import { useAuth } from "@/contexts/AuthContext";
import { CustomerDetailsDialog } from "@/components/dialogs/CustomerDetailsDialog";
import { ExcelExportButton, ExcelColumn } from "@/components/common/ExcelExportButton";
import { useCustomerBalances } from "@/hooks/useCustomerBalances";
import {
  downloadCustomerImportTemplate,
  importCustomersFromExcel,
  ImportResult,
} from "@/lib/customerImport";
import { usePagination } from "@/hooks/usePagination";
import { DataPagination } from "@/components/ui/DataPagination";
import { Switch } from "@/components/ui/switch";
import { whatsappService } from "@/services/whatsapp/whatsappService";

const Customers = () => {
  const { can, user } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [payingCustomer, setPayingCustomer] = useState<Customer | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState("");
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [selectedCustomerForDetails, setSelectedCustomerForDetails] = useState<Customer | null>(null);
  const [salesReps, setSalesReps] = useState<SalesRep[]>([]);
  const [filterBySalesRep, setFilterBySalesRep] = useState<string>("all");
  const [filterBySupervisor, setFilterBySupervisor] = useState<string>("all");
  const [hideZeroBalance, setHideZeroBalance] = useState(true);
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isImportResultOpen, setIsImportResultOpen] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const { getBalance, refresh: refreshBalances } = useCustomerBalances([customers]);
  const [whatsappGroups, setWhatsappGroups] = useState<{ id: string; name: string }[]>([]);
  const [isFetchingGroups, setIsFetchingGroups] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    address: "",
    nationalId: "",
    creditLimit: 0,
    initialCreditBalance: 0,
    bonusBalance: 0,
    previousStatement: 0,
    notes: "",
    salesRepId: "",
    whatsappGroupId: "",
    invoiceGroupId: "",
    collectionGroupId: "",
    // WhatsApp Bot v2 fields
    customerType: "registered" as "registered" | "casual",
    additionalPhones: [] as string[],
    idNumbers: [] as { number: string; label: string }[],
    latitude: null as number | null,
    longitude: null as number | null,
  });

  useEffect(() => {
    loadCustomers();
    loadPaymentMethods();
    loadSalesReps();
  }, []);

  const loadCustomers = async () => {
    const data = await db.getAll<Customer>("customers");
    setCustomers(data);
  };

  const loadPaymentMethods = async () => {
    const methods = await db.getAll<PaymentMethod>("paymentMethods");
    setPaymentMethods(methods.filter((m) => m.isActive));
  };

  const loadSalesReps = async () => {
    const reps = await db.getAll<SalesRep>("salesReps");
    setSalesReps(reps.filter((r) => r.isActive));
    const sups = await db.getAll<Supervisor>("supervisors");
    setSupervisors(sups.filter((s) => s.isActive));
  };

  const getSalesRepName = (id?: string) => {
    if (!id) return "-";
    return salesReps.find((r) => r.id === id)?.name || "-";
  };

  const filteredCustomers = customers.filter(
    (customer) => {
      // Filter by search query - use optional chaining for safety
      const matchesSearch =
        customer.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        customer.phone?.includes(searchQuery) ||
        customer.nationalId?.includes(searchQuery);

      // Filter by salesRep
      const matchesSalesRep =
        filterBySalesRep === "all" ||
        customer.salesRepId === filterBySalesRep;

      // Filter by supervisor (through salesRep -> supervisorId)
      let matchesSupervisor = true;
      if (filterBySupervisor !== "all") {
        const rep = salesReps.find((r) => r.id === customer.salesRepId);
        matchesSupervisor = !!rep && rep.supervisorId === filterBySupervisor;
      }

      // Filter by zero balance
      const matchesBalance = !hideZeroBalance || getBalance(customer.id, Number(customer.currentBalance || 0)) !== 0;

      return matchesSearch && matchesSalesRep && matchesSupervisor && matchesBalance;
    }
  );

  const pagination = usePagination(filteredCustomers, {
    resetDeps: [searchQuery, filterBySalesRep, filterBySupervisor, hideZeroBalance],
  });

  const { getSetting } = useSettingsContext();

  const currency = getSetting("currency") || "EGP";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name) {
      toast.error("يرجى إدخال اسم العميل");
      return;
    }

    try {
      let customerId: string;

      if (editingCustomer) {
        const updatedCustomer: Customer = {
          ...editingCustomer,
          ...formData,
          whatsappGroupId: formData.whatsappGroupId?.trim() || undefined,
          invoiceGroupId: formData.invoiceGroupId?.trim() || undefined,
          collectionGroupId: formData.collectionGroupId?.trim() || undefined,
        };
        await db.update("customers", updatedCustomer);
        customerId = editingCustomer.id;
        toast.success("تم تحديث بيانات العميل");
      } else {
        const newCustomer: Customer = {
          id: Date.now().toString(),
          ...formData,
          whatsappGroupId: formData.whatsappGroupId?.trim() || undefined,
          invoiceGroupId: formData.invoiceGroupId?.trim() || undefined,
          collectionGroupId: formData.collectionGroupId?.trim() || undefined,
          currentBalance: 0,
          bonusBalance: 0,
          loyaltyPoints: 0,
          createdAt: new Date().toISOString(),
        };
        await db.add("customers", newCustomer);
        customerId = newCustomer.id;

        // إنشاء فاتورة آجلة للرصيد الافتتاحي إذا كان المبلغ أكبر من صفر
        if (formData.initialCreditBalance > 0) {
          const initialCreditAmount =
            parseFloat(formData.initialCreditBalance.toString()) || 0;

          // الحصول على آخر رقم فاتورة (يبدأ من 113)
          const allInvoices = await db.getAll<Invoice>("invoices");
          const lastInvoiceNumber =
            allInvoices.length > 0
              ? Math.max(
                ...allInvoices.map((inv: any) => {
                  const numStr = inv.invoiceNumber || inv.id;
                  const num = parseInt(numStr);
                  return isNaN(num) ? 112 : num;
                })
              )
              : 112;
          const newInvoiceNumber = (lastInvoiceNumber + 1).toString();

          const creditInvoice = {
            id: newInvoiceNumber,
            invoiceNumber: newInvoiceNumber, // رقم الفاتورة المتسلسل
            customerId: newCustomer.id,
            customerName: newCustomer.name,
            items: [],
            subtotal: initialCreditAmount,
            discount: 0,
            tax: 0,
            total: initialCreditAmount,
            paymentType: "credit" as const,
            paymentStatus: "unpaid" as const,
            paidAmount: 0,
            remainingAmount: initialCreditAmount,
            paymentMethodIds: [],
            paymentMethodAmounts: {},
            userId: "system",
            userName: "النظام",
            createdAt: new Date().toISOString(),
            dueDate: new Date(
              Date.now() + 30 * 24 * 60 * 60 * 1000
            ).toISOString(),
            shiftId: undefined,
          };

          await db.add("invoices", creditInvoice);

          // تحديث رصيد العميل
          newCustomer.currentBalance = initialCreditAmount;
          await db.update("customers", newCustomer);

          toast.success("تم إضافة العميل وإنشاء فاتورة الرصيد الافتتاحي");
        } else {
          toast.success("تم إضافة العميل بنجاح");
        }
      }

      // Save additional phones to customerPhones store
      if (formData.additionalPhones.length > 0) {
        // Delete existing additional phones for this customer (keep main phone in customer record)
        const existingPhones = await db.getByIndex<CustomerPhone>("customerPhones", "customerId", customerId);
        for (const phone of existingPhones) {
          await db.delete("customerPhones", phone.id);
        }
        // Add new additional phones
        for (const phone of formData.additionalPhones) {
          if (phone.trim()) {
            const customerPhone: CustomerPhone = {
              id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
              customerId,
              phone: phone.trim(),
              label: "additional",
              isActive: true,
              createdAt: new Date().toISOString(),
            };
            await db.add("customerPhones", customerPhone);
          }
        }
      }

      // Save ID numbers to customerIdentifications store
      if (formData.idNumbers.length > 0) {
        // Delete existing identifications for this customer
        const existingIds = await db.getByIndex<CustomerIdentification>("customerIdentifications", "customerId", customerId);
        for (const id of existingIds) {
          await db.delete("customerIdentifications", id.id);
        }
        // Add new ID numbers
        for (const idObj of formData.idNumbers) {
          if (idObj.number.trim()) {
            const customerIdRecord: CustomerIdentification = {
              id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
              customerId,
              idNumber: idObj.number.trim(),
              label: idObj.label || "primary",
              isActive: true,
              createdAt: new Date().toISOString(),
            };
            await db.add("customerIdentifications", customerIdRecord);
          }
        }
      }

      setIsDialogOpen(false);
      resetForm();
      loadCustomers();
    } catch (error) {
      console.error("Error saving customer:", error);
      toast.error("حدث خطأ أثناء حفظ البيانات");
    }
  };

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      nationalId: customer.nationalId || "",
      creditLimit: customer.creditLimit,
      initialCreditBalance: 0,
      bonusBalance: customer.bonusBalance || 0,
      previousStatement: customer.previousStatement || 0,
      notes: customer.notes || "",
      salesRepId: customer.salesRepId || "",
      whatsappGroupId: customer.whatsappGroupId || "",
      invoiceGroupId: customer.invoiceGroupId || "",
      collectionGroupId: customer.collectionGroupId || "",
      // WhatsApp Bot v2 fields
      customerType: customer.customerType || "registered",
      additionalPhones: [],
      idNumbers: [],
      latitude: customer.latitude || null,
      longitude: customer.longitude || null,
    });
    // Load additional phones and ID numbers from IndexedDB
    loadCustomerAdditionalData(customer.id);
    setIsDialogOpen(true);
  };

  const loadCustomerAdditionalData = async (customerId: string) => {
    try {
      // Load additional phones
      const phones = await db.getByIndex<CustomerPhone>("customerPhones", "customerId", customerId);
      const additionalPhonesList = phones.filter(p => p.isActive).map(p => p.phone);
      setFormData(prev => ({ ...prev, additionalPhones: additionalPhonesList }));

      // Load ID numbers
      const ids = await db.getByIndex<CustomerIdentification>("customerIdentifications", "customerId", customerId);
      const idNumbersList = ids.filter(id => id.isActive).map(id => ({ number: id.idNumber, label: id.label }));
      setFormData(prev => ({ ...prev, idNumbers: idNumbersList }));
    } catch (error) {
      console.error("Error loading customer additional data:", error);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("هل أنت متأكد من حذف هذا العميل؟")) {
      try {
        await db.delete("customers", id);
        toast.success("تم حذف العميل");
        loadCustomers();
      } catch (error) {
        toast.error("حدث خطأ أثناء الحذف");
      }
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      phone: "",
      address: "",
      nationalId: "",
      creditLimit: 0,
      initialCreditBalance: 0,
      bonusBalance: 0,
      previousStatement: 0,
      notes: "",
      salesRepId: "",
      whatsappGroupId: "",
      invoiceGroupId: "",
      collectionGroupId: "",
      // WhatsApp Bot v2 fields
      customerType: "registered",
      additionalPhones: [],
      idNumbers: [],
      latitude: null,
      longitude: null,
    });
    setEditingCustomer(null);
    setWhatsappGroups([]);
  };

  const handleFetchWhatsAppGroups = async () => {
    setIsFetchingGroups(true);
    try {
      const accounts = await db.getAll<any>("whatsappAccounts");
      const activeAccount = accounts.find((a: any) => a.isActive && a.status === "connected");
      if (!activeAccount) {
        toast.error("يرجى التأكد من وجود حساب واتساب متصل");
        return;
      }
      const groups = await whatsappService.getGroups(activeAccount.id);
      if (groups.length === 0) {
        toast.info("لم يتم العثور على مجموعات");
      } else {
        setWhatsappGroups(groups);
        toast.success(`تم جلب ${groups.length} مجموعة`);
      }
    } catch (error) {
      console.error("Error fetching groups:", error);
      toast.error("فشل جلب المجموعات");
    } finally {
      setIsFetchingGroups(false);
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const result = await importCustomersFromExcel(file);
      setImportResult(result);
      setIsImportResultOpen(true);

      if (result.success) {
        toast.success(`تم استيراد ${result.imported} عميل بنجاح`);
        loadCustomers();
      } else if (result.imported === 0) {
        toast.error("لم يتم استيراد أي عميل");
      } else {
        toast.warning(`تم استيراد ${result.imported} عميل مع ${result.skipped} تم تخطيهم`);
        loadCustomers();
      }
    } catch (error) {
      toast.error("حدث خطأ أثناء استيراد الملف");
    } finally {
      setIsImporting(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const openPaymentDialog = (customer: Customer) => {
    setPayingCustomer(customer);
    setPaymentAmount("");
    // Set default payment method to cash
    const cashMethod = paymentMethods.find((m) => m.type === "cash");
    setSelectedPaymentMethodId(cashMethod?.id || paymentMethods[0]?.id || "");
    setIsPaymentDialogOpen(true);
  };

  const handlePayment = async () => {
    if (!payingCustomer) return;

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("الرجاء إدخال مبلغ صحيح");
      return;
    }

    if (amount > getBalance(payingCustomer.id, Number(payingCustomer.currentBalance) || 0)) {
      toast.error("المبلغ المدخل أكبر من رصيد العميل");
      return;
    }

    if (!selectedPaymentMethodId) {
      toast.error("الرجاء اختيار طريقة الدفع");
      return;
    }

    try {
      // جلب جميع فواتير العميل الآجلة
      const allInvoices = await db.getAll<Invoice>("invoices");
      const customerInvoices = allInvoices
        .filter(
          (inv) =>
            inv.customerId === payingCustomer.id &&
            inv.remainingAmount > 0 &&
            inv.paymentType === "credit"
        )
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        ); // الأقدم أولاً

      let remainingPayment = amount;

      // توزيع المبلغ على الفواتير من الأقدم للأحدث
      for (const invoice of customerInvoices) {
        if (remainingPayment <= 0) break;

        const paymentForThisInvoice = Math.min(
          remainingPayment,
          invoice.remainingAmount
        );

        const updatedInvoice: Invoice = {
          ...invoice,
          paidAmount: invoice.paidAmount + paymentForThisInvoice,
          remainingAmount: invoice.remainingAmount - paymentForThisInvoice,
          paymentStatus:
            invoice.remainingAmount - paymentForThisInvoice <= 0.01
              ? "paid"
              : "partial",
        };

        await db.update("invoices", updatedInvoice);
        remainingPayment -= paymentForThisInvoice;
      }

      // تحديث رصيد العميل
      const updatedCustomer: Customer = {
        ...payingCustomer,
        currentBalance: Number(payingCustomer.currentBalance || 0) - amount,
      };
      await db.update("customers", updatedCustomer);

      // إنشاء سجل دفع للتتبع في التقارير اليومية
      const selectedMethod = paymentMethods.find(
        (m) => m.id === selectedPaymentMethodId
      );
      // توليد رقم عشوائي فريد من 6 أرقام
      let receiptId = '';
      const allPayments = await db.getAll<any>("payments");
      const existingIds = new Set(allPayments.map((p: any) => p.id));
      while (true) {
        const num = Math.floor(100000 + Math.random() * 900000).toString();
        if (!existingIds.has(num)) {
          receiptId = num;
          break;
        }
      }

      const paymentRecord = {
        id: receiptId,
        customerId: String(payingCustomer.id),
        customerName: payingCustomer.name,
        amount: amount,
        paymentMethodId: selectedPaymentMethodId,
        paymentMethodName: selectedMethod?.name || "غير محدد",
        paymentType: "collection",
        paymentDate: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        userId: user?.id || "",
        userName: user?.name || "",
        notes: `تسديد من رصيد العميل - ${payingCustomer.name}`,
      };
      await db.add("payments", paymentRecord);

      toast.success(`تم تسديد ${amount.toFixed(2)} ${currency} من رصيد العميل`);
      loadCustomers();
      setIsPaymentDialogOpen(false);
      setPayingCustomer(null);
      setPaymentAmount("");
    } catch (error) {
      console.error("Payment error:", error);
      toast.error("حدث خطأ أثناء تسجيل الدفعة");
    }
  };

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-background"
      dir="rtl"
    >
      <POSHeader />

      <main className="container mx-auto px-4 py-6">
        {/* Total Debt Summary Card */}
        <Card className="mb-6 bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/20 dark:to-orange-950/20 border-red-200 dark:border-red-900">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-full bg-red-100 dark:bg-red-900/30">
                  <DollarSign className="h-6 w-6 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">إجمالي المديونية</p>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                    {filteredCustomers.reduce((sum, c) => sum + (getBalance(c.id, Number(c.currentBalance) || 0) > 0 ? getBalance(c.id, Number(c.currentBalance) || 0) : 0), 0).toLocaleString("ar-EG", { minimumFractionDigits: 2 })} {currency}
                  </p>
                </div>
              </div>
              <div className="text-left">
                <p className="text-sm text-muted-foreground">عدد العملاء المدينين</p>
                <p className="text-xl font-bold">{filteredCustomers.filter(c => getBalance(c.id, Number(c.currentBalance) || 0) > 0).length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">إدارة العملاء</h1>
          <div className="flex gap-2">
            {/* زر تصدير Excel */}
            <ExcelExportButton
              data={filteredCustomers.map(c => ({
                ...c,
                currentBalance: getBalance(c.id, Number(c.currentBalance) || 0),
                creditDebit: getBalance(c.id, Number(c.currentBalance) || 0) >= 0 ? "دائنة" : "مدينة",
                salesRepName: getSalesRepName(c.salesRepId),
              }))}
              columns={[
                { header: "اسم الحساب", key: "name", width: 25 },
                { header: "المندوب", key: "salesRepName", width: 20 },
                { header: "الرصيد الحالي", key: "currentBalance", width: 15 },
                { header: "دائن - مدين", key: "creditDebit", width: 12 },
                { header: "عنوان", key: "address", width: 30 },
                { header: "بيانات الاتصال", key: "phone", width: 18 },
              ]}
              filename={`العملاء_${new Date().toLocaleDateString("ar-EG")}`}
              sheetName="العملاء"
            />

            {/* أزرار استيراد العملاء - تم إخفاؤها بناءً على طلب العميل */}

            {/* Dialog نتيجة الاستيراد */}
            <Dialog open={isImportResultOpen} onOpenChange={setIsImportResultOpen}>
              <DialogContent dir="rtl">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <FileSpreadsheet className="h-5 w-5" />
                    نتيجة الاستيراد
                  </DialogTitle>
                </DialogHeader>
                {importResult && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-green-600">{importResult.imported}</p>
                        <p className="text-sm text-green-700">تم استيرادهم</p>
                      </div>
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-yellow-600">{importResult.skipped}</p>
                        <p className="text-sm text-yellow-700">تم تخطيهم</p>
                      </div>
                    </div>
                    {importResult.errors.length > 0 && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 max-h-40 overflow-y-auto">
                        <p className="font-semibold text-red-700 mb-2">الأخطاء:</p>
                        <ul className="text-sm text-red-600 space-y-1">
                          {importResult.errors.map((error, i) => (
                            <li key={i}>• {error}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <Button onClick={() => setIsImportResultOpen(false)} className="w-full">
                      إغلاق
                    </Button>
                  </div>
                )}
              </DialogContent>
            </Dialog>

            <Dialog
              open={isDialogOpen}
              onOpenChange={(open) => {
                setIsDialogOpen(open);
                if (!open) resetForm();
              }}
            >
              {can("customers", "create") && (
                <DialogTrigger asChild>
                  <Button size="lg">
                    <UserPlus className="ml-2 h-5 w-5" />
                    إضافة عميل جديد
                  </Button>
                </DialogTrigger>
              )}
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
                <DialogHeader>
                  <DialogTitle>
                    {editingCustomer ? "تعديل بيانات العميل" : "إضافة عميل جديد"}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">اسم العميل *</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) =>
                          setFormData({ ...formData, name: e.target.value })
                        }
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">رقم الهاتف</Label>
                      <Input
                        id="phone"
                        value={formData.phone}
                        onChange={(e) =>
                          setFormData({ ...formData, phone: e.target.value })
                        }
                        placeholder="رقم الموبايل (اختياري)"
                      />
                    </div>
                  </div>

                  {/* WhatsApp Bot v2: Customer Type Selector */}
                  <div className="space-y-2">
                    <Label htmlFor="customerType">نوع العميل</Label>
                    <Select
                      value={formData.customerType}
                      onValueChange={(v) => setFormData({ ...formData, customerType: v as "registered" | "casual" })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="registered">مسجل (Long-Time) - له رقم تعريفي</SelectItem>
                        <SelectItem value="casual">عادي - بدون رقم تعريفي</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* WhatsApp Bot v2: Additional Phone Numbers */}
                  <div className="space-y-2">
                    <Label>أرقام تليفونات إضافية</Label>
                    {formData.additionalPhones.map((phone, idx) => (
                      <div key={idx} className="flex gap-2">
                        <Input
                          value={phone}
                          onChange={(e) => {
                            const newPhones = [...formData.additionalPhones];
                            newPhones[idx] = e.target.value;
                            setFormData({ ...formData, additionalPhones: newPhones });
                          }}
                          placeholder={`تليفون ${idx + 2}`}
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={() => {
                            const newPhones = formData.additionalPhones.filter((_, i) => i !== idx);
                            setFormData({ ...formData, additionalPhones: newPhones });
                          }}
                        >
                          حذف
                        </Button>
                      </div>
                    ))}
                    {formData.additionalPhones.length < 2 && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setFormData({ ...formData, additionalPhones: [...formData.additionalPhones, ""] })}
                      >
                        + إضافة رقم تليفون آخر
                      </Button>
                    )}
                  </div>

                  {/* WhatsApp Bot v2: Customer ID Numbers (for registered customers) */}
                  {formData.customerType === "registered" && (
                    <div className="space-y-2">
                      <Label>أرقام التعريف (لعملاء Long-Time)</Label>
                      {formData.idNumbers.map((idObj, idx) => (
                        <div key={idx} className="flex gap-2">
                          <Input
                            value={idObj.number}
                            onChange={(e) => {
                              const newIds = [...formData.idNumbers];
                              newIds[idx].number = e.target.value;
                              setFormData({ ...formData, idNumbers: newIds });
                            }}
                            placeholder="رقم التعريف"
                          />
                          <Select
                            value={idObj.label}
                            onValueChange={(v) => {
                              const newIds = [...formData.idNumbers];
                              newIds[idx].label = v;
                              setFormData({ ...formData, idNumbers: newIds });
                            }}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="primary">أساسي</SelectItem>
                              <SelectItem value="secondary">ثانوي</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            variant="destructive"
                            onClick={() => {
                              const newIds = formData.idNumbers.filter((_, i) => i !== idx);
                              setFormData({ ...formData, idNumbers: newIds });
                            }}
                          >
                            حذف
                          </Button>
                        </div>
                      ))}
                      {formData.idNumbers.length < 2 && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setFormData({ ...formData, idNumbers: [...formData.idNumbers, { number: "", label: "primary" }] })}
                        >
                          + إضافة رقم تعريف آخر
                        </Button>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="flex items-center gap-2">
                        <MessageCircle className="h-4 w-4 text-green-600" />
                        جروبات واتساب (اختياري)
                      </Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleFetchWhatsAppGroups}
                        disabled={isFetchingGroups}
                        className="gap-1 shrink-0"
                      >
                        {isFetchingGroups ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                        جلب المجموعات
                      </Button>
                    </div>

                    {/* جروب الفواتير */}
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">📄 جروب الفواتير</Label>
                      <div className="flex-1">
                        {whatsappGroups.length > 0 ? (
                          <Select
                            value={formData.invoiceGroupId || "none"}
                            onValueChange={(value) =>
                              setFormData({ ...formData, invoiceGroupId: value === "none" ? "" : value })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="اختر جروب للفواتير" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">بدون جروب</SelectItem>
                              {whatsappGroups.map((group) => (
                                <SelectItem key={group.id} value={group.id}>
                                  {group.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            value={formData.invoiceGroupId}
                            onChange={(e) =>
                              setFormData({ ...formData, invoiceGroupId: e.target.value })
                            }
                            placeholder="Group ID للفواتير"
                            className="font-mono text-sm"
                          />
                        )}
                      </div>
                    </div>

                    {/* جروب القبض وكشف الحساب */}
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">💰 جروب القبض وكشف الحساب</Label>
                      <div className="flex-1">
                        {whatsappGroups.length > 0 ? (
                          <Select
                            value={formData.collectionGroupId || "none"}
                            onValueChange={(value) =>
                              setFormData({ ...formData, collectionGroupId: value === "none" ? "" : value })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="اختر جروب للقبض وكشف الحساب" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">بدون جروب</SelectItem>
                              {whatsappGroups.map((group) => (
                                <SelectItem key={group.id} value={group.id}>
                                  {group.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            value={formData.collectionGroupId}
                            onChange={(e) =>
                              setFormData({ ...formData, collectionGroupId: e.target.value })
                            }
                            placeholder="Group ID للقبض وكشف الحساب"
                            className="font-mono text-sm"
                          />
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      اضغط "جلب المجموعات" لتحميل الجروبات من الواتساب — حدد جروب مختلف للفواتير وللقبض
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="nationalId">الرقم القومي</Label>
                      <Input
                        id="nationalId"
                        value={formData.nationalId}
                        onChange={(e) =>
                          setFormData({ ...formData, nationalId: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="creditLimit">
                        حد الائتمان ({currency})
                      </Label>
                      <Input
                        id="creditLimit"
                        type="number"
                        value={formData.creditLimit}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            creditLimit: parseFloat(e.target.value),
                          })
                        }
                      />
                    </div>
                  </div>
                  {!editingCustomer && (
                    <div className="space-y-2">
                      <Label htmlFor="initialCreditBalance">
                        الرصيد الافتتاحي للأجل ({currency})
                      </Label>
                      <Input
                        id="initialCreditBalance"
                        type="number"
                        value={formData.initialCreditBalance}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            initialCreditBalance: parseFloat(e.target.value) || 0,
                          })
                        }
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                      />
                      <p className="text-xs text-muted-foreground">
                        سيتم إنشاء فاتورة آجلة تلقائياً بهذا المبلغ عند إضافة
                        العميل
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="bonusBalance">
                        رصيد البونص ({currency})
                      </Label>
                      <Input
                        id="bonusBalance"
                        type="number"
                        value={formData.bonusBalance}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            bonusBalance: parseFloat(e.target.value) || 0,
                          })
                        }
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                      />
                      <p className="text-xs text-muted-foreground">
                        رصيد البونص المتاح للعميل (منفصل عن المدفوعات)
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="previousStatement">
                        رصيد Statement سابق ({currency})
                      </Label>
                      <Input
                        id="previousStatement"
                        type="number"
                        value={formData.previousStatement}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            previousStatement: parseFloat(e.target.value) || 0,
                          })
                        }
                        placeholder="0.00"
                        step="0.01"
                      />
                      <p className="text-xs text-muted-foreground">
                        رصيد سابق من نظام قديم
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>المندوب</Label>
                    <Select
                      value={formData.salesRepId || "none"}
                      onValueChange={(value) =>
                        setFormData({ ...formData, salesRepId: value === "none" ? "" : value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="اختر المندوب (اختياري)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">بدون مندوب</SelectItem>
                        {salesReps.map((rep) => (
                          <SelectItem key={rep.id} value={rep.id}>
                            {rep.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address">العنوان</Label>
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(e) =>
                        setFormData({ ...formData, address: e.target.value })
                      }
                    />
                  </div>

                  {/* WhatsApp Bot v2: Location Fields */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      الموقع على الخريطة
                    </Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="number"
                        step="any"
                        value={formData.latitude || ""}
                        onChange={(e) => setFormData({ ...formData, latitude: parseFloat(e.target.value) || null })}
                        placeholder="خط العرض (Latitude)"
                      />
                      <Input
                        type="number"
                        step="any"
                        value={formData.longitude || ""}
                        onChange={(e) => setFormData({ ...formData, longitude: parseFloat(e.target.value) || null })}
                        placeholder="خط الطول (Longitude)"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        if (navigator.geolocation) {
                          navigator.geolocation.getCurrentPosition(
                            (position) => {
                              setFormData({
                                ...formData,
                                latitude: position.coords.latitude,
                                longitude: position.coords.longitude,
                              });
                              toast.success("تم تحديد الموقع بنجاح");
                            },
                            () => {
                              toast.error("فشل في تحديد الموقع");
                            }
                          );
                        } else {
                          toast.error("المتصفح لا يدعم تحديد الموقع");
                        }
                      }}
                    >
                      📍 تحديد موقعي الحالي
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notes">ملاحظات</Label>
                    <Textarea
                      id="notes"
                      value={formData.notes}
                      onChange={(e) =>
                        setFormData({ ...formData, notes: e.target.value })
                      }
                      rows={3}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsDialogOpen(false)}
                    >
                      إلغاء
                    </Button>
                    <Button type="submit">
                      {editingCustomer ? "حفظ التعديلات" : "إضافة العميل"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="flex gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-5 w-5" />
            <Input
              type="text"
              placeholder="ابحث عن عميل (الاسم، الهاتف، الرقم القومي...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-10 h-12"
            />
          </div>
          <Select value={filterBySupervisor} onValueChange={setFilterBySupervisor}>
            <SelectTrigger className="w-48 h-12">
              <SelectValue placeholder="فلترة حسب المشرف" />
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
          <Select value={filterBySalesRep} onValueChange={setFilterBySalesRep}>
            <SelectTrigger className="w-48 h-12">
              <SelectValue placeholder="فلترة حسب المندوب" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع المندوبين</SelectItem>
              {salesReps.map((rep) => (
                <SelectItem key={rep.id} value={rep.id}>
                  {rep.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 h-12 px-3 border rounded-md bg-background">
            <Switch
              dir="ltr"
              id="hideZeroBalance"
              checked={hideZeroBalance}
              onCheckedChange={setHideZeroBalance}
            />
            <Label htmlFor="hideZeroBalance" className="text-sm whitespace-nowrap cursor-pointer">
              إخفاء الأرصدة الصفرية
            </Label>
          </div>
        </div>

        {/* Customers Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pagination.paginatedItems.map((customer) => (
            <Card
              key={customer.id}
              className="hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => {
                setSelectedCustomerForDetails(customer);
                setIsDetailsDialogOpen(true);
              }}
            >
              <CardHeader>
                <CardTitle className="flex justify-between items-start">
                  <span className="text-xl">{customer.name}</span>
                  <div className="flex gap-2">
                    {can("customers", "edit") && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(customer);
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    )}
                    {can("customers", "delete") && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(customer.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-4 w-4" />
                  <span>{customer.phone}</span>
                </div>
                {customer.address && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span className="text-sm">{customer.address}</span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4 pt-3 border-t">
                  <div>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
                      <CreditCard className="h-3 w-3" />
                      <span>الرصيد الحالي</span>
                    </div>
                    <p
                      className={`text-lg font-bold ${getBalance(customer.id, Number(customer.currentBalance) || 0) > 0
                        ? "text-destructive"
                        : "text-success"
                        }`}
                    >
                      {getBalance(customer.id, Number(customer.currentBalance) || 0).toFixed(2)} {currency}
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
                      <Award className="h-3 w-3" />
                      <span>نقاط الولاء</span>
                    </div>
                    <p className="text-lg font-bold text-primary">
                      {customer.loyaltyPoints}
                    </p>
                  </div>
                </div>
                {Number(customer.creditLimit) > 0 && (
                  <div className="pt-2 text-sm text-muted-foreground">
                    حد الائتمان: {Number(customer.creditLimit || 0).toFixed(2)} {currency}
                  </div>
                )}

                {/* زر التسديد */}
                {can("credit", "edit") && getBalance(customer.id, Number(customer.currentBalance) || 0) > 0 && (
                  <div className="pt-3 border-t">
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        openPaymentDialog(customer);
                      }}
                      className="w-full gap-2"
                      variant="outline"
                    >
                      <DollarSign className="h-4 w-4" />
                      تسديد من رصيد العميل
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredCustomers.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-lg">
              لا توجد بيانات عملاء
            </p>
          </div>
        )}
        <DataPagination {...pagination} entityName="عميل" />
      </main>

      {/* Dialog للدفع من رصيد العميل */}
      <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              تسديد من رصيد العميل
            </DialogTitle>
          </DialogHeader>
          {payingCustomer && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-2">
                  معلومات العميل
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">الاسم:</span>
                    <span className="font-semibold">{payingCustomer.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">الهاتف:</span>
                    <span className="font-semibold">
                      {payingCustomer.phone}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">الرصيد المستحق:</span>
                    <span className="font-semibold text-destructive">
                      {getBalance(payingCustomer.id, Number(payingCustomer.currentBalance) || 0).toFixed(2)} {currency}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                <p className="text-amber-900">
                  <strong>ملاحظة:</strong> سيتم توزيع المبلغ تلقائياً على جميع
                  فواتير العميل بدءاً من الأقدم إلى الأحدث.
                </p>
              </div>

              {/* اختيار طريقة الدفع */}
              <div className="space-y-2">
                <Label>طريقة الدفع</Label>
                <Select
                  value={selectedPaymentMethodId}
                  onValueChange={setSelectedPaymentMethodId}
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
                <Label htmlFor="customer-payment-amount">مبلغ الدفعة</Label>
                <Input
                  id="customer-payment-amount"
                  type="number"
                  placeholder="أدخل المبلغ"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  min="0"
                  max={getBalance(payingCustomer.id, Number(payingCustomer.currentBalance) || 0)}
                  step="0.01"
                />
                <p className="text-xs text-muted-foreground">
                  الحد الأقصى: {getBalance(payingCustomer.id, Number(payingCustomer.currentBalance) || 0).toFixed(2)}{" "}
                  {currency}
                </p>
              </div>

              {paymentAmount && parseFloat(paymentAmount) > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-sm text-green-900">
                    المبلغ المتبقي بعد الدفع:{" "}
                    <strong>
                      {(
                        getBalance(payingCustomer.id, Number(payingCustomer.currentBalance) || 0) -
                        parseFloat(paymentAmount)
                      ).toFixed(2)}{" "}
                      {currency}
                    </strong>
                  </p>
                </div>
              )}

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsPaymentDialogOpen(false)}
                >
                  إلغاء
                </Button>
                <Button onClick={handlePayment}>تسديد من رصيد العميل</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Customer Details Dialog */}
      <CustomerDetailsDialog
        open={isDetailsDialogOpen}
        onOpenChange={setIsDetailsDialogOpen}
        customer={selectedCustomerForDetails}
      />
    </div>
  );
};

export default Customers;
