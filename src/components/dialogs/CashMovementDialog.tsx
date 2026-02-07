import React, { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { addCashMovement } from "@/lib/cashMovementService";
import { ArrowDown, ArrowUp } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shiftId: number;
  type: "in" | "out";
  onSuccess?: () => void;
}

const CATEGORIES_IN = [
  "تغذية الصندوق",
  "استلام من فرع آخر",
  "إيداع نقدي",
  "أخرى",
];

const CATEGORIES_OUT = [
  "تسليم بنك",
  "مصروف طارئ",
  "تحويل لفرع آخر",
  "سلفة موظف",
  "أخرى",
];

export function CashMovementDialog({
  open,
  onOpenChange,
  shiftId,
  type,
  onSuccess,
}: Props) {
  const { user } = useAuth();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const categories = type === "in" ? CATEGORIES_IN : CATEGORIES_OUT;
  const title = type === "in" ? "إيداع نقدية" : "سحب نقدية";
  const Icon = type === "in" ? ArrowDown : ArrowUp;
  const color = type === "in" ? "text-green-600" : "text-red-600";

  const handleSubmit = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("يرجى إدخال مبلغ صحيح");
      return;
    }

    if (!reason.trim()) {
      toast.error("يرجى إدخال سبب الحركة");
      return;
    }

    if (!user) {
      toast.error("يجب تسجيل الدخول");
      return;
    }

    setLoading(true);
    try {
      await addCashMovement(
        {
          shiftId,
          type,
          amount: parseFloat(amount),
          reason: reason.trim(),
          category: category || undefined,
          notes: notes.trim() || undefined,
        },
        {
          userId: user.id,
          userName: user.fullName || user.username,
        }
      );

      toast.success(`تم ${type === "in" ? "الإيداع" : "السحب"} بنجاح`);
      onOpenChange(false);
      resetForm();
      onSuccess?.();
    } catch (error: any) {
      console.error("Cash movement failed:", error);
      toast.error(error.message || "حدث خطأ أثناء العملية");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setAmount("");
    setReason("");
    setCategory("");
    setNotes("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) resetForm();
      }}
    >
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className={`h-5 w-5 ${color}`} />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="amount">المبلغ *</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-2"
              autoFocus
            />
          </div>

          <div>
            <Label htmlFor="category">التصنيف</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="اختر التصنيف" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="reason">السبب *</Label>
            <Input
              id="reason"
              placeholder="مثال: تسليم بنك الأهلي"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-2"
            />
          </div>

          <div>
            <Label htmlFor="notes">ملاحظات</Label>
            <Textarea
              id="notes"
              placeholder="ملاحظات إضافية (اختياري)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-2 resize-none"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            إلغاء
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "جاري الحفظ..." : "تأكيد"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
