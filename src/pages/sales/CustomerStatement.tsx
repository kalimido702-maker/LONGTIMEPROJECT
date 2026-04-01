import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { POSHeader } from "@/components/POS/POSHeader";
import { db, Customer, Invoice, SalesReturn } from "@/shared/lib/indexedDB";
import { useSettingsContext } from "@/contexts/SettingsContext";
import { useTabs } from "@/contexts/TabContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, ChevronDown, ChevronUp } from "lucide-react";

interface CollectionRecord {
  id: string;
  customerId: string;
  customerName: string;
  amount: number;
  paymentMethodName: string;
  createdAt: string;
  notes?: string;
}

interface TransactionRecord {
  id: string;
  date: string;
  description: string;
  type: "sale" | "return" | "collection" | "opening";
  debit: number; // مدين (يزيد الرصيد)
  credit: number; // دائن (يقلل الرصيد)
  balance: number; // الرصيد بعد العملية
  items?: { productName: string; quantity: number; price: number; total: number }[];
}

const CustomerStatement = () => {
  const [searchParams] = useSearchParams();
  const [customerId] = useState(() => searchParams.get("customerId") || "");
  const { getSetting } = useSettingsContext();
  const { addTab } = useTabs();
  const currency = getSetting("currency") || "EGP";

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (customerId) loadData();
  }, [customerId]);

  const loadData = async () => {
    setLoading(true);
    await db.init();

    const customerData = await db.get<Customer>("customers", customerId);
    setCustomer(customerData || null);

    const allInvoices = await db.getAll<Invoice>("invoices");
    const allReturns = await db.getAll<SalesReturn>("salesReturns");

    // Collections from localStorage
    let collections: CollectionRecord[] = [];
    try {
      const saved = localStorage.getItem("pos-collections");
      if (saved) {
        const all = JSON.parse(saved) as CollectionRecord[];
        collections = all.filter((c) => c.customerId === customerId);
      }
    } catch {}

    const records: TransactionRecord[] = [];

    // Process invoices
    const custInvoices = allInvoices.filter((inv) => inv.customerId === customerId);
    for (const inv of custInvoices) {
      records.push({
        id: inv.id,
        date: inv.createdAt,
        description: `فاتورة بيع #${inv.invoiceNumber || inv.id}`,
        type: "sale",
        debit: inv.total || 0,
        credit: inv.paidAmount || 0,
        balance: 0,
        items: inv.items.map((i) => ({
          productName: i.productName,
          quantity: i.quantity,
          price: i.price,
          total: i.total,
        })),
      });
    }

    // Process returns
    const custReturns = allReturns.filter((ret) => ret.customerId === customerId);
    for (const ret of custReturns) {
      records.push({
        id: ret.id,
        date: ret.createdAt,
        description: `مرتجع #${ret.id}`,
        type: "return",
        debit: 0,
        credit: ret.total || 0,
        balance: 0,
        items: ret.items.map((i) => ({
          productName: i.productName,
          quantity: i.quantity,
          price: i.price,
          total: i.total,
        })),
      });
    }

    // Process collections
    for (const col of collections) {
      records.push({
        id: col.id,
        date: col.createdAt,
        description: `سند قبض${col.notes ? " - " + col.notes : ""} (${col.paymentMethodName || ""})`,
        type: "collection",
        debit: 0,
        credit: col.amount || 0,
        balance: 0,
      });
    }

    // Sort by date
    records.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Add opening balance if exists
    const openingBalance = (customerData as any)?.previousStatement || 0;
    if (openingBalance > 0) {
      records.unshift({
        id: "opening",
        date: customerData?.createdAt || new Date().toISOString(),
        description: "رصيد افتتاحي",
        type: "opening",
        debit: openingBalance,
        credit: 0,
        balance: openingBalance,
      });
    }

    // Calculate running balance
    let runningBalance = 0;
    for (const record of records) {
      if (record.type === "opening") {
        runningBalance = record.debit;
        record.balance = runningBalance;
      } else {
        runningBalance += record.debit - record.credit;
        record.balance = runningBalance;
      }
    }

    setTransactions(records);
    setLoading(false);
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("ar-EG", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const handleDoubleClick = (record: TransactionRecord) => {
    if (record.type === "sale") {
      addTab(`/invoices`);
    } else if (record.type === "return") {
      addTab(`/sales-returns`);
    } else if (record.type === "collection") {
      addTab(`/collections`);
    }
  };

  const totalDebit = transactions.reduce((s, t) => s + t.debit, 0);
  const totalCredit = transactions.reduce((s, t) => s + t.credit, 0);
  const finalBalance = totalDebit - totalCredit;

  return (
    <div className="h-full flex flex-col bg-background" dir="rtl">
      <POSHeader />
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Customer Info */}
        {customer && (
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-primary/10">
                <Users className="h-8 w-8 text-primary" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold">{customer.name}</h2>
                <div className="flex gap-3 text-sm text-muted-foreground">
                  {customer.phone && <span>{customer.phone}</span>}
                  {customer.address && <span>{customer.address}</span>}
                </div>
              </div>
              <div className="text-left">
                <div className="text-sm text-muted-foreground">الرصيد الحالي</div>
                <div className={`text-2xl font-bold ${customer.currentBalance > 0 ? "text-red-600" : "text-green-600"}`}>
                  {Math.round(customer.currentBalance)} {currency}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-xl font-bold text-red-600">{Math.round(totalDebit)} {currency}</div>
              <div className="text-xs text-muted-foreground">مدين (عليه)</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-xl font-bold text-green-600">{Math.round(totalCredit)} {currency}</div>
              <div className="text-xs text-muted-foreground">دائن (له)</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className={`text-xl font-bold ${finalBalance > 0 ? "text-red-600" : "text-green-600"}`}>
                {Math.round(finalBalance)} {currency}
              </div>
              <div className="text-xs text-muted-foreground">الرصيد</div>
            </CardContent>
          </Card>
        </div>

        {/* Transactions Table */}
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">لا توجد حركات لهذا العميل</div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="border-b">
                  <th className="text-center p-3 w-28">التاريخ</th>
                  <th className="text-right p-3">البيان</th>
                  <th className="text-center p-3 w-20">النوع</th>
                  <th className="text-center p-3 w-24">مدين</th>
                  <th className="text-center p-3 w-24">دائن</th>
                  <th className="text-center p-3 w-24">الرصيد</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t, idx) => (
                  <>
                    <tr
                      key={t.id}
                      className={`border-b cursor-pointer hover:bg-muted/30 ${idx % 2 === 0 ? "bg-muted/10" : ""}`}
                      onClick={() => {
                        if (t.items && t.items.length > 0) {
                          setExpandedRow(expandedRow === t.id ? null : t.id);
                        }
                      }}
                      onDoubleClick={() => handleDoubleClick(t)}
                    >
                      <td className="text-center p-3 text-xs">{formatDate(t.date)}</td>
                      <td className="p-3 font-medium">{t.description}</td>
                      <td className="text-center p-3">
                        <Badge
                          variant={t.type === "sale" ? "default" : t.type === "return" ? "destructive" : t.type === "collection" ? "secondary" : "outline"}
                          className="text-[10px]"
                        >
                          {t.type === "sale" ? "بيع" : t.type === "return" ? "مرتجع" : t.type === "collection" ? "قبض" : "افتتاحي"}
                        </Badge>
                      </td>
                      <td className="text-center p-3 text-red-600 font-bold">
                        {t.debit > 0 ? Math.round(t.debit) : "-"}
                      </td>
                      <td className="text-center p-3 text-green-600 font-bold">
                        {t.credit > 0 ? Math.round(t.credit) : "-"}
                      </td>
                      <td className={`text-center p-3 font-bold ${t.balance > 0 ? "text-red-600" : "text-green-600"}`}>
                        {Math.round(t.balance)}
                      </td>
                      <td className="p-1">
                        {t.items && t.items.length > 0 && (
                          expandedRow === t.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                        )}
                      </td>
                    </tr>
                    {/* Expanded Item Details */}
                    {expandedRow === t.id && t.items && t.items.length > 0 && (
                      <tr key={`${t.id}-details`}>
                        <td colSpan={7} className="bg-muted/20 p-0">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b bg-muted/30">
                                <th className="text-right p-2 pr-8">الصنف</th>
                                <th className="text-center p-2">الكمية</th>
                                <th className="text-center p-2">السعر</th>
                                <th className="text-center p-2">الإجمالي</th>
                                <th></th>
                                <th></th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {t.items.map((item, i) => (
                                <tr key={i} className="border-b">
                                  <td className="p-2 pr-8">{item.productName}</td>
                                  <td className="text-center p-2">{item.quantity}</td>
                                  <td className="text-center p-2">{Math.round(item.price)} {currency}</td>
                                  <td className="text-center p-2 font-bold">{Math.round(item.total)} {currency}</td>
                                  <td></td>
                                  <td></td>
                                  <td></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerStatement;
