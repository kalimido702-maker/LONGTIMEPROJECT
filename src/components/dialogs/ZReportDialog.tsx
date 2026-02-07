import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { db, Shift } from "@/shared/lib/indexedDB";
import { getShiftCashSummary } from "@/lib/cashMovementService";
import { Printer, AlertCircle, DollarSign } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shiftId: string; // Changed to string to match database schema
  onConfirm: (actualCash: number, denominations: Denominations) => void;
}

interface Denominations {
  notes200: number;
  notes100: number;
  notes50: number;
  notes20: number;
  notes10: number;
  notes5: number;
  coins1: number;
}

const DENOMINATION_VALUES = {
  notes200: 200,
  notes100: 100,
  notes50: 50,
  notes20: 20,
  notes10: 10,
  notes5: 5,
  coins1: 1,
};

export function ZReportDialog({
  open,
  onOpenChange,
  shiftId,
  onConfirm,
}: Props) {
  const [shift, setShift] = useState<Shift | null>(null);
  const [cashSummary, setCashSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actualCashInput, setActualCashInput] = useState<string>("");

  useEffect(() => {
    if (open) {
      loadReport();
      setActualCashInput("");
    }
  }, [open, shiftId]);

  const loadReport = async () => {
    setLoading(true);
    try {
      // جلب بيانات الوردية الأساسية - استخدام shiftId كـ string مباشرة
      const shiftData = await db.get<Shift>("shifts", shiftId);
      if (!shiftData) {
        console.error("[ZReportDialog] Shift not found:", shiftId);
        toast.error("الوردية غير موجودة");
        setLoading(false);
        return;
      }

      console.log("[ZReportDialog] Shift loaded:", shiftData);

      // استخدام الدوال الموحدة من calculationService
      const { calculateShiftSales, calculateExpectedCash } = await import(
        "@/lib/calculationService"
      );

      const sales = await calculateShiftSales(shiftId);
      const cashSummary = await calculateExpectedCash(shiftId);

      // تحديث الحالة
      setShift({
        ...shiftData,
        sales: {
          totalInvoices: sales.totalInvoices,
          totalAmount: sales.totalSales,
          cashSales: sales.cashSales,
          cardSales: sales.cardSales,
          walletSales: sales.walletSales,
          returns: sales.returns,
        },
      });

      setCashSummary({
        cashIn: cashSummary.cashIn,
        cashOut: cashSummary.cashOut,
        expenses: cashSummary.expenses,
        expectedCash: cashSummary.expectedCash,
        expensesList: cashSummary.expensesList,
        paymentMethodSales: sales.paymentMethodBreakdown,
      });
    } catch (error) {
      console.error("Error loading Z report:", error);
      toast.error("فشل تحميل تقرير Z");
    } finally {
      setLoading(false);
    }
  };

  const actualCash = parseFloat(actualCashInput) || 0;
  const difference = actualCash - (cashSummary?.expectedCash || 0);

  const handleConfirm = () => {
    if (actualCash === 0) {
      toast.error("يرجى إدخال المبلغ الفعلي في الدرج");
      return;
    }
    onConfirm(actualCash, {
      notes200: 0,
      notes100: 0,
      notes50: 0,
      notes20: 0,
      notes10: 0,
      notes5: 0,
      coins1: 0,
    });
    onOpenChange(false);
  };

  const handlePrint = () => {
    window.print();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("ar-EG", {
      style: "currency",
      currency: "EGP",
    }).format(amount);
  };

  const formatDateTime = (date: string) => {
    return new Intl.DateTimeFormat("ar-EG", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(date));
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          dir="rtl"
          className="max-w-3xl max-h-[90vh] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>تقرير Z - إغلاق الوردية</DialogTitle>
          </DialogHeader>
          <div className="text-center py-8">جاري التحميل...</div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir="rtl"
        className="max-w-xl max-h-[85vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <DollarSign className="h-6 w-6" />
            تقرير Z - إغلاق الوردية
          </DialogTitle>
        </DialogHeader>

        {shift && cashSummary && (
          <div className="space-y-4">
            {/* معلومات الوردية */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">معلومات الوردية</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">المسؤول</p>
                  <p className="font-bold">{shift.employeeName}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">وقت البدء</p>
                  <p className="font-bold">{formatDateTime(shift.startTime)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    الرصيد الافتتاحي
                  </p>
                  <p className="font-bold text-primary">
                    {formatCurrency(shift.startingCash)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">الحالة</p>
                  <Badge
                    variant={
                      shift.status === "active" ? "default" : "secondary"
                    }
                  >
                    {shift.status === "active" ? "نشطة" : "مغلقة"}
                  </Badge>
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
                  <span>إجمالي المبيعات:</span>
                  <span className="font-bold text-green-600">
                    {formatCurrency(shift.sales.totalAmount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>عدد الفواتير:</span>
                  <span className="font-bold">{shift.sales.totalInvoices}</span>
                </div>
                <Separator />
                {/* عرض طرق الدفع بشكل ديناميكي */}
                {cashSummary.paymentMethodSales &&
                  Object.entries(cashSummary.paymentMethodSales).map(
                    ([methodId, data]: [string, any]) =>
                      data.amount > 0 && (
                        <div key={methodId} className="flex justify-between">
                          <span>{data.name}:</span>
                          <span className="font-bold">
                            {formatCurrency(data.amount)}
                          </span>
                        </div>
                      )
                  )}
              </CardContent>
            </Card>

            {/* الحركات النقدية */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">الحركات النقدية</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span>إيداعات نقدية:</span>
                  <span className="font-bold text-green-600">
                    +{formatCurrency(cashSummary.cashIn)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>سحوبات نقدية:</span>
                  <span className="font-bold text-red-600">
                    -{formatCurrency(cashSummary.cashOut)}
                  </span>
                </div>
                {/* تسديدات الآجل النقدية */}
                {cashSummary.creditPaymentsCash > 0 && (
                  <div className="flex justify-between">
                    <span>تسديدات آجل نقدية:</span>
                    <span className="font-bold text-green-600">
                      +{formatCurrency(cashSummary.creditPaymentsCash)}
                    </span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between">
                  <span>المصروفات:</span>
                  <span className="font-bold text-red-600">
                    -{formatCurrency(cashSummary.expenses || 0)}
                  </span>
                </div>
                {cashSummary.expensesList &&
                  cashSummary.expensesList.length > 0 && (
                    <div className="mt-2 text-xs text-muted-foreground space-y-1">
                      {cashSummary.expensesList.map(
                        (exp: any, index: number) => (
                          <div key={index} className="flex justify-between">
                            <span>• {exp.description || exp.notes}</span>
                            <span>{formatCurrency(exp.amount)}</span>
                          </div>
                        )
                      )}
                    </div>
                  )}
              </CardContent>
            </Card>

            {/* إدخال النقدية الفعلية */}
            <Card className="border-2 border-primary">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-primary" />
                  النقدية الفعلية في الدرج
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div>
                  <Label>المبلغ الفعلي</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={actualCashInput || ""}
                    onChange={(e) => setActualCashInput(e.target.value)}
                    placeholder="أدخل المبلغ الفعلي في الدرج"
                    className="text-lg font-bold mt-2"
                  />
                </div>
              </CardContent>
            </Card>

            {/* مقارنة النقدية */}
            <Card
              className={difference !== 0 ? "border-2 border-orange-500" : ""}
            >
              <CardHeader>
                <CardTitle className="text-lg">مقارنة النقدية</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-lg">
                  <span>النقدية المتوقعة:</span>
                  <span className="font-bold">
                    {formatCurrency(cashSummary.expectedCash)}
                  </span>
                </div>
                <div className="flex justify-between text-lg">
                  <span>النقدية الفعلية:</span>
                  <span className="font-bold text-primary">
                    {formatCurrency(actualCash)}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between text-xl">
                  <span className="font-bold">الفرق:</span>
                  <span
                    className={`font-bold ${difference > 0
                        ? "text-green-600"
                        : difference < 0
                          ? "text-red-600"
                          : ""
                      }`}
                  >
                    {difference > 0 ? "+" : ""}
                    {formatCurrency(difference)}
                  </span>
                </div>
                {difference !== 0 && (
                  <div className="mt-4 p-3 bg-orange-100 dark:bg-orange-900/20 rounded-lg">
                    <p className="text-sm text-orange-800 dark:text-orange-300 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      {difference > 0
                        ? "هناك زيادة في النقدية. يرجى التحقق من العد."
                        : "هناك نقص في النقدية. يرجى التحقق من العد."}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="ml-2 h-4 w-4" />
            طباعة
          </Button>
          <Button
            onClick={handleConfirm}
            className="bg-red-600 hover:bg-red-700"
          >
            تأكيد إغلاق الوردية
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
