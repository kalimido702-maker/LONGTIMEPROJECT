import { useState, useEffect } from "react";
import { POSHeader } from "@/components/POS/POSHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Search,
  FileText,
  Trash2,
  ShoppingCart,
  Printer,
  Eye,
  Calendar,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSettingsContext } from "@/contexts/SettingsContext";
import { useToast } from "@/hooks/use-toast";
import { useTabs } from "@/contexts/TabContext";

// Quote interface
export interface SavedQuote {
  id: string;
  quoteNumber: string;
  customerId: string;
  customerName: string;
  items: QuoteItem[];
  subtotal: number;
  discount: number;
  discountPercent: string;
  discountAmount: string;
  tax: number;
  total: number;
  createdAt: string;
  notes?: string;
  selectedPriceTypeId?: string;
  selectedWarehouseId?: string;
}

export interface QuoteItem {
  id: string;
  name: string;
  nameAr: string;
  price: number;
  quantity: number;
  customPrice?: number;
  priceTypeId?: string;
  priceTypeName?: string;
  unitId?: string;
  unitName?: string;
  productUnitId?: string;
  conversionFactor?: number;
  selectedUnitName?: string;
  stock: number;
  prices?: Record<string, number>;
}

const QUOTES_STORAGE_KEY = "pos-saved-quotes";

export function getQuotesFromStorage(): SavedQuote[] {
  try {
    const raw = localStorage.getItem(QUOTES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveQuoteToStorage(quote: SavedQuote): void {
  const quotes = getQuotesFromStorage();
  quotes.unshift(quote);
  localStorage.setItem(QUOTES_STORAGE_KEY, JSON.stringify(quotes));
}

export function deleteQuoteFromStorage(quoteId: string): void {
  const quotes = getQuotesFromStorage().filter((q) => q.id !== quoteId);
  localStorage.setItem(QUOTES_STORAGE_KEY, JSON.stringify(quotes));
}

export default function Quotes() {
  const { getSetting } = useSettingsContext();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { addTab } = useTabs();
  const currency = getSetting("currency") || "EGP";

  const [quotes, setQuotes] = useState<SavedQuote[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedQuote, setSelectedQuote] = useState<SavedQuote | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [quoteToDelete, setQuoteToDelete] = useState<string | null>(null);

  useEffect(() => {
    loadQuotes();
  }, []);

  const loadQuotes = () => {
    setQuotes(getQuotesFromStorage());
  };

  const formatCurrency = (amount: number) => {
    return Math.round(amount).toLocaleString("ar-EG");
  };

  // Filter quotes
  const filteredQuotes = quotes.filter((q) => {
    const matchSearch =
      !searchQuery ||
      q.quoteNumber.includes(searchQuery) ||
      q.customerName?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchDateFrom =
      !dateFrom || new Date(q.createdAt) >= new Date(dateFrom);
    const matchDateTo =
      !dateTo ||
      new Date(q.createdAt) <= new Date(dateTo + "T23:59:59");

    return matchSearch && matchDateFrom && matchDateTo;
  });

  // Create invoice from quote
  const handleCreateInvoice = (quote: SavedQuote) => {
    // Store quote data in sessionStorage for POS to pick up
    sessionStorage.setItem("pos-quote-data", JSON.stringify(quote));
    // Navigate to POS
    addTab("/pos");
    navigate("/pos?fromQuote=true");
  };

  // Print quote again
  const handlePrintQuote = async (quote: SavedQuote) => {
    try {
      const { generateInvoiceHTML } = await import(
        "@/services/invoicePdfService"
      );

      const items = quote.items.map((item) => ({
        productName: item.nameAr || item.name || "",
        productCode: "",
        quantity: item.quantity,
        price: item.customPrice || item.price,
        total: (item.customPrice || item.price) * item.quantity,
        unitsPerCarton: undefined,
      }));

      const pdfData = {
        id: quote.quoteNumber,
        invoiceNumber: quote.quoteNumber,
        date: new Date(quote.createdAt).toLocaleDateString("ar-EG"),
        customerName: quote.customerName || "عميل",
        customerAddress: "",
        items: items,
        total: quote.total,
        discount: quote.discount > 0 ? quote.discount : undefined,
        isReturn: false,
        isQuote: true,
      };

      let html = await generateInvoiceHTML(pdfData as any);
      html = html.replace("فاتورة إلى:", "عرض سعر إلى:");
      html = html.replace("فاتورة بيع", "عرض سعر");
      html = html.replace(/الرصيد الحالي/g, "");

      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.onload = () => {
          printWindow.print();
        };
      }
    } catch (error) {
      console.error("Error printing quote:", error);
      toast({
        title: "حدث خطأ أثناء طباعة عرض السعر",
        variant: "destructive",
      });
    }
  };

  // Delete quote
  const handleDeleteQuote = (quoteId: string) => {
    setQuoteToDelete(quoteId);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (quoteToDelete) {
      deleteQuoteFromStorage(quoteToDelete);
      loadQuotes();
      toast({ title: "تم حذف عرض السعر" });
      setDeleteConfirmOpen(false);
      setQuoteToDelete(null);
    }
  };

  return (
    <div className="h-full flex flex-col" dir="rtl">
      <POSHeader />

      <div className="flex-1 p-4 overflow-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" />
            سجل عروض الأسعار
          </h1>
          <Badge variant="secondary" className="text-lg px-4 py-1">
            {filteredQuotes.length} عرض سعر
          </Badge>
        </div>

        {/* Filters */}
        <Card className="p-4">
          <div className="flex gap-3 flex-wrap items-end">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="بحث برقم العرض أو اسم العميل..."
                  className="pr-10"
                />
              </div>
            </div>
            <div className="flex gap-2 items-center">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-40"
              />
              <span className="text-muted-foreground">إلى</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-40"
              />
            </div>
          </div>
        </Card>

        {/* Quotes Table */}
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">رقم العرض</TableHead>
                <TableHead className="text-right">العميل</TableHead>
                <TableHead className="text-right">التاريخ</TableHead>
                <TableHead className="text-right">عدد المنتجات</TableHead>
                <TableHead className="text-right">الإجمالي</TableHead>
                <TableHead className="text-right">الخصم</TableHead>
                <TableHead className="text-right">الصافي</TableHead>
                <TableHead className="text-center">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredQuotes.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-muted-foreground py-8"
                  >
                    لا توجد عروض أسعار
                  </TableCell>
                </TableRow>
              ) : (
                filteredQuotes.map((quote) => {
                  const itemsCount = quote.items.reduce(
                    (sum, i) => sum + i.quantity,
                    0
                  );
                  return (
                    <TableRow key={quote.id}>
                      <TableCell className="font-medium">
                        {quote.quoteNumber}
                      </TableCell>
                      <TableCell>{quote.customerName || "عميل"}</TableCell>
                      <TableCell>
                        {new Date(quote.createdAt).toLocaleDateString("ar-EG")}
                      </TableCell>
                      <TableCell>{itemsCount}</TableCell>
                      <TableCell>
                        {formatCurrency(quote.subtotal)}
                      </TableCell>
                      <TableCell>
                        {quote.discount > 0 ? (
                          <span className="text-red-600">
                            -{formatCurrency(quote.discount)}
                          </span>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell className="font-bold">
                        {formatCurrency(quote.total)}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-center">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedQuote(quote);
                              setIsDetailsOpen(true);
                            }}
                            title="عرض التفاصيل"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handlePrintQuote(quote)}
                            title="طباعة"
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleCreateInvoice(quote)}
                            title="إنشاء فاتورة"
                          >
                            <ShoppingCart className="h-4 w-4 ml-1" />
                            فاتورة
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDeleteQuote(quote.id)}
                            title="حذف"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* Quote Details Dialog */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent dir="rtl" className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              تفاصيل عرض السعر #{selectedQuote?.quoteNumber}
            </DialogTitle>
          </DialogHeader>

          {selectedQuote && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">العميل:</span>{" "}
                  <span className="font-medium">
                    {selectedQuote.customerName || "عميل"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">التاريخ:</span>{" "}
                  <span className="font-medium">
                    {new Date(selectedQuote.createdAt).toLocaleDateString(
                      "ar-EG"
                    )}
                  </span>
                </div>
              </div>

              {/* Items */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">المنتج</TableHead>
                    <TableHead className="text-center">الكمية</TableHead>
                    <TableHead className="text-right">السعر</TableHead>
                    <TableHead className="text-right">الإجمالي</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedQuote.items.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>{item.nameAr || item.name}</TableCell>
                      <TableCell className="text-center">
                        {item.quantity}
                      </TableCell>
                      <TableCell>
                        {formatCurrency(item.customPrice || item.price)}
                      </TableCell>
                      <TableCell>
                        {formatCurrency(
                          item.quantity * (item.customPrice || item.price)
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Totals */}
              <div className="bg-muted p-3 rounded space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>المجموع:</span>
                  <span className="font-bold">
                    {formatCurrency(selectedQuote.subtotal)}
                  </span>
                </div>
                {selectedQuote.discount > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>الخصم:</span>
                    <span>-{formatCurrency(selectedQuote.discount)}</span>
                  </div>
                )}
                {selectedQuote.tax > 0 && (
                  <div className="flex justify-between text-blue-600">
                    <span>الضريبة:</span>
                    <span>+{formatCurrency(selectedQuote.tax)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>الإجمالي:</span>
                  <span>{formatCurrency(selectedQuote.total)}</span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>
              إغلاق
            </Button>
            <Button
              variant="outline"
              onClick={() => selectedQuote && handlePrintQuote(selectedQuote)}
            >
              <Printer className="h-4 w-4 ml-2" />
              طباعة
            </Button>
            <Button
              onClick={() => {
                if (selectedQuote) {
                  handleCreateInvoice(selectedQuote);
                  setIsDetailsOpen(false);
                }
              }}
            >
              <ShoppingCart className="h-4 w-4 ml-2" />
              إنشاء فاتورة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تأكيد الحذف</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            هل أنت متأكد من حذف عرض السعر؟ لا يمكن التراجع عن هذا الإجراء.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
            >
              إلغاء
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              حذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
