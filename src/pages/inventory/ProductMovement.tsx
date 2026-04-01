import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { POSHeader } from "@/components/POS/POSHeader";
import { db, Product, Invoice, SalesReturn } from "@/shared/lib/indexedDB";
import { useSettingsContext } from "@/contexts/SettingsContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Package, Search, ArrowUpDown } from "lucide-react";

interface CustomerMovement {
  customerId: string;
  customerName: string;
  soldQty: number;
  returnedQty: number;
  netQty: number;
  salesAmount: number;
  returnAmount: number;
  netAmount: number;
  invoices: {
    id: string;
    invoiceNumber: string;
    date: string;
    type: "sale" | "return";
    quantity: number;
    price: number;
    total: number;
  }[];
}

const ProductMovement = () => {
  const [searchParams] = useSearchParams();
  const [productId] = useState(() => searchParams.get("productId") || "");
  const { getSetting } = useSettingsContext();
  const currency = getSetting("currency") || "EGP";

  const [product, setProduct] = useState<Product | null>(null);
  const [movements, setMovements] = useState<CustomerMovement[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (productId) loadData();
  }, [productId]);

  const loadData = async () => {
    setLoading(true);
    await db.init();

    const productData = await db.get<Product>("products", productId);
    setProduct(productData || null);

    const allInvoices = await db.getAll<Invoice>("invoices");
    const allReturns = await db.getAll<SalesReturn>("salesReturns");

    const customerMap = new Map<string, CustomerMovement>();

    // Process invoices (sales)
    for (const inv of allInvoices) {
      for (const item of inv.items) {
        if (item.productId !== productId) continue;
        const custId = inv.customerId || "cash";
        const custName = inv.customerName || "عميل نقدي";

        if (!customerMap.has(custId)) {
          customerMap.set(custId, {
            customerId: custId,
            customerName: custName,
            soldQty: 0,
            returnedQty: 0,
            netQty: 0,
            salesAmount: 0,
            returnAmount: 0,
            netAmount: 0,
            invoices: [],
          });
        }

        const cm = customerMap.get(custId)!;
        cm.soldQty += item.quantity;
        cm.salesAmount += item.total;
        cm.invoices.push({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber || inv.id,
          date: inv.createdAt,
          type: "sale",
          quantity: item.quantity,
          price: item.price,
          total: item.total,
        });
      }
    }

    // Process returns
    for (const ret of allReturns) {
      for (const item of ret.items) {
        if (item.productId !== productId) continue;
        const custId = ret.customerId || "cash";
        const custName = ret.customerName || "عميل نقدي";

        if (!customerMap.has(custId)) {
          customerMap.set(custId, {
            customerId: custId,
            customerName: custName,
            soldQty: 0,
            returnedQty: 0,
            netQty: 0,
            salesAmount: 0,
            returnAmount: 0,
            netAmount: 0,
            invoices: [],
          });
        }

        const cm = customerMap.get(custId)!;
        cm.returnedQty += item.quantity;
        cm.returnAmount += item.total;
        cm.invoices.push({
          id: ret.id,
          invoiceNumber: ret.id,
          date: ret.createdAt,
          type: "return",
          quantity: item.quantity,
          price: item.price,
          total: item.total,
        });
      }
    }

    // Calculate net values and sort invoices
    for (const cm of customerMap.values()) {
      cm.netQty = cm.soldQty - cm.returnedQty;
      cm.netAmount = cm.salesAmount - cm.returnAmount;
      cm.invoices.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }

    const movementsList = Array.from(customerMap.values())
      .sort((a, b) => b.netAmount - a.netAmount);

    setMovements(movementsList);
    setLoading(false);
  };

  const filteredMovements = movements.filter((m) =>
    !searchQuery || m.customerName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalSold = movements.reduce((s, m) => s + m.soldQty, 0);
  const totalReturned = movements.reduce((s, m) => s + m.returnedQty, 0);
  const totalSalesAmount = movements.reduce((s, m) => s + m.salesAmount, 0);
  const totalReturnAmount = movements.reduce((s, m) => s + m.returnAmount, 0);

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

  return (
    <div className="h-full flex flex-col bg-background" dir="rtl">
      <POSHeader />
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Product Info */}
        {product && (
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-primary/10">
                <Package className="h-8 w-8 text-primary" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold">{product.nameAr}</h2>
                <div className="flex gap-3 text-sm text-muted-foreground">
                  {product.barcode && <span>كود: {product.barcode}</span>}
                  <span>المخزون: {product.stock}</span>
                  <span>السعر: {Math.round(product.price)} {currency}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-blue-600">{totalSold}</div>
              <div className="text-xs text-muted-foreground">إجمالي المباع</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-red-600">{totalReturned}</div>
              <div className="text-xs text-muted-foreground">إجمالي المرتجع</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-green-600">{Math.round(totalSalesAmount)} {currency}</div>
              <div className="text-xs text-muted-foreground">إجمالي المبيعات</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-primary">{Math.round(totalSalesAmount - totalReturnAmount)} {currency}</div>
              <div className="text-xs text-muted-foreground">صافي المبيعات</div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث عن عميل..."
            className="pr-10"
          />
        </div>

        {/* Movements Table */}
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>
        ) : filteredMovements.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">لا توجد حركات لهذا المنتج</div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="border-b">
                  <th className="text-right p-3">العميل</th>
                  <th className="text-center p-3">الكمية المباعة</th>
                  <th className="text-center p-3">الكمية المرتجعة</th>
                  <th className="text-center p-3">صافي الكمية</th>
                  <th className="text-center p-3">مبلغ المبيعات</th>
                  <th className="text-center p-3">مبلغ المرتجعات</th>
                  <th className="text-center p-3">الصافي</th>
                </tr>
              </thead>
              <tbody>
                {filteredMovements.map((cm, idx) => (
                  <>
                    <tr
                      key={cm.customerId}
                      className={`border-b cursor-pointer hover:bg-muted/30 ${idx % 2 === 0 ? "bg-muted/10" : ""}`}
                      onClick={() => setExpandedCustomer(expandedCustomer === cm.customerId ? null : cm.customerId)}
                    >
                      <td className="p-3 font-bold">
                        <div className="flex items-center gap-2">
                          <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
                          {cm.customerName}
                        </div>
                      </td>
                      <td className="text-center p-3">{cm.soldQty}</td>
                      <td className="text-center p-3 text-red-600">{cm.returnedQty}</td>
                      <td className="text-center p-3 font-bold">{cm.netQty}</td>
                      <td className="text-center p-3">{Math.round(cm.salesAmount)} {currency}</td>
                      <td className="text-center p-3 text-red-600">{Math.round(cm.returnAmount)} {currency}</td>
                      <td className="text-center p-3 font-bold text-primary">{Math.round(cm.netAmount)} {currency}</td>
                    </tr>
                    {/* Expanded Invoice Details */}
                    {expandedCustomer === cm.customerId && (
                      <tr key={`${cm.customerId}-details`}>
                        <td colSpan={7} className="bg-muted/20 p-0">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b bg-muted/30">
                                <th className="text-right p-2 pr-8">رقم الفاتورة</th>
                                <th className="text-center p-2">التاريخ</th>
                                <th className="text-center p-2">النوع</th>
                                <th className="text-center p-2">الكمية</th>
                                <th className="text-center p-2">السعر</th>
                                <th className="text-center p-2">الإجمالي</th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {cm.invoices.map((inv) => (
                                <tr key={inv.id} className="border-b">
                                  <td className="p-2 pr-8">{inv.invoiceNumber}</td>
                                  <td className="text-center p-2">{formatDate(inv.date)}</td>
                                  <td className="text-center p-2">
                                    <Badge variant={inv.type === "sale" ? "default" : "destructive"} className="text-[10px]">
                                      {inv.type === "sale" ? "بيع" : "مرتجع"}
                                    </Badge>
                                  </td>
                                  <td className="text-center p-2">{inv.quantity}</td>
                                  <td className="text-center p-2">{Math.round(inv.price)} {currency}</td>
                                  <td className="text-center p-2 font-bold">{Math.round(inv.total)} {currency}</td>
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

export default ProductMovement;
