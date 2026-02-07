import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useSettingsContext } from "@/contexts/SettingsContext";

interface ProductCardProps {
  id: string;
  name: string;
  nameAr: string;
  price: number;
  category?: string;
  image?: string;
  stock: number;
  onAddToCart: (product: any) => void;
}

export const ProductCard = ({
  id,
  name,
  nameAr,
  price,
  category,
  image,
  stock,
  onAddToCart,
}: ProductCardProps) => {
  const handleAdd = () => {
    onAddToCart({ id, name, nameAr, price, category, stock });
  };

  const { getSetting } = useSettingsContext();

  const currency = getSetting("currency") || "EGP";

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-all duration-300 group cursor-pointer">
      <div className="relative aspect-square bg-muted overflow-hidden">
        {image ? (
          <img
            src={image}
            alt={nameAr}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-secondary/10">
            <span className="text-4xl font-bold text-primary/20">
              {nameAr[0]}
            </span>
          </div>
        )}
        {stock <= 10 && stock > 0 && (
          <div className="absolute top-2 right-2 bg-warning text-warning-foreground px-2 py-1 rounded-md text-xs font-semibold">
            متبقي {stock}
          </div>
        )}
        {stock === 0 && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <span className="text-white font-bold text-lg">نفذت الكمية</span>
          </div>
        )}
      </div>

      <div className="p-4">
        <div className="mb-2">
          <span className="text-xs text-muted-foreground">{category}</span>
          <h3 className="font-bold text-lg text-foreground truncate">
            {nameAr}
          </h3>
          <p className="text-xs text-muted-foreground truncate">{name}</p>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="text-2xl font-bold text-primary">
            {price.toFixed(2)} <span className="text-sm">{currency}</span>
          </div>
          <Button
            onClick={handleAdd}
            disabled={stock === 0}
            size="sm"
            className="gap-2 bg-gradient-success hover:shadow-primary"
          >
            <Plus className="h-4 w-4" />
            <span>إضافة</span>
          </Button>
        </div>
      </div>
    </Card>
  );
};
