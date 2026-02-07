import { ShoppingCart, Trash2, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { CartItem } from "./CartItem";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSettingsContext } from "@/contexts/SettingsContext";

interface CartProps {
  items: any[];
  priceTypes?: Array<{ id: string; name: string }>;
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onCheckout: () => void;
  onPriceTypeChange?: (itemId: string, priceTypeId: string) => void;
}

export const Cart = ({
  items,
  priceTypes,
  onIncrement,
  onDecrement,
  onRemove,
  onClear,
  onCheckout,
  onPriceTypeChange,
}: CartProps) => {
  const { getSetting } = useSettingsContext();

  // قراءة الإعدادات
  const taxRate = parseFloat(getSetting("taxRate") || "14") / 100;
  const currency = getSetting("currency") || "EGP";

  const subtotal = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  const tax = subtotal * taxRate;
  const total = subtotal + tax;
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <Card className="flex flex-col h-full shadow-lg">
      <div className="p-4 bg-gradient-primary text-primary-foreground">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            <h2 className="text-lg font-bold">عربة التسوق</h2>
          </div>
          <div className="bg-primary-foreground/20 px-3 py-1 rounded-full">
            <span className="font-bold">{itemCount} منتج</span>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1 p-4">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <ShoppingCart className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">العربة فارغة</p>
            <p className="text-sm text-muted-foreground">أضف منتجات للبدء</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <CartItem
                key={item.id}
                {...item}
                priceTypes={priceTypes}
                onIncrement={() => onIncrement(item.id)}
                onDecrement={() => onDecrement(item.id)}
                onRemove={() => onRemove(item.id)}
                onPriceTypeChange={
                  onPriceTypeChange
                    ? (priceTypeId: string) =>
                        onPriceTypeChange(item.id, priceTypeId)
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </ScrollArea>

      {items.length > 0 && (
        <div className="border-t p-4 space-y-4 bg-muted/20">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">المجموع الفرعي:</span>
              <span className="font-semibold">
                {subtotal.toFixed(2)} {currency}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                ضريبة القيمة المضافة ({(taxRate * 100).toFixed(0)}%):
              </span>
              <span className="font-semibold">
                {tax.toFixed(2)} {currency}
              </span>
            </div>
            <Separator />
            <div className="flex justify-between text-lg font-bold">
              <span>الإجمالي:</span>
              <span className="text-primary">
                {total.toFixed(2)} {currency}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Button
              onClick={onCheckout}
              className="w-full bg-gradient-success hover:shadow-primary text-lg h-12"
              size="lg"
            >
              <CreditCard className="h-5 w-5 ml-2" />
              إتمام عملية الشراء
            </Button>

            <Button
              onClick={onClear}
              variant="outline"
              className="w-full"
              size="sm"
            >
              <Trash2 className="h-4 w-4 ml-2" />
              مسح العربة
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
};
