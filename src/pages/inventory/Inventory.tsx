import { useState, useEffect, useRef } from "react";
import { POSHeader } from "@/components/POS/POSHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Package,
  Download,
  Upload,
  Calculator,
  Image as ImageIcon,
  X,
  Barcode,
  Printer,
  Landmark,
} from "lucide-react";
import {
  db,
  Product,
  Shift,
  ProductCategory,
  Unit,
  PriceType,
  ProductUnit,
  Warehouse,
  ProductStock,
} from "@/shared/lib/indexedDB";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  createWithAudit,
  updateWithAudit,
  deleteWithAudit,
} from "@/lib/transactionService";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useSettingsContext } from "@/contexts/SettingsContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { printBarcodeLabels, type BarcodeLabelData } from "@/lib/printing";
import { usePagination } from "@/hooks/usePagination";
import { DataPagination } from "@/components/ui/DataPagination";

const Inventory = () => {
  const { can, user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [priceTypes, setPriceTypes] = useState<PriceType[]>([]);
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inventoryDialogOpen, setInventoryDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // State لطباعة الباركود
  const [barcodePrintDialogOpen, setBarcodePrintDialogOpen] = useState(false);
  const [barcodeSelection, setBarcodeSelection] = useState<Record<string, { selected: boolean; quantity: number }>>({});
  const [showPriceOnBarcode, setShowPriceOnBarcode] = useState(true);

  // State للوحدات المتعددة
  const [productUnits, setProductUnits] = useState<any[]>([]);

  // State للمخازن
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [productStocks, setProductStocks] = useState<Record<string, { quantity: number; minStock: number }>>({});
  const [showUnitsDialog, setShowUnitsDialog] = useState(false);
  const [editingUnit, setEditingUnit] = useState<any | null>(null);
  const [unitFormData, setUnitFormData] = useState({
    unitId: "",
    conversionFactor: 1,
    prices: {} as Record<string, number>,
    costPrice: 0,
    barcode: "",
  });

  const [formData, setFormData] = useState({
    name: "",
    nameAr: "",
    price: 0,
    prices: {} as Record<string, number>,
    costPrice: 0,
    unitId: "",
    defaultPriceTypeId: "",
    category: "",
    categoryId: "",
    stock: 0,
    barcode: "",
    minStock: 10,
    expiryDate: "",
    imageUrl: "",
    hasMultipleUnits: false,
    unitsPerCarton: undefined as number | undefined,
  });

  const { getSetting } = useSettingsContext();

  const currency = getSetting("currency") || "EGP";

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    await db.init();
    const productsData = await db.getAll<Product>("products");

    const categoriesData = await db.getAll<ProductCategory>(
      "productCategories"
    );
    const activeCategories = categoriesData.filter((c) => c.active);
    setCategories(activeCategories);

    // Resolve category IDs to names for products that have numeric category values
    const resolvedProducts = productsData.map((p) => {
      if (p.category && /^\d+$/.test(String(p.category))) {
        const matchedCat = categoriesData.find(
          (c) => String(c.id) === String(p.category)
        );
        if (matchedCat) {
          return {
            ...p,
            category: matchedCat.nameAr || matchedCat.name || p.category,
            categoryId: String(p.category),
          };
        }
      }
      return p;
    });
    setProducts(resolvedProducts);

    const unitsData = await db.getAll<Unit>("units");
    setUnits(unitsData);

    const priceTypesData = await db.getAll<PriceType>("priceTypes");
    const sortedPriceTypes = priceTypesData.sort(
      (a, b) => a.displayOrder - b.displayOrder
    );
    setPriceTypes(sortedPriceTypes);

    const shiftsData = await db.getAll<Shift>("shifts");
    const activeShift = shiftsData.find((s) => s.status === "active");
    setCurrentShift(activeShift || null);

    // Load warehouses
    const warehousesData = await db.getAll<Warehouse>("warehouses");
    const activeWarehouses = warehousesData.filter((w: any) => w.active !== false && !w.is_deleted);
    setWarehouses(activeWarehouses);
  };

  // توليد باركود EAN-13
  const generateBarcode = () => {
    // بادئة: 200 للمنتجات الداخلية
    const prefix = "200";
    // رقم عشوائي 9 أرقام
    const randomPart = Math.floor(Math.random() * 1000000000).toString().padStart(9, "0");
    const barcodeWithoutCheck = prefix + randomPart;

    // حساب رقم التحقق (Check Digit) لـ EAN-13
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const digit = parseInt(barcodeWithoutCheck[i]);
      sum += digit * (i % 2 === 0 ? 1 : 3);
    }
    const checkDigit = (10 - (sum % 10)) % 10;

    const fullBarcode = barcodeWithoutCheck + checkDigit;
    setFormData({ ...formData, barcode: fullBarcode });

    toast({
      title: "✅ تم توليد الباركود",
      description: `باركود EAN-13: ${fullBarcode}`,
    });
  };


  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        toast({
          title: "خطأ",
          description: "حجم الصورة يجب أن يكون أقل من 2 ميجابايت",
          variant: "destructive",
        });
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setImagePreview(base64String);
        setFormData({ ...formData, imageUrl: base64String });
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setImagePreview("");
    setFormData({ ...formData, imageUrl: "" });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!formData.unitId) {
      toast({
        title: "خطأ",
        description: "يرجى اختيار وحدة القياس",
        variant: "destructive",
      });
      return;
    }

    if (Object.keys(formData.prices).length === 0) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال سعر واحد على الأقل",
        variant: "destructive",
      });
      return;
    }

    if (formData.costPrice === 0) {
      toast({
        title: "تحذير",
        description: "لم تقم بإدخال سعر التكلفة. هل تريد المتابعة؟",
      });
    }

    try {
      // Get the category name from the selected category ID
      const selectedCategory = categories.find(c => String(c.id) === formData.categoryId);
      const categoryName = selectedCategory?.nameAr || formData.category;

      const product: Product = {
        id: editingProduct?.id || Date.now().toString(),
        ...formData,
        // CRITICAL: Always store the category NAME, not ID
        category: categoryName,
        // Also store the ID for backend compatibility
        categoryId: formData.categoryId,
        category_id: formData.categoryId ? Number(formData.categoryId) : null
      } as any;

      if (editingProduct) {
        await updateWithAudit("products", editingProduct.id, product, {
          userId: user.id,
          userName: user.username,
          shiftId: currentShift?.id,
        });

        // حفظ مخزون المخازن
        await saveProductStocks(editingProduct.id);

        toast({ title: "✅ تم تحديث المنتج بنجاح" });
      } else {
        await createWithAudit("products", product, {
          userId: user.id,
          userName: user.username,
          shiftId: currentShift?.id,
        });

        // حفظ مخزون المخازن للمنتج الجديد
        await saveProductStocks(product.id);

        toast({ title: "✅ تم إضافة المنتج بنجاح" });
      }

      loadData();
      resetForm();
    } catch (error) {
      toast({ title: "حدث خطأ", variant: "destructive" });
    }
  };

  const handleEdit = async (product: Product) => {
    setEditingProduct(product);

    // Find category by name first (since we store name), or by ID as fallback
    const productCategoryId = String(product.categoryId || (product as any).category_id || "");
    const productCategoryName = product.category || "";

    // Try to find matching category - prioritize by name, then by ID
    let matchedCategory = categories.find(c => c.nameAr === productCategoryName || c.name === productCategoryName);
    if (!matchedCategory && productCategoryId) {
      matchedCategory = categories.find(c => String(c.id) === productCategoryId);
    }

    setFormData({
      name: product.name,
      nameAr: product.nameAr,
      price: product.price,
      prices: product.prices || {},
      costPrice: product.costPrice || 0,
      unitId: product.unitId || "",
      defaultPriceTypeId: product.defaultPriceTypeId || "",
      category: matchedCategory?.nameAr || productCategoryName, // Always use the name
      categoryId: matchedCategory ? String(matchedCategory.id) : productCategoryId,
      stock: product.stock,
      barcode: product.barcode || "",
      minStock: product.minStock || 10,
      expiryDate: product.expiryDate || "",
      imageUrl: product.imageUrl || "",
      hasMultipleUnits: product.hasMultipleUnits || false,
      unitsPerCarton: product.unitsPerCarton,
    });
    if (product.imageUrl) {
      setImagePreview(product.imageUrl);
    }

    // تحميل وحدات المنتج
    await loadProductUnits(product.id);

    // تحميل مخزون المنتج في المخازن
    await loadProductStocks(product.id);

    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    if (confirm("هل أنت متأكد من حذف هذا المنتج؟")) {
      await deleteWithAudit("products", id, {
        userId: user.id,
        userName: user.username,
        shiftId: currentShift?.id,
      });
      toast({ title: "✅ تم حذف المنتج بنجاح" });
      loadData();
    }
  };

  const resetForm = () => {
    const defaultUnit = units.find((u) => u.isDefault);
    setFormData({
      name: "",
      nameAr: "",
      price: 0,
      prices: {},
      costPrice: 0,
      unitId: defaultUnit?.id || "",
      defaultPriceTypeId: "",
      category: "",
      categoryId: "", // Add missing field
      stock: 0,
      barcode: "",
      minStock: 10,
      expiryDate: "",
      imageUrl: "",
      hasMultipleUnits: false,
      unitsPerCarton: undefined,
    });
    setEditingProduct(null);
    setImagePreview("");
    setProductStocks({});
    setDialogOpen(false);
  };

  // ============ دوال إدارة الوحدات المتعددة ============

  const loadProductUnits = async (productId: string) => {
    const allUnits = await db.getAll<ProductUnit>("productUnits");
    const filtered = allUnits.filter((u) => u.productId === productId);
    setProductUnits(filtered);
  };

  // ============ دوال إدارة مخزون المخازن ============

  const loadProductStocks = async (productId: string) => {
    const allStocks = await db.getAll<ProductStock>("productStock");
    const filtered = allStocks.filter((s: any) => s.productId === productId || s.product_id === productId);

    // Convert to record format
    const stocksRecord: Record<string, { quantity: number; minStock: number }> = {};
    filtered.forEach((stock: any) => {
      const warehouseId = stock.warehouseId || stock.warehouse_id;
      stocksRecord[warehouseId] = {
        quantity: stock.quantity || 0,
        minStock: stock.minStock || stock.min_quantity || 0,
      };
    });
    setProductStocks(stocksRecord);
  };

  const saveProductStocks = async (productId: string) => {
    if (!user) return;

    // Get existing stocks for this product
    const allStocks = await db.getAll<ProductStock>("productStock");
    const existingStocks = allStocks.filter((s: any) =>
      (s.productId === productId || s.product_id === productId)
    );

    // For each warehouse with stock, update or create
    for (const [warehouseId, stockData] of Object.entries(productStocks)) {
      if (stockData.quantity > 0 || existingStocks.some((s: any) =>
        (s.warehouseId === warehouseId || s.warehouse_id === warehouseId)
      )) {
        const existingStock = existingStocks.find((s: any) =>
          (s.warehouseId === warehouseId || s.warehouse_id === warehouseId)
        );

        if (existingStock) {
          // Update existing
          await updateWithAudit(
            "productStock",
            existingStock.id,
            {
              quantity: stockData.quantity,
              minStock: stockData.minStock,
              min_quantity: stockData.minStock,
              updatedAt: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            { userId: user.id, userName: user.username }
          );
        } else if (stockData.quantity > 0) {
          // Create new
          const newStock = {
            id: crypto.randomUUID(),
            productId,
            product_id: productId,
            warehouseId,
            warehouse_id: warehouseId,
            quantity: stockData.quantity,
            minStock: stockData.minStock,
            min_quantity: stockData.minStock,
            max_quantity: 0,
            updatedAt: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            is_deleted: false,
          };
          await createWithAudit("productStock", newStock, {
            userId: user.id,
            userName: user.username,
          });
        }
      }
    }
  };

  const handleAddUnit = () => {
    setEditingUnit(null);
    setUnitFormData({
      unitId: "",
      conversionFactor: 1,
      prices: {},
      costPrice: 0,
      barcode: "",
    });
    setShowUnitsDialog(true);
  };

  const handleEditUnit = (unit: any) => {
    setEditingUnit(unit);
    setUnitFormData({
      unitId: unit.unitId,
      conversionFactor: unit.conversionFactor,
      prices: unit.prices || {},
      costPrice: unit.costPrice || 0,
      barcode: unit.barcode || "",
    });
    setShowUnitsDialog(true);
  };

  const handleSaveUnit = async () => {
    if (!editingProduct) {
      toast({ title: "يجب حفظ المنتج أولاً", variant: "destructive" });
      return;
    }

    if (!unitFormData.unitId || unitFormData.conversionFactor <= 0) {
      toast({ title: "يرجى ملء جميع الحقول المطلوبة", variant: "destructive" });
      return;
    }

    const selectedUnit = units.find((u) => u.id === unitFormData.unitId);
    if (!selectedUnit) return;

    try {
      if (editingUnit) {
        // تعديل وحدة موجودة
        const updated: ProductUnit = {
          ...editingUnit,
          unitId: unitFormData.unitId,
          unitName: selectedUnit.name,
          conversionFactor: unitFormData.conversionFactor,
          prices: unitFormData.prices,
          costPrice: unitFormData.costPrice,
          barcode: unitFormData.barcode,
        };
        await db.update("productUnits", updated);
        toast({ title: "✅ تم تحديث الوحدة بنجاح" });
      } else {
        // إضافة وحدة جديدة
        const newUnit: ProductUnit = {
          id: `${editingProduct.id}_${unitFormData.unitId}_${Date.now()}`,
          productId: editingProduct.id,
          unitId: unitFormData.unitId,
          unitName: selectedUnit.name,
          conversionFactor: unitFormData.conversionFactor,
          prices: unitFormData.prices,
          costPrice: unitFormData.costPrice,
          barcode: unitFormData.barcode,
          isBaseUnit: unitFormData.conversionFactor === 1,
          createdAt: new Date().toISOString(),
        };
        await db.add("productUnits", newUnit);
        toast({ title: "✅ تم إضافة الوحدة بنجاح" });
      }

      await loadProductUnits(editingProduct.id);
      setShowUnitsDialog(false);
    } catch (error) {
      console.error("Error saving unit:", error);
      toast({ title: "خطأ في حفظ الوحدة", variant: "destructive" });
    }
  };

  const handleDeleteUnit = async (unitId: string) => {
    if (!confirm("هل أنت متأكد من حذف هذه الوحدة؟")) return;

    try {
      await db.delete("productUnits", unitId);
      toast({ title: "✅ تم حذف الوحدة بنجاح" });
      if (editingProduct) {
        await loadProductUnits(editingProduct.id);
      }
    } catch (error) {
      console.error("Error deleting unit:", error);
      toast({ title: "خطأ في حذف الوحدة", variant: "destructive" });
    }
  };

  // تصدير المنتجات إلى Excel
  const exportToExcel = async () => {
    try {
      const { exportProductsToExcel } = await import("@/lib/excelUtils");

      // دالة للحصول على الوحدات المتعددة لمنتج معين
      const getProductUnits = async (productId: string) => {
        const allUnits = await db.getAll<any>("productUnits");
        return allUnits.filter((u) => u.productId === productId);
      };

      await exportProductsToExcel(
        products.filter((p) => p.stock == 0),
        units,
        priceTypes,
        getProductUnits
      );

      toast({
        title: "✅ تم التصدير بنجاح",
        description: `تم تصدير ${products.length} منتج مع وحداتهم المتعددة`,
      });
    } catch (error) {
      console.error("Export error:", error);
      toast({
        title: "خطأ في التصدير",
        description: "حدث خطأ أثناء تصدير الملف",
        variant: "destructive",
      });
    }
  };

  // تصدير المنتجات إلى Excel
  const exportAllToExcel = async () => {
    try {
      const { exportProductsToExcel } = await import("@/lib/excelUtils");

      // دالة للحصول على الوحدات المتعددة لمنتج معين
      const getProductUnits = async (productId: string) => {
        const allUnits = await db.getAll<any>("productUnits");
        return allUnits.filter((u) => u.productId === productId);
      };

      await exportProductsToExcel(products, units, priceTypes, getProductUnits);

      toast({
        title: "✅ تم التصدير بنجاح",
        description: `تم تصدير ${products.length} منتج مع وحداتهم المتعددة`,
      });
    } catch (error) {
      console.error("Export error:", error);
      toast({
        title: "خطأ في التصدير",
        description: "حدث خطأ أثناء تصدير الملف",
        variant: "destructive",
      });
    }
  };

  // استيراد المنتجات من Excel
  const importFromExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const { importProductsFromExcel } = await import("@/lib/excelUtils");
      const { data, errors, updates, inserts, productUnitsData } =
        await importProductsFromExcel(file);

      if (errors.length > 0) {
        console.warn("Import errors:", errors);
      }

      let updatedCount = 0;
      let insertedCount = 0;
      let unitsProcessed = 0;
      const defaultUnit = units.find((u) => u.isDefault);
      const defaultPriceType = priceTypes.find((pt) => pt.isDefault);

      for (const rowData of data) {
        try {
          if (rowData.isUpdate && rowData.id) {
            // تحديث منتج موجود
            const existingProduct = await db.get<Product>(
              "products",
              rowData.id
            );

            if (existingProduct) {
              const updatedProduct: Product = {
                ...existingProduct,
                nameAr: rowData.nameAr,
                name: rowData.name,
                category: rowData.category,
                stock: rowData.stock,
                costPrice: rowData.costPrice,
                price: rowData.price,
                prices: defaultPriceType
                  ? {
                    ...existingProduct.prices,
                    [defaultPriceType.id]: rowData.price,
                  }
                  : existingProduct.prices,
                unitId: rowData.unitId || existingProduct.unitId,
                barcode: rowData.barcode,
                minStock: rowData.minStock,
                expiryDate: rowData.expiryDate,
              };

              // معالجة الوحدات المتعددة
              const hasUnitsInExcel = productUnitsData.has(rowData.id);

              //  حذف كل الوحدات القديمة أولاً
              const allProductUnits = await db.getAll<any>("productUnits");
              const existingUnits = allProductUnits.filter(
                (pu) => pu.productId === rowData.id
              );

              for (const unit of existingUnits) {
                await db.delete("productUnits", unit.id);
              }

              // إضافة الوحدات الجديدة من Excel
              if (hasUnitsInExcel) {
                const unitsToInsert = productUnitsData.get(rowData.id)!;
                for (const unitData of unitsToInsert) {
                  const newUnit: any = {
                    id: `${rowData.id}_${unitData.unitId}_${Date.now()}`,
                    productId: rowData.id,
                    unitId: unitData.unitId,
                    unitName: unitData.unitName,
                    conversionFactor: unitData.conversionFactor,
                    prices: defaultPriceType
                      ? { [defaultPriceType.id]: unitData.price }
                      : {},
                    costPrice: unitData.costPrice,
                    barcode: unitData.barcode,
                    isBaseUnit: unitData.conversionFactor === 1,
                    createdAt: new Date().toISOString(),
                  };
                  await db.add("productUnits", newUnit);
                  unitsProcessed++;
                }
              }

              // تحديث الـ flag بناءً على الوحدات الجديدة
              updatedProduct.hasMultipleUnits = hasUnitsInExcel;

              await updateWithAudit("products", rowData.id, updatedProduct, {
                userId: user?.id || "",
                userName: user?.username || "",
                shiftId: currentShift?.id,
              });
              updatedCount++;
            }
          } else {
            // إضافة منتج جديد
            const newProductId = `${Date.now()}_${Math.random()
              .toString(36)
              .substr(2, 9)}`;
            const product: Product = {
              id: newProductId,
              nameAr: rowData.nameAr,
              name: rowData.name,
              category: rowData.category,
              stock: rowData.stock,
              costPrice: rowData.costPrice,
              price: rowData.price,
              prices: defaultPriceType
                ? { [defaultPriceType.id]: rowData.price }
                : {},
              unitId: rowData.unitId || defaultUnit?.id || "",
              barcode: rowData.barcode,
              minStock: rowData.minStock,
              expiryDate: rowData.expiryDate,
              hasMultipleUnits: productUnitsData.has(""), // للمنتجات الجديدة نفحص لو فيه وحدات
            };

            await createWithAudit("products", product, {
              userId: user?.id || "",
              userName: user?.username || "",
              shiftId: currentShift?.id,
            });
            insertedCount++;
          }
        } catch (error) {
          console.error("Error processing product:", error);
        }
      }

      await loadData();

      toast({
        title: "✅ تم الاستيراد",
        description: `تحديث: ${updatedCount} | إضافة: ${insertedCount} | وحدات: ${unitsProcessed} | أخطاء: ${errors.length}`,
      });
    } catch (error) {
      console.error("Import error:", error);
      toast({
        title: "خطأ في الاستيراد",
        description:
          error instanceof Error ? error.message : "حدث خطأ أثناء الاستيراد",
        variant: "destructive",
      });
    }

    // إعادة تعيين input
    e.target.value = "";
  };

  // حساب جرد المخزون
  const calculateInventoryValue = () => {
    let totalValue = 0;
    let totalCost = 0;
    let itemsCount = 0;
    let outOfStock = 0;
    let lowStock = 0;

    products.forEach((product) => {
      const cost = Number(product.costPrice || 0) * Number(product.stock || 0);
      totalCost += cost;

      const defaultPriceType = priceTypes.find((pt) => pt.isDefault);
      const priceTypeId = product.defaultPriceTypeId || defaultPriceType?.id;
      const sellPrice = Number(
        priceTypeId && product.prices?.[priceTypeId]
          ? product.prices[priceTypeId]
          : product.price || 0
      );
      totalValue += sellPrice * Number(product.stock || 0);

      itemsCount++;
      if (product.stock === 0) outOfStock++;
      else if (product.stock <= (product.minStock || 10)) lowStock++;
    });

    return {
      totalValue,
      totalCost,
      itemsCount,
      outOfStock,
      lowStock,
      expectedProfit: totalValue - totalCost,
    };
  };

  const showInventoryReport = () => {
    setInventoryDialogOpen(true);
  };

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.nameAr.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.barcode?.includes(searchTerm);

    const matchesCategory =
      selectedCategory === "all" || p.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const pagination = usePagination(filteredProducts, {
    resetDeps: [searchTerm, selectedCategory],
  });

  const getStockStatus = (product: Product) => {
    if (product.stock === 0)
      return { label: "نفذ", variant: "destructive" as const };
    if (product.stock <= (product.minStock || 10))
      return { label: "قليل", variant: "default" as const };
    return { label: "متوفر", variant: "default" as const };
  };

  const inventoryStats = calculateInventoryValue();

  // ===== دوال طباعة الباركود =====
  const openBarcodePrintDialog = () => {
    const initialSelection: Record<string, { selected: boolean; quantity: number }> = {};
    products.forEach((p) => {
      initialSelection[p.id!] = {
        selected: !!p.barcode,
        quantity: 1,
      };
    });
    setBarcodeSelection(initialSelection);
    setBarcodePrintDialogOpen(true);
  };

  const toggleSelectAllBarcodes = (selectAll: boolean) => {
    const updated: Record<string, { selected: boolean; quantity: number }> = {};
    products.forEach((p) => {
      updated[p.id!] = {
        selected: selectAll && !!p.barcode,
        quantity: barcodeSelection[p.id!]?.quantity || 1,
      };
    });
    setBarcodeSelection(updated);
  };

  const handlePrintBarcodes = async () => {
    const selectedProducts: BarcodeLabelData[] = [];

    Object.entries(barcodeSelection).forEach(([productId, { selected, quantity }]) => {
      if (selected && quantity > 0) {
        const product = products.find((p) => p.id === productId);
        if (product && product.barcode) {
          const defaultPriceType = priceTypes.find((pt) => pt.isDefault);
          const priceTypeId = product.defaultPriceTypeId || defaultPriceType?.id;
          const price = showPriceOnBarcode && priceTypeId && product.prices?.[priceTypeId]
            ? product.prices[priceTypeId]
            : (showPriceOnBarcode ? product.price : undefined);

          selectedProducts.push({
            productName: product.nameAr,
            barcode: product.barcode,
            price,
            currency,
            copies: quantity,
          });
        }
      }
    });

    if (selectedProducts.length === 0) {
      toast({
        title: "⚠️ لا يوجد منتجات محددة",
        description: "يرجى تحديد منتج واحد على الأقل للطباعة",
        variant: "destructive",
      });
      return;
    }

    const result = await printBarcodeLabels(selectedProducts, { showPrice: showPriceOnBarcode });

    if (result.success) {
      toast({
        title: "✅ تمت الطباعة",
        description: `تم طباعة ${selectedProducts.length} منتج بنجاح`,
      });
      setBarcodePrintDialogOpen(false);
    } else {
      toast({
        title: "❌ فشل في الطباعة",
        description: result.error,
        variant: "destructive",
      });
    }
  };

  // توليد باركود لمنتج وحفظه
  const generateBarcodeForProduct = async (productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    // توليد باركود EAN-13
    const timestamp = Date.now().toString().slice(-10);
    const random = Math.floor(Math.random() * 99).toString().padStart(2, "0");
    const barcodeWithoutCheck = timestamp + random;

    // حساب رقم التحقق
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += parseInt(barcodeWithoutCheck[i]) * (i % 2 === 0 ? 1 : 3);
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    const fullBarcode = barcodeWithoutCheck + checkDigit;

    // حفظ الباركود في المنتج
    await db.update("products", {
      ...product,
      barcode: fullBarcode,
    });

    // تحديث القائمة المحلية
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, barcode: fullBarcode } : p))
    );

    // تحديث selection
    setBarcodeSelection((prev) => ({
      ...prev,
      [productId]: { selected: true, quantity: 1 },
    }));

    toast({
      title: "✅ تم توليد الباركود",
      description: `باركود: ${fullBarcode}`,
    });
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <POSHeader />
      <div className="container mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">إدارة المخزون</h1>
          <div className="flex gap-2">
            <Button
              onClick={showInventoryReport}
              variant="outline"
              className="gap-2"
            >
              <Calculator className="h-4 w-4" />
              جرد المخزون
            </Button>
            <Button onClick={exportAllToExcel} variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              تصدير
            </Button>
            <Button onClick={openBarcodePrintDialog} variant="outline" className="gap-2">
              <Printer className="h-4 w-4" />
              طباعة الباركود
            </Button>
            <Button variant="outline" className="gap-2" asChild>
              <label>
                <Upload className="h-4 w-4" />
                استيراد
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,.tsv"
                  onChange={importFromExcel}
                  className="hidden"
                />
              </label>
            </Button>
            {can("products", "create") && (
              <Button onClick={() => setDialogOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                إضافة منتج
              </Button>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">إجمالي المنتجات</div>
            <div className="text-2xl font-bold">{products.length}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">
              قيمة المخزون (بيع)
            </div>
            <div className="text-2xl font-bold text-green-600">
              {inventoryStats.totalValue.toFixed(2)} {currency}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">منتجات نفذت</div>
            <div className="text-2xl font-bold text-red-600">
              {inventoryStats.outOfStock}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">منتجات قليلة</div>
            <div className="text-2xl font-bold text-yellow-600">
              {inventoryStats.lowStock}
            </div>
          </Card>
        </div>

        {/* Search and Filter */}
        <div className="flex gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="البحث عن منتج..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pr-10"
            />
          </div>
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="كل الأقسام" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأقسام</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.nameAr}>
                  {cat.nameAr}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Products Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {pagination.paginatedItems.map((product) => {
            const status = getStockStatus(product);
            return (
              <Card
                key={product.id}
                className="p-4 hover:shadow-lg transition-shadow"
              >
                {product.imageUrl && (
                  <div className="mb-3 rounded-lg overflow-hidden h-32 bg-gray-100">
                    <img
                      src={product.imageUrl}
                      alt={product.nameAr}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-bold text-lg">{product.nameAr}</h3>
                    {product.category && (
                      <p className="text-sm text-muted-foreground">
                        {product.category}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant={status.variant}>{status.label}</Badge>
                      <span className="text-sm">الكمية: {product.stock}</span>
                    </div>
                    {product.unitsPerCarton && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-md w-fit">
                        <Package className="h-3 w-3" />
                        <span>في الكرتونة: {product.unitsPerCarton}</span>
                      </div>
                    )}
                  </div>
                  <div className="bg-primary/10 p-2 rounded-lg">
                    <Package className="h-5 w-5 text-primary" />
                  </div>
                </div>
                <div className="space-y-1 text-sm mb-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">التكلفة:</span>
                    <span className="font-medium">
                      {Number(product.costPrice || 0).toFixed(2)} {currency}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">البيع:</span>
                    <span className="font-bold text-primary">
                      {(() => {
                        const defaultPriceType = priceTypes.find(
                          (pt) => pt.isDefault
                        );
                        const priceTypeId =
                          product.defaultPriceTypeId || defaultPriceType?.id;
                        const displayPrice =
                          priceTypeId && product.prices?.[priceTypeId]
                            ? product.prices[priceTypeId]
                            : product.price || 0;
                        return `${Number(displayPrice).toFixed(2)} ${currency}`;
                      })()}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 pt-3 border-t">
                  {can("products", "edit") && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(product)}
                      className="flex-1"
                    >
                      <Edit className="h-3 w-3 ml-1" />
                      تعديل
                    </Button>
                  )}
                  {can("products", "delete") && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(product.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
        <DataPagination {...pagination} entityName="منتج" />

        {/* Add/Edit Product Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent
            dir="rtl"
            className="max-w-2xl max-h-[90vh] overflow-y-auto"
          >
            <DialogHeader>
              <DialogTitle>
                {editingProduct ? "تعديل منتج" : "إضافة منتج جديد"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <Tabs defaultValue="basic" dir="rtl">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="basic">المعلومات الأساسية</TabsTrigger>
                  <TabsTrigger value="pricing">الأسعار والصورة</TabsTrigger>
                  <TabsTrigger value="warehouses">المخازن</TabsTrigger>
                  <TabsTrigger value="units" disabled={!editingProduct}>
                    الوحدات {!editingProduct && "(احفظ أولاً)"}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="basic" className="space-y-4">
                  <div>
                    <Label>الاسم بالعربي *</Label>
                    <Input
                      required
                      value={formData.nameAr}
                      onChange={(e) =>
                        setFormData({ ...formData, nameAr: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label>الاسم بالإنجليزي</Label>
                    <Input
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label>القسم</Label>
                    <Select
                      value={String(formData.categoryId || "")}
                      onValueChange={(value) => {
                        const selectedCat = categories.find(c => String(c.id) === value);
                        setFormData({
                          ...formData,
                          categoryId: value,
                          category: selectedCat?.nameAr || ""
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="اختر القسم" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat.id} value={String(cat.id)}>
                            {cat.nameAr}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>وحدة القياس *</Label>
                    <Select
                      value={formData.unitId}
                      onValueChange={(value) =>
                        setFormData({ ...formData, unitId: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="اختر الوحدة" />
                      </SelectTrigger>
                      <SelectContent>
                        {units.map((unit) => (
                          <SelectItem key={unit.id} value={unit.id}>
                            {unit.name} ({unit.symbol})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>الكمية *</Label>
                      <Input
                        type="number"
                        required
                        value={formData.stock}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            stock: parseInt(e.target.value) || 0,
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label>الحد الأدنى</Label>
                      <Input
                        type="number"
                        value={formData.minStock}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            minStock: parseInt(e.target.value) || 10,
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-blue-600" />
                        العدد في الكرتونة
                      </Label>
                      <Input
                        type="number"
                        value={formData.unitsPerCarton || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            unitsPerCarton: parseFloat(e.target.value) || undefined,
                          })
                        }
                        placeholder="كم عدد القطع في الكرتونة الواحدة؟"
                        className="mt-1"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        سيظهر هذا الرقم في الفاتورة المطبوعة
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>الباركود</Label>
                      <div className="flex gap-2">
                        <Input
                          value={formData.barcode}
                          onChange={(e) =>
                            setFormData({ ...formData, barcode: e.target.value })
                          }
                          placeholder="أدخل الباركود أو ولّد واحد"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={generateBarcode}
                          className="shrink-0"
                        >
                          <Barcode className="h-4 w-4 ml-1" />
                          توليد
                        </Button>
                      </div>
                    </div>
                    <div>
                      <Label>تاريخ الصلاحية</Label>
                      <Input
                        type="date"
                        value={formData.expiryDate}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            expiryDate: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="pricing" className="space-y-4">
                  <div>
                    <Label>سعر التكلفة *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      required
                      value={formData.costPrice}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          costPrice: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      مهم لحساب جرد المخزون والأرباح
                    </p>
                  </div>

                  <div className="space-y-3 p-4 border rounded-lg">
                    <Label className="font-semibold">أسعار البيع *</Label>
                    {priceTypes.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        لا توجد أنواع تسعير. يرجى إضافتها من الإعدادات.
                      </p>
                    ) : (
                      priceTypes.map((priceType) => (
                        <div key={priceType.id}>
                          <Label className="text-sm">
                            {priceType.name}
                            {priceType.isDefault && (
                              <Badge variant="outline" className="mr-2 text-xs">
                                افتراضي
                              </Badge>
                            )}
                          </Label>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={formData.prices[priceType.id] || ""}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                prices: {
                                  ...formData.prices,
                                  [priceType.id]:
                                    parseFloat(e.target.value) || 0,
                                },
                              })
                            }
                          />
                        </div>
                      ))
                    )}
                  </div>

                  <div>
                    <Label className="mb-2 block">صورة المنتج</Label>
                    {imagePreview ? (
                      <div className="relative w-full h-48 border rounded-lg overflow-hidden">
                        <img
                          src={imagePreview}
                          alt="Preview"
                          className="w-full h-full object-cover"
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          className="absolute top-2 left-2"
                          onClick={removeImage}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="border-2 border-dashed rounded-lg p-8 text-center">
                        <ImageIcon className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          className="hidden"
                          id="product-image"
                        />
                        <Label
                          htmlFor="product-image"
                          className="cursor-pointer text-primary hover:underline"
                        >
                          اضغط لاختيار صورة
                        </Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          الحد الأقصى: 2 ميجابايت
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center space-x-2 space-x-reverse">
                    <Checkbox
                      id="multipleUnits"
                      checked={formData.hasMultipleUnits}
                      onCheckedChange={(checked) =>
                        setFormData({
                          ...formData,
                          hasMultipleUnits: checked as boolean,
                        })
                      }
                    />
                    <Label htmlFor="multipleUnits" className="cursor-pointer">
                      المنتج له وحدات متعددة (كرتونة، علبة، قطعة)
                    </Label>
                  </div>
                </TabsContent>

                {/* Tab: المخازن */}
                <TabsContent value="warehouses" className="space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">مخزون المنتج في المخازن</h3>
                    <Badge variant="outline">
                      {Object.values(productStocks).reduce((sum, s) => sum + s.quantity, 0)} إجمالي المخزون
                    </Badge>
                  </div>

                  {warehouses.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Landmark className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>لا توجد مخازن. قم بإضافة مخازن من صفحة المخازن أولاً.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {warehouses.map((warehouse) => {
                        const stockData = productStocks[warehouse.id] || { quantity: 0, minStock: 0 };
                        return (
                          <Card key={warehouse.id} className="p-4">
                            <div className="flex items-center gap-4">
                              <div className="flex items-center gap-2 flex-1">
                                <Landmark className="h-5 w-5 text-primary" />
                                <div>
                                  <p className="font-medium">{warehouse.nameAr || warehouse.name}</p>
                                  {warehouse.isDefault && (
                                    <Badge variant="secondary" className="text-xs">افتراضي</Badge>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="w-28">
                                  <Label className="text-xs text-muted-foreground">الكمية</Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    value={stockData.quantity}
                                    onChange={(e) => setProductStocks({
                                      ...productStocks,
                                      [warehouse.id]: {
                                        ...stockData,
                                        quantity: Math.max(0, parseInt(e.target.value) || 0),
                                      },
                                    })}
                                    className="h-9"
                                  />
                                </div>
                                <div className="w-28">
                                  <Label className="text-xs text-muted-foreground">الحد الأدنى</Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    value={stockData.minStock}
                                    onChange={(e) => setProductStocks({
                                      ...productStocks,
                                      [warehouse.id]: {
                                        ...stockData,
                                        minStock: Math.max(0, parseInt(e.target.value) || 0),
                                      },
                                    })}
                                    className="h-9"
                                  />
                                </div>
                                {stockData.quantity > 0 && (
                                  <Badge variant={stockData.quantity <= stockData.minStock ? "destructive" : "default"}>
                                    {stockData.quantity <= stockData.minStock ? "منخفض" : "متاح"}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground text-center mt-4">
                    أدخل الكمية المتاحة من المنتج في كل مخزن. المخازن بكمية 0 لن يظهر فيها المنتج في نقاط البيع.
                  </p>
                </TabsContent>

                {/* Tab: الوحدات المتعددة */}
                <TabsContent value="units" className="space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">وحدات المنتج</h3>
                    <Button
                      type="button"
                      onClick={handleAddUnit}
                      size="sm"
                      className="gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      إضافة وحدة
                    </Button>
                  </div>

                  {productUnits.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>لا توجد وحدات مضافة</p>
                      <p className="text-sm">
                        اضغط "إضافة وحدة" لإضافة وحدة جديدة
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {productUnits.map((unit) => (
                        <Card key={unit.id} className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">{unit.unitName}</Badge>
                                {unit.isBaseUnit && (
                                  <Badge variant="secondary">وحدة أساسية</Badge>
                                )}
                              </div>

                              <div className="grid grid-cols-2 gap-2 text-sm">
                                <div>
                                  <span className="text-muted-foreground">
                                    عدد الوحدات:{" "}
                                  </span>
                                  <span className="font-semibold">
                                    {unit.conversionFactor}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">
                                    التكلفة:{" "}
                                  </span>
                                  <span className="font-semibold">
                                    {unit.costPrice} {currency}
                                  </span>
                                </div>
                              </div>

                              <div className="text-sm">
                                <span className="text-muted-foreground">
                                  الأسعار:{" "}
                                </span>
                                <div className="mt-1 space-y-1">
                                  {priceTypes.map((pt) => (
                                    <div
                                      key={pt.id}
                                      className="flex justify-between"
                                    >
                                      <span>{pt.name}:</span>
                                      <span className="font-semibold">
                                        {unit.prices?.[pt.id] || 0} {currency}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {unit.barcode && (
                                <div className="text-sm">
                                  <span className="text-muted-foreground">
                                    الباركود:{" "}
                                  </span>
                                  <span className="font-mono">
                                    {unit.barcode}
                                  </span>
                                </div>
                              )}
                            </div>

                            <div className="flex gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleEditUnit(unit)}
                              >
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                onClick={() => handleDeleteUnit(unit.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>

              <DialogFooter className="mt-6">
                <Button type="button" variant="outline" onClick={resetForm}>
                  إلغاء
                </Button>
                <Button type="submit">حفظ المنتج</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Inventory Report Dialog */}
        <Dialog
          open={inventoryDialogOpen}
          onOpenChange={setInventoryDialogOpen}
        >
          <DialogContent dir="rtl" className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                جرد المخزون
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Card className="p-4">
                  <div className="text-sm text-muted-foreground">
                    عدد المنتجات
                  </div>
                  <div className="text-2xl font-bold">
                    {inventoryStats.itemsCount}
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="text-sm text-muted-foreground">
                    قيمة التكلفة
                  </div>
                  <div className="text-2xl font-bold text-orange-600">
                    {inventoryStats.totalCost.toFixed(2)} {currency}
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="text-sm text-muted-foreground">
                    قيمة البيع المتوقعة
                  </div>
                  <div className="text-2xl font-bold text-green-600">
                    {inventoryStats.totalValue.toFixed(2)} {currency}
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="text-sm text-muted-foreground">
                    الربح المتوقع
                  </div>
                  <div className="text-2xl font-bold text-blue-600">
                    {inventoryStats.expectedProfit.toFixed(2)} {currency}
                  </div>
                </Card>
              </div>

              <Card className="p-4">
                <h3 className="font-semibold mb-3">حالة المخزون</h3>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span>منتجات نفذت</span>
                    <Badge variant="destructive">
                      {inventoryStats.outOfStock}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>منتجات قليلة</span>
                    <Badge variant="default">{inventoryStats.lowStock}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>منتجات متوفرة</span>
                    <Badge variant="default">
                      {inventoryStats.itemsCount -
                        inventoryStats.outOfStock -
                        inventoryStats.lowStock}
                    </Badge>
                  </div>
                </div>
              </Card>

              <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                <p className="text-sm text-blue-900 dark:text-blue-100">
                  💡 <strong>ملاحظة:</strong> هذا الجرد يعتمد على أسعار التكلفة
                  المسجلة. تأكد من تحديث أسعار التكلفة بشكل دوري للحصول على
                  بيانات دقيقة.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                className="ml-2"
                onClick={() => setInventoryDialogOpen(false)}
              >
                إغلاق
              </Button>
              <Button onClick={exportToExcel}>
                <Download className="h-4 w-4 ml-2" />
                تصدير المنتجات المنتهيه
              </Button>
              <Button onClick={exportAllToExcel}>
                <Download className="h-4 w-4 ml-2" />
                تصدير كل المنتجات
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog: إضافة/تعديل وحدة */}
        <Dialog open={showUnitsDialog} onOpenChange={setShowUnitsDialog}>
          <DialogContent dir="rtl" className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingUnit ? "تعديل وحدة" : "إضافة وحدة جديدة"}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label>الوحدة *</Label>
                <Select
                  value={unitFormData.unitId}
                  onValueChange={(value) =>
                    setUnitFormData({ ...unitFormData, unitId: value })
                  }
                  disabled={!!editingUnit}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الوحدة" />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {unit.name} ({unit.symbol})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>عدد الوحدات (Conversion Factor) *</Label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={unitFormData.conversionFactor}
                  onChange={(e) =>
                    setUnitFormData({
                      ...unitFormData,
                      conversionFactor: parseInt(e.target.value) || 1,
                    })
                  }
                  placeholder="مثال: 10 (لو كرتونة = 10 قطع)"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  عدد القطع في هذه الوحدة
                </p>
              </div>

              <div>
                <Label>سعر التكلفة *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={unitFormData.costPrice}
                  onChange={(e) =>
                    setUnitFormData({
                      ...unitFormData,
                      costPrice: parseFloat(e.target.value) || 0,
                    })
                  }
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-3 p-4 border rounded-lg">
                <Label className="font-semibold">أسعار البيع *</Label>
                {priceTypes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    لا توجد أنواع تسعير. يرجى إضافة نوع سعر واحد على الأقل من
                    إعدادات النظام.
                  </p>
                ) : (
                  priceTypes.map((priceType) => (
                    <div key={priceType.id}>
                      <Label className="text-sm">
                        {priceType.name}
                        {priceType.isDefault && (
                          <Badge variant="outline" className="mr-2 text-xs">
                            افتراضي
                          </Badge>
                        )}
                      </Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={unitFormData.prices[priceType.id] || ""}
                        onChange={(e) =>
                          setUnitFormData({
                            ...unitFormData,
                            prices: {
                              ...unitFormData.prices,
                              [priceType.id]: parseFloat(e.target.value) || 0,
                            },
                          })
                        }
                        placeholder="0.00"
                      />
                    </div>
                  ))
                )}
              </div>

              <div>
                <Label>الباركود (اختياري)</Label>
                <div className="flex gap-2">
                  <Input
                    value={unitFormData.barcode}
                    onChange={(e) =>
                      setUnitFormData({
                        ...unitFormData,
                        barcode: e.target.value,
                      })
                    }
                    placeholder="باركود خاص بهذه الوحدة"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      // توليد باركود EAN-13 للوحدة
                      const prefix = "201"; // 201 للوحدات
                      const randomPart = Math.floor(Math.random() * 1000000000).toString().padStart(9, "0");
                      const barcodeWithoutCheck = prefix + randomPart;
                      let sum = 0;
                      for (let i = 0; i < 12; i++) {
                        const digit = parseInt(barcodeWithoutCheck[i]);
                        sum += digit * (i % 2 === 0 ? 1 : 3);
                      }
                      const checkDigit = (10 - (sum % 10)) % 10;
                      const fullBarcode = barcodeWithoutCheck + checkDigit;
                      setUnitFormData({ ...unitFormData, barcode: fullBarcode });
                      toast({
                        title: "✅ تم توليد الباركود",
                        description: `باركود: ${fullBarcode}`,
                      });
                    }}
                    className="shrink-0"
                  >
                    <Barcode className="h-4 w-4 ml-1" />
                    توليد
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowUnitsDialog(false)}
              >
                إلغاء
              </Button>
              <Button type="button" onClick={handleSaveUnit}>
                حفظ الوحدة
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Barcode Print Dialog */}
        <Dialog open={barcodePrintDialogOpen} onOpenChange={setBarcodePrintDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Printer className="h-5 w-5" />
                طباعة الباركود
              </DialogTitle>
            </DialogHeader>

            {/* أزرار التحكم */}
            <div className="flex items-center justify-between gap-4 py-2 border-b">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleSelectAllBarcodes(true)}
                >
                  تحديد الكل
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleSelectAllBarcodes(false)}
                >
                  إلغاء تحديد الكل
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="showPrice"
                  checked={showPriceOnBarcode}
                  onCheckedChange={(checked) => setShowPriceOnBarcode(checked === true)}
                />
                <Label htmlFor="showPrice" className="cursor-pointer">
                  إظهار السعر على الباركود
                </Label>
              </div>
            </div>

            {/* قائمة المنتجات */}
            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="p-2 text-right w-12">#</th>
                    <th className="p-2 text-right">المنتج</th>
                    <th className="p-2 text-right w-40">الباركود</th>
                    <th className="p-2 text-center w-24">الكمية</th>
                    <th className="p-2 text-center w-20">تحديد</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product, index) => (
                    <tr key={product.id} className="border-b hover:bg-muted/50">
                      <td className="p-2 text-muted-foreground">{index + 1}</td>
                      <td className="p-2 font-medium">{product.nameAr}</td>
                      <td className="p-2">
                        {product.barcode ? (
                          <code className="text-xs bg-muted px-2 py-1 rounded">
                            {product.barcode}
                          </code>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => generateBarcodeForProduct(product.id!)}
                            className="h-7 text-xs"
                          >
                            <Barcode className="h-3 w-3 ml-1" />
                            توليد باركود
                          </Button>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        {product.barcode && (
                          <Input
                            type="number"
                            min={1}
                            max={100}
                            value={barcodeSelection[product.id!]?.quantity || 1}
                            onChange={(e) =>
                              setBarcodeSelection({
                                ...barcodeSelection,
                                [product.id!]: {
                                  ...barcodeSelection[product.id!],
                                  quantity: parseInt(e.target.value) || 1,
                                },
                              })
                            }
                            className="w-16 h-8 text-center"
                          />
                        )}
                      </td>
                      <td className="p-2 text-center">
                        {product.barcode && (
                          <Checkbox
                            checked={barcodeSelection[product.id!]?.selected || false}
                            onCheckedChange={(checked) =>
                              setBarcodeSelection({
                                ...barcodeSelection,
                                [product.id!]: {
                                  ...barcodeSelection[product.id!],
                                  selected: checked === true,
                                },
                              })
                            }
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <DialogFooter className="pt-4 border-t">
              <Button variant="outline" onClick={() => setBarcodePrintDialogOpen(false)}>
                إلغاء
              </Button>
              <Button onClick={handlePrintBarcodes} className="gap-2">
                <Printer className="h-4 w-4" />
                طباعة المحدد
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
};

export default Inventory;
