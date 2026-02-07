import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { db, Shift } from "@/shared/lib/indexedDB";
import {
  getCashMovementsSummary,
  getShiftCashSummary,
} from "@/lib/cashMovementService";
import { Printer, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shiftId: number;
}

export function XReportDialog({ open, onOpenChange, shiftId }: Props) {
  const [shift, setShift] = useState<Shift | null>(null);
  const [cashSummary, setCashSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) {
      loadReport();
    }
  }, [open, shiftId]);

  const loadReport = async () => {
    setLoading(true);
    try {
      const shiftData = await db.get<Shift>("shifts", shiftId.toString());
      if (!shiftData) {
        toast.error("الوردية غير موجودة");
        return;
      }

      const cashData = await getShiftCashSummary(shiftId);
      const movementsSummary = await getCashMovementsSummary(shiftId);

      setShift(shiftData);
      setCashSummary({ ...cashData, movements: movementsSummary.movements });
    } catch (error) {
      console.error("Failed to load report:", error);
      toast.error("حدث خطأ أثناء تحميل التقرير");
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
    toast.success("جاري الطباعة...");
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent dir="rtl" className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>تقرير الوردية (X Report)</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!shift || !cashSummary) {
    return null;
  }

  const formatCurrency = (amount: number) => {
    return amount.toFixed(2) + " جنيه";
  };

  const formatDateTime = (date: string) => {
    return new Date(date).toLocaleString("ar-EG", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir="rtl"
        className="max-w-3xl max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle className="text-2xl">
            تقرير الوردية (X Report)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* معلومات الوردية */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">معلومات الوردية</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">رقم الوردية:</span>
                <span className="font-medium">{shift.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">الموظف:</span>
                <span className="font-medium">{shift.employeeName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">وقت البدء:</span>
                <span className="font-medium">
                  {formatDateTime(shift.startTime)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">الحالة:</span>
                <span
                  className={`font-medium ${
                    shift.status === "active"
                      ? "text-green-600"
                      : "text-gray-600"
                  }`}
                >
                  {shift.status === "active" ? "مفتوحة" : "مغلقة"}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* ملخص المبيعات */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">ملخص المبيعات</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">عدد الفواتير:</span>
                <span className="font-medium">{shift.sales.totalInvoices}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">إجمالي المبيعات:</span>
                <span className="font-medium text-lg">
                  {formatCurrency(shift.sales.totalAmount)}
                </span>
              </div>
              <Separator className="my-2" />
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">نقدي:</span>
                <span>{formatCurrency(shift.sales.cashSales)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">بطاقة:</span>
                <span>{formatCurrency(shift.sales.cardSales)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">محفظة:</span>
                <span>{formatCurrency(shift.sales.walletSales)}</span>
              </div>
              <Separator className="my-2" />
              <div className="flex justify-between text-red-600">
                <span>مرتجعات المبيعات:</span>
                <span>-{formatCurrency(shift.sales.returns)}</span>
              </div>
            </CardContent>
          </Card>

          {/* حركات النقدية */}
          {cashSummary.movements.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">حركات النقدية</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-green-600">
                  <span>إجمالي الإيداعات:</span>
                  <span>+{formatCurrency(cashSummary.cashIn)}</span>
                </div>
                <div className="flex justify-between text-red-600">
                  <span>إجمالي السحوبات:</span>
                  <span>-{formatCurrency(cashSummary.cashOut)}</span>
                </div>
                <Separator className="my-2" />
                <div className="space-y-1 text-sm">
                  {cashSummary.movements.map((m: any, i: number) => (
                    <div key={i} className="flex justify-between">
                      <span className="text-gray-600">
                        {m.type === "in" ? "↓" : "↑"} {m.reason}
                      </span>
                      <span
                        className={
                          m.type === "in" ? "text-green-600" : "text-red-600"
                        }
                      >
                        {m.type === "in" ? "+" : "-"}
                        {formatCurrency(m.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* المصروفات */}
          {shift.expenses > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">المصروفات</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between text-red-600">
                  <span>إجمالي المصروفات:</span>
                  <span>-{formatCurrency(shift.expenses)}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* مرتجعات المشتريات */}
          {shift.purchaseReturns > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">مرتجعات المشتريات</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between text-blue-600">
                  <span>إجمالي مرتجعات المشتريات:</span>
                  <span>+{formatCurrency(shift.purchaseReturns)}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* النقدية المتوقعة */}
          <Card className="bg-blue-50 border-blue-200">
            <CardHeader>
              <CardTitle className="text-lg text-blue-900">
                النقدية المتوقعة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-700">رصيد افتتاحي:</span>
                <span>{formatCurrency(shift.startingCash)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-700">مبيعات نقدية:</span>
                <span>+{formatCurrency(cashSummary.salesCash)}</span>
              </div>
              {cashSummary.cashIn > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-700">إيداعات:</span>
                  <span>+{formatCurrency(cashSummary.cashIn)}</span>
                </div>
              )}
              {cashSummary.cashOut > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-700">سحوبات:</span>
                  <span>-{formatCurrency(cashSummary.cashOut)}</span>
                </div>
              )}
              <Separator className="my-2 bg-blue-300" />
              <div className="flex justify-between text-xl font-bold text-blue-900">
                <span>النقدية المتوقعة:</span>
                <span>{formatCurrency(cashSummary.expectedCash)}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إغلاق
          </Button>
          <Button onClick={handlePrint} className="gap-2">
            <Printer className="h-4 w-4" />
            طباعة
          </Button>
          <Button onClick={loadReport} variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            تحديث
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
