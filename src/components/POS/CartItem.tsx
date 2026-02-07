import { Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettingsContext } from "@/contexts/SettingsContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CartItemProps {
  id: string;
  nameAr: string;
  price: number;
  quantity: number;
  unitName?: string;
  prices?: Record<string, number>;
  priceTypeId?: string;
  priceTypes?: Array<{ id: string; name: string }>;
  onIncrement: () => void;
  onDecrement: () => void;
  onRemove: () => void;
  onPriceTypeChange?: (priceTypeId: string) => void;
}

export const CartItem = ({
  nameAr,
  price,
  quantity,
  unitName,
  prices,
  priceTypeId,
  priceTypes,
  onIncrement,
  onDecrement,
  onRemove,
  onPriceTypeChange,
}: CartItemProps) => {
  const total = price * quantity;
  const { getSetting } = useSettingsContext();

  const currency = getSetting("currency") || "EGP";

  return (
    <div className="flex flex-col gap-2 p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm truncate">{nameAr}</h4>
          <p className="text-xs text-muted-foreground">
            {price.toFixed(2)} {currency} × {quantity}
            {unitName && <span className="mr-1">({unitName})</span>}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={onDecrement}
          >
            <Minus className="h-3 w-3" />
          </Button>

          <span className="font-bold text-lg w-8 text-center">{quantity}</span>

          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={onIncrement}
          >
            <Plus className="h-3 w-3" />
          </Button>

          <Button
            variant="destructive"
            size="icon"
            className="h-8 w-8"
            onClick={onRemove}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>

        <div className="font-bold text-primary w-24 text-left">
          {total.toFixed(2)} {currency}
        </div>
      </div>

      {/* Price Type Selection */}
      {prices && priceTypes && priceTypes.length > 0 && onPriceTypeChange && (
        <div className="flex items-center gap-2 pr-2">
          <label className="text-xs text-muted-foreground whitespace-nowrap">
            نوع السعر:
          </label>
          <Select value={priceTypeId} onValueChange={onPriceTypeChange}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="اختر نوع السعر" />
            </SelectTrigger>
            <SelectContent>
              {priceTypes.map((pt) => (
                <SelectItem key={pt.id} value={pt.id} className="text-xs">
                  {pt.name} - {prices[pt.id]?.toFixed(2) || "0.00"} {currency}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
};
