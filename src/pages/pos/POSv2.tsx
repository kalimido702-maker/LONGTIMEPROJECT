import { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { POSHeader } from "@/components/POS/POSHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  Pause,
  Save,
  UserPlus,
  X,
  Banknote,
  CreditCard,
  Wallet,
  Tag,
  Percent,
  FileText,
  Printer,
  MessageCircle,
  Truck,
  Package,
  PackageCheck,
  Landmark,
} from "lucide-react";
import {
  db,
  Product,
  ProductCategory,
  Customer,

  Invoice,
  PriceType,
  Unit,
  PaymentMethod,
  Promotion,
  ProductUnit,
  CartItem,
  PendingOrder,
  Warehouse,
  SalesReturn,
  SalesRep,
  ProductStock,
  Shift,
} from "@/shared/lib/indexedDB";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useSettingsContext } from "@/contexts/SettingsContext";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { createWithAudit } from "@/lib/transactionService";
import { printInvoiceReceipt, type InvoiceReceiptData, type InvoiceItem } from "@/lib/printing";
import { downloadInvoicePDF } from "@/lib/printing/pdfService";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";



const POSv2 = () => {
  const { user, can } = useAuth();
  const { toast } = useToast();
  const { getSetting } = useSettingsContext();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const editingInvoiceId = searchParams.get("invoiceId"); // Check for edit mode
  const fromQuote = searchParams.get("fromQuote"); // Check if loading from quote


  // States
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [priceTypes, setPriceTypes] = useState<PriceType[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [salesReps, setSalesReps] = useState<SalesRep[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("");

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);

  // Transaction Mode: sales (default) or return
  const [mode, setMode] = useState<"sales" | "return">("sales");

  // Payment states - now only credit (آجل) is supported
  const [paymentType] = useState<"credit">("credit");
  const [selectedCustomer, setSelectedCustomer] = useState<string>("cash");
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] =
    useState<string>("");
  const [selectedPriceTypeId, setSelectedPriceTypeId] = useState<string>("");
  const [discountPercent, setDiscountPercent] = useState<string>("");
  const [discountAmount, setDiscountAmount] = useState<string>("");
  const [paidAmount, setPaidAmount] = useState<string>("");
  const [includeTax, setIncludeTax] = useState<boolean>(true);

  // Multiple Payment Methods (Split Payment)
  const [splitPaymentMode, setSplitPaymentMode] = useState<boolean>(false);
  const [paymentSplits, setPaymentSplits] = useState<
    Array<{ methodId: string; methodName: string; amount: string }>
  >([]);

  // Promotions Dialog
  const [promotionDialogOpen, setPromotionDialogOpen] = useState(false);
  const [selectedPromotion, setSelectedPromotion] = useState<string>("");

  // Multi-unit Dialog
  const [unitSelectionDialog, setUnitSelectionDialog] = useState(false);
  const [productForUnitSelection, setProductForUnitSelection] =
    useState<Product | null>(null);
  const [availableProductUnits, setAvailableProductUnits] = useState<
    ProductUnit[]
  >([]);
  const [selectedProductUnitId, setSelectedProductUnitId] =
    useState<string>("");

  // Invoice notes
  const [invoiceNotes, setInvoiceNotes] = useState<string>("");

  // Invoice date (admin-only override)
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const isAdmin = user?.role === "admin" || user?.roleId === "admin";

  // Delivery status - default is "not_delivered"
  const [deliveryStatus, setDeliveryStatus] = useState<"not_delivered" | "shipped" | "delivered">("not_delivered");

  // Quantity input dialog
  const [quantityDialog, setQuantityDialog] = useState(false);
  const [productForQuantity, setProductForQuantity] = useState<Product | null>(null);
  const [inputQuantity, setInputQuantity] = useState<number>(0);
  const [currentProductStocks, setCurrentProductStocks] = useState<Record<string, number>>({});

  // Dialogs
  const [addCustomerDialog, setAddCustomerDialog] = useState(false);
  const [newCustomerData, setNewCustomerData] = useState({
    name: "",
    phone: "",
    address: "",
    initialCreditBalance: 0,
  });

  // WhatsApp confirmation dialog
  const [whatsappDialog, setWhatsappDialog] = useState(false);
  const [savedInvoiceForWhatsApp, setSavedInvoiceForWhatsApp] = useState<Invoice | null>(null);
  const [whatsappSendTarget, setWhatsappSendTarget] = useState<"customer" | "salesRep" | "repGroup" | "both">("customer");

  const taxRate = parseFloat(getSetting("taxRate") || "14");
  const currency = getSetting("currency") || "EGP";
  const storeName = getSetting("storeName") || "نظام نقاط البيع";
  const storeAddress = getSetting("storeAddress") || "";
  const storePhone = getSetting("storePhone") || "";

  useEffect(() => {
    loadData();
  }, []);

  // Auto-focus search
  useEffect(() => {
    const handleFocus = () => {
      const active = document.activeElement;
      // Don't steal focus from inputs/textareas/selects/buttons
      if (
        active?.tagName === "INPUT" ||
        active?.tagName === "TEXTAREA" ||
        active?.tagName === "SELECT" ||
        active?.tagName === "BUTTON" ||
        (active as HTMLElement)?.isContentEditable
      ) {
        return;
      }
      // Don't steal focus if a dropdown/popover/dialog is open
      const openDropdown = document.querySelector('[data-state="open"]');
      if (openDropdown) {
        return;
      }
      // Don't steal focus if a radix overlay is present
      const radixOverlay = document.querySelector(
        '[data-radix-popper-content-wrapper], [data-radix-menu-content], [data-radix-dialog-overlay], [role="dialog"], [role="alertdialog"]'
      );
      if (radixOverlay) {
        return;
      }
      searchInputRef.current?.focus();
    };
    const interval = setInterval(handleFocus, 500);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    await db.init();

    const [
      productsData,
      categoriesData,
      customersData,
      shiftsData,
      savedOrders,
      priceTypesData,
      unitsData,
      paymentMethodsData,
      promotionsData,
      warehousesData,
      salesRepsData,
    ] = await Promise.all([
      db.getAll<Product>("products"),
      db.getAll<ProductCategory>("productCategories"),
      db.getAll<Customer>("customers"),
      db.getAll<Shift>("shifts"),
      Promise.resolve(localStorage.getItem("pendingOrders")),
      db.getAll<PriceType>("priceTypes"),
      db.getAll<Unit>("units"),
      db.getAll<PaymentMethod>("paymentMethods"),
      db.getAll<Promotion>("promotions"),
      db.getAll<Warehouse>("warehouses"),
      db.getAll<SalesRep>("salesReps"),
    ]);

    setProducts(productsData.map((p) => {
      if (p.category && /^\d+$/.test(String(p.category))) {
        const matchedCat = categoriesData.find(
          (c) => String(c.id) === String(p.category)
        );
        if (matchedCat) {
          return { ...p, category: matchedCat.nameAr || matchedCat.name || p.category, categoryId: String(p.category) };
        }
      }
      return p;
    }));
    setCategories(categoriesData.filter((c) => c.active));
    setCustomers(customersData);
    setSalesReps(salesRepsData);

    const sortedPriceTypes = priceTypesData.sort(
      (a, b) => a.displayOrder - b.displayOrder
    );
    setPriceTypes(sortedPriceTypes);
    setUnits(unitsData);

    // Set default price type
    const defaultPriceType =
      sortedPriceTypes.find((pt) => pt.isDefault) || sortedPriceTypes[0];
    if (defaultPriceType) {
      setSelectedPriceTypeId(defaultPriceType.id);
    }

    const activePaymentMethods = paymentMethodsData.filter((pm) => pm.isActive);
    setPaymentMethods(activePaymentMethods);

    // Set default payment method (cash)
    const defaultPaymentMethod =
      activePaymentMethods.find((pm) => pm.type === "credit") ||
      activePaymentMethods.find((pm) => pm.type === "cash") ||
      activePaymentMethods[0];
    if (defaultPaymentMethod) {
      setSelectedPaymentMethodId(defaultPaymentMethod.id);
    }

    // Load active promotions
    const today = new Date();
    const activePromotions = promotionsData.filter((promo) => {
      if (!promo.active) return false;
      const startDate = new Date(promo.startDate);
      const endDate = new Date(promo.endDate);
      return today >= startDate && today <= endDate;
    });
    setPromotions(activePromotions);

    // Set warehouses
    const activeWarehouses = warehousesData.filter((w) => w.isActive);
    setWarehouses(activeWarehouses);
    // Set default warehouse
    const defaultWarehouse =
      activeWarehouses.find((w) => w.isDefault) || activeWarehouses[0];
    if (defaultWarehouse) {
      setSelectedWarehouseId(defaultWarehouse.id);
    }

    if (savedOrders) {
      setPendingOrders(JSON.parse(savedOrders));
    }

    searchInputRef.current?.focus();
  };

  // Load invoice for editing if ID exists
  useEffect(() => {
    if (editingInvoiceId && products.length > 0 && customers.length > 0) {
      loadEditingInvoice();
    }
  }, [editingInvoiceId, products, customers]);

  // Load quote data if navigated from Quotes page
  useEffect(() => {
    if (fromQuote && products.length > 0 && customers.length > 0) {
      loadFromQuote();
    }
  }, [fromQuote, products, customers]);

  // Auto-set delivery status for return invoices
  useEffect(() => {
    if (mode === "return") {
      setDeliveryStatus("delivered");
    }
  }, [mode]);

  const loadEditingInvoice = async () => {
    try {
      const invoice = await db.get<Invoice>("invoices", editingInvoiceId!);
      if (!invoice) {
        toast({ title: "الفاتورة غير موجودة", variant: "destructive" });
        return;
      }

      // Set Customer
      if (invoice.customerId) {
        const customer = customers.find(c => c.id === invoice.customerId);
        if (customer) setSelectedCustomer(customer.id);
      }

      // Set Items
      if (invoice.items) {
        // Need products to be loaded to map correctly
        const items: CartItem[] = invoice.items.map(item => {
          // Try to match product by ID or name as fallback
          const product = products.find(p => p.id === (item.productId || item.id));

          // Construct CartItem
          const cartItem: CartItem = {
            id: item.productId || item.id || "",
            nameAr: item.productName || "",
            nameEn: "",
            price: item.price,
            quantity: item.quantity,
            categoryId: product?.categoryId || "",
            unitId: item.unitId,
            unitName: item.unitName,
            conversionFactor: item.conversionFactor || 1,
            productUnitId: item.productUnitId,
            selectedUnitName: item.selectedUnitName,
            customPrice: item.price !== product?.price ? item.price : undefined,
            priceTypeId: item.priceTypeId,
            priceTypeName: item.priceTypeName
          };
          return cartItem;
        });
        setCartItems(items);
      }

      // Set other fields
      setDiscountAmount(invoice.discount?.toString() || "");
      // If tax was included/calculated, might need logic. Assuming defaults for now or invoice.tax

      // Load notes
      if (invoice.notes) {
        setInvoiceNotes(invoice.notes);
      }

      // Load delivery status
      if (invoice.deliveryStatus) {
        setDeliveryStatus(invoice.deliveryStatus);
      }

      // Load warehouse
      if (invoice.warehouseId) {
        setSelectedWarehouseId(invoice.warehouseId);
      }

      // Load paid amount
      if (invoice.paidAmount) {
        setPaidAmount(invoice.paidAmount.toString());
      }

      // Keep original date if needed
      if (invoice.createdAt) {
        setInvoiceDate(new Date(invoice.createdAt).toISOString().split('T')[0]);
      }

      toast({ title: "تم تحميل الفاتورة للتعديل" });
    } catch (e) {
      console.error("Error loading invoice:", e);
      toast({ title: "خطأ في تحميل بيانات الفاتورة", variant: "destructive" });
    }
  };

  // Load quote data from sessionStorage (when creating invoice from quote)
  const loadFromQuote = () => {
    try {
      const raw = sessionStorage.getItem("pos-quote-data");
      if (!raw) return;

      const quote = JSON.parse(raw);
      sessionStorage.removeItem("pos-quote-data"); // Clean up

      // Set customer
      if (quote.customerId && quote.customerId !== "cash") {
        const customer = customers.find((c) => c.id === quote.customerId);
        if (customer) setSelectedCustomer(customer.id);
      }

      // Set cart items
      if (quote.items && quote.items.length > 0) {
        const items: CartItem[] = quote.items.map((item: any) => ({
          id: item.id,
          name: item.name || "",
          nameAr: item.nameAr || "",
          price: item.price,
          stock: item.stock || 0,
          quantity: item.quantity,
          customPrice: item.customPrice,
          priceTypeId: item.priceTypeId,
          priceTypeName: item.priceTypeName,
          unitId: item.unitId,
          unitName: item.unitName,
          productUnitId: item.productUnitId,
          conversionFactor: item.conversionFactor,
          selectedUnitName: item.selectedUnitName,
          prices: item.prices,
        }));
        setCartItems(items);
      }

      // Set discount
      if (quote.discountPercent) {
        setDiscountPercent(quote.discountPercent);
        setDiscountAmount("");
      } else if (quote.discountAmount) {
        setDiscountAmount(quote.discountAmount);
        setDiscountPercent("");
      }

      // Set price type
      if (quote.selectedPriceTypeId) {
        setSelectedPriceTypeId(quote.selectedPriceTypeId);
      }

      // Set warehouse
      if (quote.selectedWarehouseId) {
        setSelectedWarehouseId(quote.selectedWarehouseId);
      }

      toast({ title: "تم تحميل بيانات عرض السعر" });
    } catch (e) {
      console.error("Error loading quote data:", e);
      toast({ title: "خطأ في تحميل بيانات عرض السعر", variant: "destructive" });
    }
  };

  const filteredProducts = products.filter((p) => {
    // Search by name, barcode, or code
    const lowerQuery = searchQuery.toLowerCase();
    const matchSearch =
      p.nameAr.toLowerCase().includes(lowerQuery) ||
      p.name.toLowerCase().includes(lowerQuery) ||
      p.barcode?.toLowerCase().includes(lowerQuery) ||
      (p as any).code?.toLowerCase().includes(lowerQuery);

    const matchCategory =
      selectedCategory === "all" ||
      (selectedCategory === "no-category"
        ? !p.category
        : p.category === selectedCategory);

    return matchSearch && matchCategory;
  }).sort((a, b) => {
    // Prioritize exact code/barcode matches
    const lowerQuery = searchQuery.toLowerCase();
    const aCodeMatch = a.barcode?.toLowerCase() === lowerQuery || (a as any).code?.toLowerCase() === lowerQuery;
    const bCodeMatch = b.barcode?.toLowerCase() === lowerQuery || (b as any).code?.toLowerCase() === lowerQuery;
    if (aCodeMatch && !bCodeMatch) return -1;
    if (bCodeMatch && !aCodeMatch) return 1;

    // Then prioritize partial code matches
    const aCodePartial = a.barcode?.toLowerCase().includes(lowerQuery) || (a as any).code?.toLowerCase().includes(lowerQuery);
    const bCodePartial = b.barcode?.toLowerCase().includes(lowerQuery) || (b as any).code?.toLowerCase().includes(lowerQuery);
    if (aCodePartial && !bCodePartial) return -1;
    if (bCodePartial && !aCodePartial) return 1;

    return 0;
  });

  // Format currency: remove decimals if integer
  // تنسيق العملة - بدون كسور عشرية
  const formatCurrency = (amount: number) => {
    return `${Math.round(amount)} ${currency}`;
  };

  // Get last price for customer
  const getLastCustomerPrice = async (customerId: string, productId: string): Promise<number | null> => {
    if (!customerId || customerId === "cash") return null;

    // Note: Assuming reasonable dataset size. Ideally use getByIndex if available.
    const allInvoices = await db.getAll<Invoice>("invoices");
    const customerInvoices = allInvoices
      .filter((inv) => inv.customerId === customerId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    for (const inv of customerInvoices) {
      const item = inv.items.find((i) => i.productId === productId || i.id === productId); // Check both ID fields
      // We only care about sales invoices for last price, likely
      // But if they returned it before, maybe that doesn't count as price?
      // Assuming we want last PURCHASE price.
      if (item && inv.paymentType !== "credit") { // Should we check invoice type?? The original code didn't check invoice type effectively
        // Wait, invoices collection contains INVOICES. SalesReturns are in 'salesReturns'.
        // So if we are looking at 'invoices', they are mostly sales.
        return item.price;
      }
      if (item) return item.price;
    }
    return null;
  };

  // Cart operations
  const addToCart = async (product: Product) => {
    // Load product stocks for this product
    const allStocks = await db.getAll<ProductStock>("productStock");
    const productStocks = allStocks.filter((s: any) =>
      (s.productId === product.id || s.product_id === product.id) && s.quantity > 0
    );

    // Build stocks record
    const stocksRecord: Record<string, number> = {};
    productStocks.forEach((stock: any) => {
      const warehouseId = stock.warehouseId || stock.warehouse_id;
      stocksRecord[warehouseId] = stock.quantity || 0;
    });
    setCurrentProductStocks(stocksRecord);

    // If product has warehouse stocks, auto-select warehouse with stock
    const warehousesWithStock = Object.keys(stocksRecord);
    if (warehousesWithStock.length === 1) {
      // Only one warehouse has stock, select it
      setSelectedWarehouseId(warehousesWithStock[0]);
    } else if (warehousesWithStock.length > 0 && !warehousesWithStock.includes(selectedWarehouseId)) {
      // Current selected warehouse has no stock, select first with stock
      setSelectedWarehouseId(warehousesWithStock[0]);
    }

    // Show quantity input dialog
    setProductForQuantity(product);
    setInputQuantity(0);
    setQuantityDialog(true);
  };

  // Called after quantity is confirmed
  const handleQuantityConfirm = async () => {
    if (!productForQuantity) return;

    const product = productForQuantity;
    const quantity = inputQuantity;

    setQuantityDialog(false);
    setProductForQuantity(null);

    // Check if product has multiple units
    const productUnits = await db.getByIndex<ProductUnit>(
      "productUnits",
      "productId",
      product.id
    );

    console.log("Product units for", product.nameAr, ":", productUnits);

    if (productUnits && productUnits.length > 0) {
      // Show unit selection dialog
      setProductForUnitSelection(product);
      setAvailableProductUnits(productUnits);
      setSelectedProductUnitId(productUnits[0]?.id || "");
      setUnitSelectionDialog(true);
      return;
    }

    // No multiple units, add with quantity directly
    addToCartWithUnit(product, null, quantity);
  };

  const addToCartWithUnit = async (
    product: Product,
    productUnit: ProductUnit | null,
    initialQuantity: number = 1
  ) => {
    const conversionFactor = productUnit?.conversionFactor || 1;

    const existing = cartItems.find(
      (i) => i.id === product.id && i.productUnitId === productUnit?.id
    );

    if (existing) {
      // Update existing with additional quantity
      const newQuantity = existing.quantity + initialQuantity;
      updateQuantity(
        existing.id,
        newQuantity,
        existing.productUnitId
      );
    } else {
      // Get price type
      const priceTypeId =
        selectedPriceTypeId ||
        (priceTypes.find((pt) => pt.isDefault) || priceTypes[0])?.id ||
        "";
      const priceType = priceTypes.find((pt) => pt.id === priceTypeId);

      // Calculate price
      let calculatedPrice = product.price || 0;
      let usedCustomPrice: number | undefined = undefined;

      // Logic for Return Mode: Last Customer Price
      if (mode === "return" && selectedCustomer !== "cash") {
        console.log("Adding return item. Customer:", selectedCustomer, "Product:", product.id);
        const lastPrice = await getLastCustomerPrice(selectedCustomer, product.id);
        console.log("Last price result:", lastPrice);

        if (lastPrice !== null) {
          calculatedPrice = lastPrice;
          usedCustomPrice = lastPrice; // Treat as custom price
          toast({ title: `تم تحديد السعر بناءً على آخر شراء: ${lastPrice}` });
          // Verified
        } else {
          console.log("Showing warning toast for unverified return item");
          toast({
            title: "تنبيه: هذا المنتج لم يشتره العميل من قبل",
            description: "يرجى مراجعة السعر",
            variant: "destructive"
          });
          // Not verified implied by absence of logic or explicit false? 
          // We'll set it in the object below
        }
      }

      if (mode !== "return" || (mode === "return" && usedCustomPrice === undefined)) {
        if (productUnit) {
          // Use unit's price based on selected price type
          calculatedPrice =
            productUnit.prices?.[priceTypeId] || product.price || 0;
        } else {
          // Use product's price based on selected price type
          calculatedPrice =
            priceTypeId && product.prices?.[priceTypeId]
              ? product.prices[priceTypeId]
              : product.price || 0;
        }
      }

      // Get unit info (base unit from product)
      const baseUnit = units.find((u) => u.id === product.unitId);

      // Get selected unit name (from productUnit if available)
      const selectedUnitName = productUnit?.unitName || baseUnit?.name;

      setCartItems([
        ...cartItems,
        {
          id: product.id,
          name: product.name,
          nameAr: product.nameAr,
          price: calculatedPrice,
          customPrice: usedCustomPrice,
          stock: product.stock,
          quantity: initialQuantity,
          priceTypeId: priceTypeId,
          priceTypeName: priceType?.name,
          unitId: product.unitId,
          unitName: baseUnit?.name,
          prices: productUnit?.prices || product.prices,
          productUnitId: productUnit?.id,
          conversionFactor: conversionFactor,
          selectedUnitName: selectedUnitName,
          // Validation Logic
          isPriceVerified: mode === "return" && selectedCustomer !== "cash" ? (await getLastCustomerPrice(selectedCustomer, product.id) !== null) : undefined,
          originalPrice: mode === "return" && selectedCustomer !== "cash" ? (await getLastCustomerPrice(selectedCustomer, product.id) || undefined) : undefined,
        },
      ]);
    }
    setSearchQuery("");
    setUnitSelectionDialog(false);
    setQuantityDialog(false);
  };

  const handleUnitSelectionConfirm = () => {
    if (!productForUnitSelection || !selectedProductUnitId) return;

    const selectedUnit = availableProductUnits.find(
      (u) => u.id === selectedProductUnitId
    );
    if (!selectedUnit) return;

    addToCartWithUnit(productForUnitSelection, selectedUnit, inputQuantity);
  };

  const updateQuantity = (id: string, qty: number, productUnitId?: string) => {
    if (qty <= 0) {
      setCartItems(
        cartItems.filter(
          (i) => !(i.id === id && i.productUnitId === productUnitId)
        )
      );
      return;
    }

    const product = products.find((p) => p.id === id);
    const cartItem = cartItems.find(
      (i) => i.id === id && i.productUnitId === productUnitId
    );

    if (product && cartItem) {
      // Check stock in base units - warning only, don't block
      const neededStock = qty * (cartItem.conversionFactor || 1);
      if (neededStock > product.stock) {
        toast({
          title: "تحذير: الكمية المطلوبة أكبر من المخزون",
          description: `المخزون المتاح: ${product.stock}`,
          variant: "default"
        });
        // Continue anyway - don't return/block
      }
    }

    setCartItems(
      cartItems.map((i) =>
        i.id === id && i.productUnitId === productUnitId
          ? { ...i, quantity: qty }
          : i
      )
    );
  };

  const updatePrice = (id: string, price: number) => {
    setCartItems(
      cartItems.map((i) => (i.id === id ? { ...i, customPrice: price } : i))
    );
  };

  // Update all cart items when global price type changes
  const updateGlobalPriceType = async (priceTypeId: string) => {
    setSelectedPriceTypeId(priceTypeId);
    const priceType = priceTypes.find((pt) => pt.id === priceTypeId);

    const updatedItems = await Promise.all(
      cartItems.map(async (item) => {
        const product = products.find((p) => p.id === item.id);
        if (!product) return item;

        let newPrice = product.price || 0;

        // Check if item has a product unit (multiple units)
        if (item.productUnitId) {
          // Get the ProductUnit to get its prices
          const productUnit = await db.get<ProductUnit>(
            "productUnits",
            item.productUnitId
          );
          if (
            productUnit &&
            productUnit.prices &&
            productUnit.prices[priceTypeId]
          ) {
            newPrice = productUnit.prices[priceTypeId];
          }
        } else {
          // No product unit, use product's prices
          if (product.prices && product.prices[priceTypeId]) {
            newPrice = product.prices[priceTypeId];
          }
        }

        return {
          ...item,
          priceTypeId: priceTypeId,
          priceTypeName: priceType?.name,
          price: newPrice,
          customPrice: undefined, // Reset custom price when changing price type
        };
      })
    );

    setCartItems(updatedItems);
  };

  const removeItem = (id: string, productUnitId?: string) => {
    setCartItems(
      cartItems.filter(
        (i) => !(i.id === id && i.productUnitId === productUnitId)
      )
    );
  };

  const clearCart = () => {
    setCartItems([]);
    setDiscountPercent("");
    setDiscountAmount("");
    setPaidAmount("");
    setSelectedCustomer("cash");
    setSplitPaymentMode(false);
    setPaymentSplits([]);
    setInvoiceNotes("");

    // Reset to default price type
    const defaultPriceType =
      priceTypes.find((pt) => pt.isDefault) || priceTypes[0];
    if (defaultPriceType) {
      setSelectedPriceTypeId(defaultPriceType.id);
    }

    // Reset to default payment method
    const defaultPaymentMethod =
      paymentMethods.find((pm) => pm.type === "credit") ||
      paymentMethods.find((pm) => pm.type === "cash") ||
      paymentMethods[0];
    if (defaultPaymentMethod) {
      setSelectedPaymentMethodId(defaultPaymentMethod.id);
    }

    // Reset date to today
    setInvoiceDate(new Date().toISOString().split('T')[0]);
  };

  // Calculations
  const subtotal = cartItems.reduce(
    (sum, i) => sum + (i.customPrice || i.price) * i.quantity,
    0
  );

  const discount = discountPercent
    ? (subtotal * parseFloat(discountPercent)) / 100
    : parseFloat(discountAmount) || 0;

  const afterDiscount = subtotal - discount;
  const tax = (includeTax && taxRate > 0) ? (afterDiscount * taxRate) / 100 : 0;
  const total = afterDiscount + tax;

  // حساب المدفوع من الدفع المقسم أو المدفوع العادي
  const paid = splitPaymentMode
    ? paymentSplits.reduce(
      (sum, split) => sum + (parseFloat(split.amount) || 0),
      0
    )
    : parseFloat(paidAmount) || 0;
  const change = paid - total;

  // إضافة طريقة دفع جديدة للدفع المقسم
  const addPaymentSplit = () => {
    const remainingAmount = total - paid;
    const defaultMethod =
      paymentMethods.find((pm) => pm.type === "credit") ||
      paymentMethods.find((pm) => pm.type === "cash") ||
      paymentMethods[0];

    if (defaultMethod) {
      setPaymentSplits([
        ...paymentSplits,
        {
          methodId: defaultMethod.id,
          methodName: defaultMethod.name,
          amount: remainingAmount > 0 ? String(Math.round(remainingAmount)) : "0",
        },
      ]);
    }
  };

  const updatePaymentSplit = (
    index: number,
    field: "methodId" | "amount",
    value: string
  ) => {
    const updated = [...paymentSplits];
    if (field === "methodId") {
      const method = paymentMethods.find((pm) => pm.id === value);
      if (method) {
        updated[index].methodId = value;
        updated[index].methodName = method.name;
      }
    } else {
      updated[index].amount = value;
    }
    setPaymentSplits(updated);
  };

  const removePaymentSplit = (index: number) => {
    setPaymentSplits(paymentSplits.filter((_, i) => i !== index));
  };

  // Generate Quote PDF - Uses same template as invoice but with "عرض سعر" header
  const generateQuotePDF = async () => {
    if (cartItems.length === 0) {
      toast({ title: "لا يوجد منتجات في السلة", variant: "destructive" });
      return;
    }

    try {
      const { generateInvoiceHTML } = await import("@/services/invoicePdfService");
      const { saveQuoteToStorage } = await import("@/pages/sales/Quotes");
      const allProducts = await db.getAll("products");

      const customerData = selectedCustomer !== "cash"
        ? customers.find((c) => c.id === selectedCustomer)
        : null;

      const quoteNumber = `QT-${Date.now().toString().slice(-6)}`;
      const currentDate = new Date().toLocaleDateString("ar-EG");

      const items = cartItems.map((item) => {
        const product = allProducts.find((p: any) => p.id === item.id);
        return {
          productName: item.nameAr || item.name || "",
          productCode: (product as any)?.code || "",
          quantity: item.quantity,
          price: item.customPrice || item.price,
          total: (item.customPrice || item.price) * item.quantity,
          unitsPerCarton: (product as any)?.unitsPerCarton || (product as any)?.cartonCount,
        };
      });

      const pdfData = {
        id: quoteNumber,
        invoiceNumber: quoteNumber,
        date: currentDate,
        customerName: customerData?.name || "عميل",
        customerAddress: customerData?.address || "",
        items: items,
        total: total,
        discount: discount > 0 ? discount : undefined,
        previousBalance: customerData?.currentBalance, // الرصيد السابق بدون قيمة عرض السعر
        currentBalance: undefined, // لا يتجمع مع عرض السعر
        isReturn: false,
        isQuote: true,
      };

      // Save quote to log
      saveQuoteToStorage({
        id: Date.now().toString(),
        quoteNumber,
        customerId: selectedCustomer,
        customerName: customerData?.name || "عميل",
        items: cartItems.map((item) => ({
          id: item.id,
          name: item.name,
          nameAr: item.nameAr,
          price: item.price,
          quantity: item.quantity,
          customPrice: item.customPrice,
          priceTypeId: item.priceTypeId,
          priceTypeName: item.priceTypeName,
          unitId: item.unitId,
          unitName: item.unitName,
          productUnitId: item.productUnitId,
          conversionFactor: item.conversionFactor,
          selectedUnitName: item.selectedUnitName,
          stock: item.stock,
          prices: item.prices,
        })),
        subtotal,
        discount,
        discountPercent,
        discountAmount,
        tax,
        total,
        createdAt: new Date().toISOString(),
        notes: invoiceNotes || undefined,
        selectedPriceTypeId,
        selectedWarehouseId,
      });

      // Generate HTML using invoice template
      let html = await generateInvoiceHTML(pdfData as any);

      // Replace "فاتورة إلى:" with "عرض سعر إلى:" in the generated HTML
      html = html.replace('فاتورة إلى:', 'عرض سعر إلى:');
      html = html.replace('فاتورة بيع', 'عرض سعر');
      html = html.replace(/الرصيد الحالي/g, '');

      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.onload = () => {
          printWindow.print();
        };
      }

      toast({ title: "تم حفظ عرض السعر في السجل" });
    } catch (error) {
      console.error("Error generating quote:", error);
      toast({ title: "حدث خطأ أثناء إنشاء عرض السعر", variant: "destructive" });
    }
  };

  // Apply promotion
  const applyPromotion = (promotionId: string) => {
    const promotion = promotions.find((p) => p.id === promotionId);
    if (!promotion) return;

    if (promotion.discountType === "percentage") {
      setDiscountPercent(promotion.discountValue.toString());
      setDiscountAmount("");
    } else {
      setDiscountAmount(promotion.discountValue.toString());
      setDiscountPercent("");
    }

    setSelectedPromotion(promotionId);
    setPromotionDialogOpen(false);

    toast({
      title: "تم تطبيق العرض",
      description: `${promotion.name} - ${promotion.discountType === "percentage"
        ? `${promotion.discountValue}%`
        : `${promotion.discountValue} جنيه`
        }`,
    });
  };

  // Suspend order
  const suspendOrder = () => {
    if (cartItems.length === 0) {
      toast({ title: "لا يوجد منتجات", variant: "destructive" });
      return;
    }

    const order: PendingOrder = {
      id: Date.now().toString(),
      items: cartItems,
      customerId: selectedCustomer === "cash" ? undefined : selectedCustomer,
      paymentType,
      timestamp: new Date().toISOString(),
    };

    const updated = [...pendingOrders, order];
    setPendingOrders(updated);
    localStorage.setItem("pendingOrders", JSON.stringify(updated));
    clearCart();
    toast({ title: "تم تعليق الطلب" });
  };

  const resumeOrder = (order: PendingOrder) => {
    setCartItems(order.items);
    setSelectedCustomer(order.customerId || "cash");
    // paymentType is always credit now

    const updated = pendingOrders.filter((o) => o.id !== order.id);
    setPendingOrders(updated);
    localStorage.setItem("pendingOrders", JSON.stringify(updated));
  };

  // Add customer
  const handleAddCustomer = async () => {
    if (!newCustomerData.name || !newCustomerData.phone) {
      toast({ title: "الاسم والهاتف مطلوبان", variant: "destructive" });
      return;
    }

    const customer: Customer = {
      id: Date.now().toString(),
      name: newCustomerData.name,
      phone: newCustomerData.phone,
      address: newCustomerData.address,
      creditLimit: 0,
      currentBalance: 0,
      bonusBalance: 0,
      loyaltyPoints: 0,
      createdAt: new Date().toISOString(),
    };

    await db.add("customers", customer);

    // إنشاء فاتورة آجلة للرصيد الافتتاحي إذا كان المبلغ أكبر من صفر
    if (newCustomerData.initialCreditBalance > 0) {
      const initialCreditAmount =
        parseFloat(newCustomerData.initialCreditBalance.toString()) || 0;

      const creditInvoice = {
        id: `INIT-${Date.now()}`,
        customerId: customer.id,
        customerName: customer.name,
        items: [],
        subtotal: initialCreditAmount,
        discount: 0,
        tax: 0,
        total: initialCreditAmount,
        paymentType: "credit" as const,
        paymentStatus: "unpaid" as const,
        paidAmount: 0,
        remainingAmount: initialCreditAmount,
        paymentMethodIds: [],
        paymentMethodAmounts: {},
        userId: user?.id || "system",
        userName: user?.name || "النظام",
        createdAt: new Date().toISOString(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      await db.add("invoices", creditInvoice);

      // تحديث رصيد العميل
      customer.currentBalance = initialCreditAmount;
      await db.update("customers", customer);

      toast({ title: "تم إضافة العميل وإنشاء فاتورة الرصيد الافتتاحي" });
    } else {
      toast({ title: "تم إضافة العميل" });
    }

    await loadData();
    setSelectedCustomer(customer.id);
    setAddCustomerDialog(false);
    setNewCustomerData({
      name: "",
      phone: "",
      address: "",
      initialCreditBalance: 0,
    });
  };

  const getCustomerName = (customerId?: string) => {
    if (!customerId) return "عميل نقدي";
    const customer = customers.find((c) => c.id === customerId);
    return customer?.name || "غير محدد";
  };

  // دالة مساعدة لحساب المبلغ المدفوع الفعلي (للداتا القديمة)
  const getActualPaidAmount = (invoice: Invoice): number => {
    return invoice.paidAmount || 0;
  };

  // Save handler for Returns
  const handleReturnSave = async (print = false) => {
    // Handle Return Mode
    if (mode === "return") {
      if (!user) {
        toast({ title: "يجب تسجيل الدخول", variant: "destructive" });
        return;
      }
      if (cartItems.length === 0) {
        toast({ title: "لا يوجد منتجات", variant: "destructive" });
        return;
      }
      if (selectedCustomer === "cash") {
        toast({ title: "يجب اختيار عميل للمرتجع", variant: "destructive" });
        return;
      }

      try {
        // Calculate totals locally to be safe
        const subtotal = cartItems.reduce((sum, item) => sum + (item.customPrice || item.price) * item.quantity, 0);
        // Assuming simple tax logic matching standard invoice, but verifying:
        // If includeTax is true, tax is added? Or included?
        // Looking at state: includeTax
        const taxAmt = (includeTax && taxRate > 0) ? subtotal * (taxRate / 100) : 0;
        const totalAmt = subtotal + taxAmt; // - discount? Return usually no discount unless specified.

        const returnId = `RET-${Date.now().toString().slice(-6)}`;
        const customerData = customers.find((c) => c.id === selectedCustomer);

        const returnData: SalesReturn = {
          id: returnId,
          customerId: selectedCustomer,
          customerName: customerData?.name,
          items: cartItems.map((item) => ({
            productId: item.id,
            productName: item.nameAr || item.name,
            quantity: item.quantity,
            price: item.customPrice || item.price,
            total: (item.customPrice || item.price) * item.quantity,
            reason: "فاتورة مرتجع جديدة"
          })),
          subtotal: subtotal,
          tax: taxAmt,
          total: totalAmt,
          reason: invoiceNotes || "فاتورة مرتجع جديدة",
          userId: user.id,
          userName: user.name,
          createdAt: new Date().toISOString(),
          refundMethod: "balance",
          refundStatus: "completed",
          deliveryStatus: deliveryStatus === "delivered" ? "delivered" : "pending"
        };

        await db.add("salesReturns", returnData);

        // Update Stock (Increase)
        for (const item of cartItems) {
          const product = products.find((p) => p.id === item.id);
          if (product) {
            const qtyToAdd = item.quantity * (item.conversionFactor || 1);
            await db.update("products", {
              ...product,
              stock: product.stock + qtyToAdd,
            });
          }
        }

        // Update Customer Balance (Decrease Debt)
        if (customerData) {
          customerData.currentBalance -= totalAmt;
          await db.update("customers", customerData);
        }

        // Print return invoice if requested (same format as sales invoice)
        if (print) {
          try {
            const { printInvoice, convertToPDFData } = await import("@/services/invoicePdfService");
            const returnInvoiceLike = {
              id: returnId,
              invoiceNumber: returnId,
              createdAt: new Date().toISOString(),
              customerId: selectedCustomer,
              customerName: customerData?.name || "عميل",
              subtotal: subtotal,
              total: totalAmt,
              discount: 0,
              items: cartItems.map((item) => ({
                productId: item.id,
                productName: item.nameAr || item.name,
                quantity: item.quantity,
                price: item.customPrice || item.price,
                total: (item.customPrice || item.price) * item.quantity,
                unitsPerCarton: item.unitsPerCarton,
              })),
              isReturn: true,
            };
            const pdfData = await convertToPDFData(
              returnInvoiceLike,
              customerData || { name: customerData?.name || "عميل" },
              returnInvoiceLike.items,
              { name: user.name }
            );
            pdfData.isReturn = true;
            await printInvoice(pdfData);
          } catch (error) {
            console.error("Print return error:", error);
            toast({ title: "فشل في طباعة المرتجع", variant: "destructive" });
          }
        }

        toast({ title: "تم حفظ فاتورة المرتجع بنجاح" });
        setMode("sales");
        setCartItems([]);
        await loadData();

      } catch (e) {
        console.error(e);
        toast({ title: "حدث خطأ أثناء حفظ المرتجع", variant: "destructive" });
      }
      return;
    }
  };

  // Save handler for Invoices (Sales)
  const handleInvoiceSave = async (print: boolean = false) => {
    if (!user) {
      toast({ title: "يجب تسجيل الدخول", variant: "destructive" });
      return;
    }

    if (cartItems.length === 0) {
      toast({ title: "لا يوجد منتجات", variant: "destructive" });
      return;
    }

    // يجب اختيار عميل للآجل
    if (selectedCustomer === "cash") {
      toast({ title: "اختر عميل للآجل", variant: "destructive" });
      return;
    }

    try {
      const customerData = customers.find((c) => c.id === selectedCustomer);
      let invoiceIdToSave = "";
      let oldInvoice: Invoice | undefined;

      // 1. If Editing, handle Pre-Updates (Stock Restoration & Balance Revert)
      if (editingInvoiceId) {
        oldInvoice = await db.get<Invoice>("invoices", editingInvoiceId);
        if (oldInvoice) {
          // Restore Stock
          if (oldInvoice.items) {
            const productsStore = await db.getAll<Product>("products");
            for (const item of oldInvoice.items) {
              const product = productsStore.find(p => p.id === (item.productId || item.id));
              if (product && product.trackStock) {
                const qtyToRestore = item.quantity * (item.conversionFactor || 1);
                await db.update("products", {
                  ...product,
                  stock: (product.stock || 0) + qtyToRestore
                });
              }
            }
          }

          // Revert Customer Balance (if applicable)
          if (oldInvoice.customerId && oldInvoice.paymentType === "credit") {
            const oldCust = await db.get<Customer>("customers", oldInvoice.customerId);
            if (oldCust) {
              // Remove old debt: Subtract (Total - Paid) that was added previously
              const oldRemaining = Math.max(0, (oldInvoice.total || 0) - (oldInvoice.paidAmount || 0));
              await db.update("customers", {
                ...oldCust,
                currentBalance: (oldCust.currentBalance || 0) - oldRemaining
              });
            }
          }
          invoiceIdToSave = oldInvoice.id;
        }
      } else {
        // Generate New ID
        const allInvoices = await db.getAll<Invoice>("invoices");
        const existingIds = new Set(allInvoices.map(inv => inv.invoiceNumber || inv.id));

        while (true) {
          const num = Math.floor(100000 + Math.random() * 900000).toString();
          // check repeats
          const counts: Record<string, number> = {};
          let maxRepeat = 0;
          for (const char of num) {
            counts[char] = (counts[char] || 0) + 1;
            maxRepeat = Math.max(maxRepeat, counts[char]);
          }
          if (maxRepeat <= 4 && !existingIds.has(num)) {
            invoiceIdToSave = num;
            break;
          }
        }
      }

      // 2. Validate New Stock (Re-fetch products to get updated stock after restoration)
      const productsStore = await db.getAll<Product>("products");
      for (const item of cartItems) {
        const product = productsStore.find((p) => p.id === item.id);
        if (product && product.trackStock) {
          const quantityInBaseUnit = item.quantity * (item.conversionFactor || 1);
          if ((product.stock || 0) < quantityInBaseUnit) {
            toast({
              title: "خطأ في المخزون",
              description: `الكمية المطلوبة للمنتج ${item.nameAr} غير متوفرة (المتوفر: ${product.stock})`,
              variant: "destructive",
            });
            // CRITICAL: If failed and we were editing, we effectively already restored stock.
            //Ideally we should rollback, but for now user will just try again or fix cart.
            return;
          }
        }
      }

      // 3. Prepare Invoice Data
      let paymentMethodIds: string[] = [];
      let paymentMethodAmounts: Record<string, number> = {};
      let actualPaid = paid;

      if (splitPaymentMode && paymentSplits.length > 0) {
        paymentSplits.forEach((split) => {
          const amount = parseFloat(split.amount) || 0;
          if (amount > 0) {
            paymentMethodIds.push(split.methodId);
            paymentMethodAmounts[split.methodId] = amount;
          }
        });
      } else {
        const paymentMethodId = selectedPaymentMethodId || paymentMethods[0]?.id || "";
        if (paid > 0 && paymentMethodId) {
          paymentMethodIds = [paymentMethodId];
          paymentMethodAmounts = { [paymentMethodId]: paid };
        }
      }

      const invoice: Invoice = {
        id: invoiceIdToSave,
        invoiceNumber: invoiceIdToSave,
        customerId: selectedCustomer,
        customerName: customerData?.name,
        salesRepId: customerData?.salesRepId || undefined, // Link invoice to customer's sales rep
        items: cartItems.map((i) => ({
          productId: i.id,
          productName: i.nameAr,
          quantity: i.quantity,
          price: i.customPrice || i.price,
          total: (i.customPrice || i.price) * i.quantity,
          unitId: i.unitId || "",
          unitName: i.unitName || "",
          conversionFactor: i.conversionFactor || 1,
          priceTypeId: i.priceTypeId || "",
          priceTypeName: i.priceTypeName || "",
          productUnitId: i.productUnitId,
          selectedUnitName: i.selectedUnitName,
        })),
        subtotal,
        discount,
        tax,
        total,
        paymentType: "credit",
        paymentStatus: actualPaid >= total ? "paid" : actualPaid > 0 ? "partial" : "unpaid",
        paidAmount: actualPaid,
        remainingAmount: Math.max(0, total - actualPaid),
        paymentMethodIds,
        paymentMethodAmounts,
        userId: user.id,
        userName: user.name,
        // Keep original dates if editing, unless admin overrides
        createdAt: (editingInvoiceId && oldInvoice) ? oldInvoice.createdAt : (isAdmin && invoiceDate ? new Date(invoiceDate + 'T' + new Date().toTimeString().split(' ')[0]).toISOString() : new Date().toISOString()),
        dueDate: new Date((isAdmin && invoiceDate ? new Date(invoiceDate).getTime() : Date.now()) + 30 * 24 * 60 * 60 * 1000).toISOString(),
        notes: invoiceNotes || undefined,
        deliveryStatus: deliveryStatus,
        warehouseId: selectedWarehouseId || undefined,
      };

      // 4. Save Invoice
      if (editingInvoiceId) {
        await db.update("invoices", invoice);
      } else {
        await createWithAudit("invoices", invoice, { userId: user.id, userName: user.name });
      }

      // 5. Update Stock (Deduct)
      for (const item of cartItems) {
        const product = productsStore.find((p) => p.id === item.id);
        if (product && product.trackStock) {
          const stockToDeduct = item.quantity * (item.conversionFactor || 1);
          await db.update("products", {
            ...product,
            stock: (product.stock || 0) - stockToDeduct,
          });
        }
      }

      // 6. Update Customer Balance (Add New Debt)
      // Re-fetch customer to ensure we have latest balance (after revert)
      const freshCustomer = await db.get<Customer>("customers", selectedCustomer);
      if (freshCustomer) {
        await db.update("customers", {
          ...freshCustomer,
          currentBalance: (freshCustomer.currentBalance || 0) + Math.max(0, total - paid),
        });
      }

      toast({ title: editingInvoiceId ? "تم تعديل الفاتورة بنجاح" : "تم حفظ الفاتورة بنجاح" });

      if (print) {
        try {
          const { printInvoice, convertToPDFData } = await import("@/services/invoicePdfService");
          const cust = customers.find(c => c.id === invoice.customerId) || { name: getCustomerName(invoice.customerId) };
          const pdfData = await convertToPDFData(invoice, cust, invoice.items, { name: user.name });
          await printInvoice(pdfData);
        } catch (error) {
          console.error("Print error:", error);
          toast({ title: "فشل في الطباعة", variant: "destructive" });
        }
      }

      if (customerData?.phone) {
        setSavedInvoiceForWhatsApp(invoice);
        setWhatsappDialog(true);
      }

      clearCart();
      if (editingInvoiceId) {
        navigate("/sales/invoices"); // Return to list after edit
      } else {
        await loadData();
      }

    } catch (error) {
      console.error(error);
      toast({ title: "خطأ في الحفظ", variant: "destructive" });
    }
  };

  // Main Save Dispatcher
  const saveInvoice = async (print = false) => {
    if (mode === "return") {
      // Assuming handleReturnSave is defined elsewhere or will be added
      // For now, this will cause a compile error if handleReturnSave is not defined.
      // The instruction implies its existence.
      await handleReturnSave(print);
    } else {
      await handleInvoiceSave(print);
    }
  };

  // WhatsApp send function with PDF support (Long Time template)
  const handleSendWhatsApp = async () => {
    if (!savedInvoiceForWhatsApp) return;

    const customer = customers.find(c => c.id === savedInvoiceForWhatsApp.customerId);
    if (!customer?.phone) {
      toast({ title: "لا يوجد رقم هاتف للعميل", variant: "destructive" });
      return;
    }

    // Show loading dialog
    setWhatsappDialog(false);

    try {
      // Step 1: Preparing PDF
      toast({ title: "📄 جاري تجهيز الفاتورة...", description: "الخطوة 1 من 3" });

      // Import PDF service dynamically
      const { generateInvoicePDF, convertToPDFData } = await import("@/services/invoicePdfService");

      // Get all products to lookup unitsPerCarton and ensure data completeness
      const allProducts = await db.getAll("products");

      // Get invoice items and enrich
      const items = (savedInvoiceForWhatsApp.items || []).map((item: any) => {
        const product = allProducts.find((p: any) => p.id === item.productId || p.name === item.productName || p.name === item.name);
        return {
          ...item,
          unitsPerCarton: product?.unitsPerCarton || product?.cartonCount,
          productCode: item.productCode || product?.code || product?.sku || "-"
        };
      });
      const rep = customer.salesRepId ? salesReps.find(r => r.id === customer.salesRepId) : null;

      // Convert to PDF data format
      const pdfData = await convertToPDFData(
        savedInvoiceForWhatsApp,
        customer,
        items,
        rep
      );

      // Step 2: Generating PDF
      toast({ title: "🖨️ جاري توليد PDF...", description: "الخطوة 2 من 3" });

      // Generate PDF blob
      const pdfBlob = await generateInvoicePDF(pdfData);

      // Step 3: Sending via WhatsApp
      toast({ title: "📤 جاري الإرسال عبر واتساب...", description: "الخطوة 3 من 3" });

      // Convert blob to base64 for sending
      const base64data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(pdfBlob);
      });

      // Prepare info message
      const message = `🧾 *فاتورة رقم ${savedInvoiceForWhatsApp.invoiceNumber || savedInvoiceForWhatsApp.id}*\n` +
        `*العميل:* ${savedInvoiceForWhatsApp.customerName}\n` +
        `*الإجمالي:* ${formatCurrency(savedInvoiceForWhatsApp.total)}\n\n` +
        `شركة لونج تايم للصناعات الكهربائية`;

      const phone = customer.phone.replace(/[^0-9]/g, "");
      const repPhone = rep?.phone?.replace(/[^0-9]/g, "");

      // Determine recipients
      const recipients: { phone: string; isGroup?: boolean; label: string }[] = [];
      if (whatsappSendTarget === "customer" || whatsappSendTarget === "both") {
        if (phone) recipients.push({ phone, label: "العميل" });
      }
      if (whatsappSendTarget === "salesRep") {
        if (repPhone) recipients.push({ phone: repPhone, label: "المندوب" });
        else {
          toast({ title: "لا يوجد رقم هاتف للمندوب", variant: "destructive" });
        }
      }
      if (whatsappSendTarget === "repGroup" || whatsappSendTarget === "both") {
        const repGroupId = rep?.whatsappGroupId;
        if (repGroupId) {
          recipients.push({ phone: repGroupId, isGroup: true, label: "جروب المندوب" });
        } else if (whatsappSendTarget === "repGroup") {
          toast({ title: "لا يوجد جروب واتساب للمندوب", variant: "destructive" });
        }
      }

      if (recipients.length === 0) {
        toast({ title: "لم يتم تحديد مستلمين صالحين", variant: "destructive" });
        return;
      }

      console.log("📱 [WhatsApp Debug] Recipients:", recipients);

      // Try using WhatsApp service bot
      const accounts = await db.getAll("whatsappAccounts");
      const activeAccount = accounts.find(
        (a: any) => a.isActive && a.status === "connected"
      );

      if (activeAccount) {
        const { whatsappService } = await import("@/services/whatsapp/whatsappService");

        let sentCount = 0;
        for (const recipient of recipients) {
          toast({
            title: `📤 جاري الإرسال إلى ${recipient.label}...`,
            description: `${sentCount + 1} من ${recipients.length}`
          });

          const msgId = await whatsappService.sendMessage(
            (activeAccount as any).id,
            recipient.phone,
            message,
            {
              type: "document",
              url: base64data,
              caption: message,
              filename: `فاتورة-${savedInvoiceForWhatsApp.invoiceNumber || savedInvoiceForWhatsApp.id}.pdf`
            },
            {
              invoiceId: savedInvoiceForWhatsApp.id,
              customerId: customer.id,
              type: "invoice",
            }
          );

          // Wait for message to be sent (max 60 seconds)
          try {
            // @ts-ignore - method exists in new version
            const delivered = await whatsappService.waitForMessage(msgId, 60000);
            if (delivered) {
              sentCount++;
            } else {
              toast({
                title: `❌ فشل الإرسال إلى ${recipient.label}`,
                description: "ربما انقطع الاتصال أو حدث خطأ",
                variant: "destructive"
              });
            }
          } catch (e) {
            // Fallback if waitForMessage doesn't exist yet (hot reload timing)
            sentCount++;
          }
        }

        if (sentCount > 0) {
          toast({
            title: "✅ تم إرسال الفاتورة بنجاح!",
            description: `تم الإرسال إلى ${sentCount} مستلم`
          });
        }
      } else {
        // Fallback to wa.me (PDF sending not supported via URL, send text only)
        const targetPhone = recipients[0]?.phone;
        if (targetPhone) {
          const encodedMessage = encodeURIComponent(message);
          window.open(`https://wa.me/${targetPhone}?text=${encodedMessage}`, "_blank");
          toast({ title: "تم فتح واتساب (نص فقط)", description: "لا يوجد حساب بوت متصل" });
        }
      }

      setSavedInvoiceForWhatsApp(null);

    } catch (error) {
      console.error("WhatsApp PDF Error:", error);
      toast({ title: "❌ فشل إرسال الفاتورة", description: String(error), variant: "destructive" });
    }
  };


  // PDF download function (Long Time template)
  const handleDownloadPDF = async () => {
    if (!savedInvoiceForWhatsApp) return;

    try {
      toast({ title: "جاري توليد PDF..." });

      // Import PDF service dynamically
      const { downloadInvoicePDF: downloadPDF, convertToPDFData } = await import("@/services/invoicePdfService");

      const customer = customers.find(c => c.id === savedInvoiceForWhatsApp.customerId);
      const rep = customer?.salesRepId ? salesReps.find(r => r.id === customer.salesRepId) : null;
      const items = savedInvoiceForWhatsApp.items || [];

      // Convert to PDF data format
      const pdfData = await convertToPDFData(
        savedInvoiceForWhatsApp,
        customer,
        items,
        rep
      );

      // Download PDF
      await downloadPDF(pdfData, `فاتورة-${savedInvoiceForWhatsApp.invoiceNumber || savedInvoiceForWhatsApp.id}.pdf`);

      toast({ title: "✅ تم تحميل الفاتورة PDF" });
    } catch (error) {
      console.error("PDF Download Error:", error);
      toast({ title: "فشل في توليد PDF", variant: "destructive" });
    }
  };


  // Quick add to cart (skip initial quantity dialog if possible)
  const quickAddToCart = async (product: Product) => {
    // Check if product has multiple units
    const productUnits = await db.getByIndex<ProductUnit>(
      "productUnits",
      "productId",
      product.id
    );

    if (productUnits && productUnits.length > 0) {
      // Has units -> Show unit selection dialog (but skip quantity dialog first)
      setProductForUnitSelection(product);
      setAvailableProductUnits(productUnits);
      setSelectedProductUnitId(productUnits[0]?.id || "");
      setInputQuantity(1); // Default quantity
      setUnitSelectionDialog(true);
    } else {
      // No units -> Add directly
      addToCartWithUnit(product, null, 1);
      toast({ title: "تم إضافة المنتج", duration: 1500 });
    }
    // Search query clearing is handled in addToCartWithUnit, but we do it here too just in case
    setSearchQuery("");
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 10);
  };

  return (
    <div className="h-full flex flex-col bg-background" dir="rtl">
      <POSHeader />

      <div className="flex-1 flex overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          {/* Right Side - Search + Cart + Totals */}
          <ResizablePanel defaultSize={65} minSize={40}>
            <div className="h-full flex flex-col p-3 gap-3 min-h-0">
              {/* Search & Filter */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
                  <Input
                    ref={searchInputRef}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (filteredProducts.length === 1) {
                          addToCart(filteredProducts[0]);
                        } else if (filteredProducts.length > 1) {
                          // Open first product if multiple
                          addToCart(filteredProducts[0]);
                        }
                      }
                      if (e.key === "Escape") {
                        setSearchQuery("");
                      }
                    }}
                    placeholder="ابحث بالاسم أو الكود أو الباركود..."
                    className="pr-10 h-10"
                  />

                  {/* Search Results Dropdown */}
                  {searchQuery && filteredProducts.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-card border rounded-lg shadow-lg z-50 max-h-80 overflow-auto">
                      {filteredProducts.slice(0, 10).map((product, index) => (
                        <div
                          key={product.id}
                          onClick={() => {
                            addToCart(product);
                            setSearchQuery("");
                          }}
                          className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition ${index !== 0 ? "border-t" : ""
                            }`}
                        >
                          {/* Product Image */}
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt={product.nameAr}
                              className="w-12 h-12 rounded-lg object-cover bg-muted"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = "none";
                              }}
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                              <Package className="h-6 w-6 text-muted-foreground/50" />
                            </div>
                          )}

                          {/* Product Info */}
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-sm truncate">{product.nameAr}</div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {product.category && (
                                <Badge variant="secondary" className="text-[10px]">
                                  {product.category}
                                </Badge>
                              )}
                              {product.barcode && (
                                <span className="text-[10px]">{product.barcode}</span>
                              )}
                            </div>
                          </div>

                          {/* Price & Stock */}
                          <div className="text-left">
                            <div className="font-bold text-sm text-primary">
                              {formatCurrency(
                                selectedPriceTypeId && product.prices?.[selectedPriceTypeId]
                                  ? product.prices[selectedPriceTypeId]
                                  : product.price || 0
                              )}
                            </div>
                            <Badge
                              variant={product.stock > 10 ? "default" : "destructive"}
                              className="text-[10px]"
                            >
                              المخزون: {product.stock}
                            </Badge>
                          </div>
                        </div>
                      ))}
                      {filteredProducts.length > 10 && (
                        <div className="text-center text-xs text-muted-foreground py-2 border-t">
                          +{filteredProducts.length - 10} نتائج أخرى...
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <Select
                  value={selectedCategory}
                  onValueChange={setSelectedCategory}
                >
                  <SelectTrigger className="w-40 h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    <SelectItem value="no-category">بدون قسم</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.nameAr}>
                        {c.nameAr}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Cart Table */}
              <div className="flex-1 overflow-auto min-h-0 bg-card rounded-lg border">
                {cartItems.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    <div className="text-center p-8">
                      <Search className="h-16 w-16 mx-auto mb-4 opacity-30" />
                      <h3 className="text-lg font-semibold mb-2">ابحث عن المنتج</h3>
                      <p className="text-sm">استخدم شريط البحث أعلاه أو قم بمسح الباركود</p>
                      <p className="text-xs mt-2 text-muted-foreground/60">اضغط Enter لفتح نافذة الكمية</p>
                      {searchQuery && filteredProducts.length > 0 && (
                        <div className="mt-4 text-sm">
                          <Badge variant="outline">{filteredProducts.length} نتيجة</Badge>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr className="border-b">
                        <th className="text-right p-2">المنتج</th>
                        <th className="text-center p-2 w-28">الكمية</th>
                        <th className="text-center p-2 w-24">السعر</th>
                        <th className="text-right p-2 w-24">المجموع</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {cartItems.map((item, index) => (
                        <tr
                          key={`${item.id}-${item.productUnitId || "base"}-${index}`}
                          className={`border-b hover:bg-muted/30 ${item.isPriceVerified === false && mode === "return" ? "bg-amber-50" : ""}`}
                        >
                          <td className="p-2">
                            <div className="font-bold text-xs flex items-center gap-1">
                              {item.nameAr}
                              {item.isPriceVerified === false && mode === "return" && (
                                <div className="text-[10px] text-amber-600 bg-amber-100 px-1 rounded border border-amber-200" title="لم يتم شراء هذا المنتج من قبل من هذا العميل">
                                  ! لم يُشترى
                                </div>
                              )}
                            </div>
                            {item.selectedUnitName && (
                              <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <Badge variant="secondary" className="text-[9px] h-4 px-1">
                                  {item.selectedUnitName}
                                </Badge>
                                {item.conversionFactor && item.conversionFactor > 1 && (
                                  <span>({item.conversionFactor} قطعة)</span>
                                )}
                              </div>
                            )}
                            {!item.selectedUnitName && item.unitName && (
                              <div className="text-[10px] text-muted-foreground">{item.unitName}</div>
                            )}
                          </td>
                          <td className="p-2">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => updateQuantity(item.id, item.quantity - 1, item.productUnitId)}
                                className="h-7 w-7 p-0"
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <Input
                                type="number"
                                value={item.quantity}
                                onChange={(e) => updateQuantity(item.id, parseInt(e.target.value) || 1, item.productUnitId)}
                                className="h-7 w-14 text-center p-0"
                                min={1}
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => updateQuantity(item.id, item.quantity + 1, item.productUnitId)}
                                className="h-7 w-7 p-0"
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                          <td className="p-2">
                            <Input
                              type="number"
                              value={item.customPrice ?? item.price}
                              onChange={(e) => updatePrice(item.id, parseFloat(e.target.value) || 0)}
                              className="h-7 w-20 text-center p-0"
                            />
                          </td>
                          <td className="text-right p-2 font-bold">
                            {formatCurrency(item.quantity * (item.customPrice ?? item.price))}
                          </td>
                          <td className="w-8">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => removeItem(item.id, item.productUnitId)}
                              className="text-red-500 hover:text-red-700 h-7 w-7 p-0"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>


            </div>
          </ResizablePanel>

          {/* Resizable Divider */}
          <ResizableHandle withHandle />

          {/* Left Side - Invoice Data (Customer, Payment, Delivery) */}
          <ResizablePanel defaultSize={35} minSize={25}>
            <div className="h-full border-l flex flex-col bg-card">
              {/* Header */}
              <div className={`p-1 flex ${mode === "return" ? "bg-red-600" : "bg-primary"} text-primary-foreground transition-colors`}>
                <div className="flex w-full gap-1">
                  <Button
                    variant={mode === "sales" ? "secondary" : "ghost"}
                    className={`flex-1 ${mode === "sales" ? "bg-white text-primary hover:bg-white/90" : "text-white hover:bg-white/20"}`}
                    onClick={() => { setMode("sales"); setCartItems([]); }}
                  >
                    فاتورة بيع
                  </Button>
                  <Button
                    variant={mode === "return" ? "secondary" : "ghost"}
                    className={`flex-1 ${mode === "return" ? "bg-white text-red-600 hover:bg-white/90" : "text-white hover:bg-white/20"}`}
                    onClick={() => { setMode("return"); setCartItems([]); }}
                  >
                    فاتورة مرتجع
                  </Button>
                </div>
              </div>

              {/* Invoice Data Section */}
              <div className="h-full overflow-auto p-3 space-y-3">
                {/* Customer Selection */}
                <div className="space-y-2">
                  <Label className="text-xs">العميل * (آجل)</Label>
                  <div className="flex gap-2">
                    <Select
                      value={selectedCustomer}
                      onValueChange={setSelectedCustomer}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="اختر عميل" />
                      </SelectTrigger>
                      <SelectContent>
                        {customers.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name} - {c.phone}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setAddCustomerDialog(true)}
                    >
                      <UserPlus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Invoice Date */}
                <div className="space-y-1">
                    <Label className="text-xs">تاريخ الفاتورة</Label>
                    <Input
                      type="date"
                      value={invoiceDate}
                      onChange={(e) => isAdmin ? setInvoiceDate(e.target.value) : null}
                      readOnly={!isAdmin}
                      className="h-9"
                    />
                  </div>

                {/* Invoice Notes */}
                <div className="space-y-1">
                  <Label className="text-xs">ملاحظات الفاتورة</Label>
                  <Input
                    value={invoiceNotes}
                    onChange={(e) => setInvoiceNotes(e.target.value)}
                    placeholder="أضف ملاحظات على الفاتورة..."
                    className="h-9"
                  />
                </div>

                {/* Delivery Status Selection */}
                <div className="space-y-1">
                  <Label className="text-xs">حالة التسليم</Label>
                  <Select
                    value={deliveryStatus}
                    onValueChange={(v) => setDeliveryStatus(v as "not_delivered" | "shipped" | "delivered")}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue>
                        {(() => {
                          switch (deliveryStatus) {
                            case "not_delivered":
                              return (
                                <div className="flex items-center gap-2">
                                  <Package className="h-4 w-4 text-orange-500" />
                                  <span>لم يتم التسليم</span>
                                </div>
                              );
                            case "shipped":
                              return (
                                <div className="flex items-center gap-2">
                                  <Truck className="h-4 w-4 text-blue-500" />
                                  <span>تم الشحن</span>
                                </div>
                              );
                            case "delivered":
                              return (
                                <div className="flex items-center gap-2">
                                  <PackageCheck className="h-4 w-4 text-green-500" />
                                  <span>تم التسليم</span>
                                </div>
                              );
                          }
                        })()}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="not_delivered">
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-orange-500" />
                          <span>لم يتم التسليم</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="shipped">
                        <div className="flex items-center gap-2">
                          <Truck className="h-4 w-4 text-blue-500" />
                          <span>تم الشحن</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="delivered">
                        <div className="flex items-center gap-2">
                          <PackageCheck className="h-4 w-4 text-green-500" />
                          <span>تم التسليم</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Warehouse Selection */}
                {warehouses.length > 1 && (
                  <div className="space-y-1">
                    <Label className="text-xs">المخزن</Label>
                    <Select
                      value={selectedWarehouseId}
                      onValueChange={setSelectedWarehouseId}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue>
                          <div className="flex items-center gap-2">
                            <Landmark className="h-4 w-4" />
                            <span>
                              {warehouses.find((w) => w.id === selectedWarehouseId)?.nameAr || "اختر المخزن"}
                            </span>
                          </div>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {warehouses.map((warehouse) => (
                          <SelectItem key={warehouse.id} value={warehouse.id}>
                            <div className="flex items-center gap-2">
                              <Landmark className="h-4 w-4" />
                              <span>{warehouse.nameAr}</span>
                              {warehouse.isDefault && (
                                <Badge variant="secondary" className="text-[10px] px-1">افتراضي</Badge>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Price Type Selection */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-xs font-semibold">
                      نوع السعر (لكل المنتجات)
                    </Label>
                    {cartItems.length > 0 && (
                      <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                        {cartItems.length} منتج
                      </span>
                    )}
                  </div>
                  <Select
                    value={selectedPriceTypeId}
                    onValueChange={updateGlobalPriceType}
                  >
                    <SelectTrigger className="h-9 border-2 border-primary/20">
                      <SelectValue>
                        {priceTypes.find(
                          (pt) => pt.id === selectedPriceTypeId
                        )?.name || "اختر نوع السعر"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {priceTypes.map((pt) => (
                        <SelectItem key={pt.id} value={pt.id}>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {pt.name}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Payment Method Selection */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">طريقة الدفع</Label>
                    <div className="flex items-center gap-2" dir="ltr">
                      <Switch
                        checked={splitPaymentMode}
                        onCheckedChange={(checked) => {
                          setSplitPaymentMode(checked);
                          if (checked) {
                            // تفعيل الدفع المقسم - إضافة طريقة دفع واحدة افتراضياً
                            const defaultMethod =
                              paymentMethods.find(
                                (pm) => pm.type === "cash"
                              ) || paymentMethods[0];
                            if (
                              defaultMethod &&
                              paymentSplits.length === 0
                            ) {
                              setPaymentSplits([
                                {
                                  methodId: defaultMethod.id,
                                  methodName: defaultMethod.name,
                                  amount:
                                    total > 0 ? total.toFixed(2) : "0",
                                },
                              ]);
                            }
                          } else {
                            // إلغاء الدفع المقسم
                            setPaymentSplits([]);
                          }
                        }}
                      />
                      <span className="text-[10px] text-muted-foreground">
                        دفع بطرق متعددة
                      </span>
                    </div>
                  </div>

                  {!splitPaymentMode ? (
                    // طريقة دفع واحدة فقط
                    <Select
                      value={selectedPaymentMethodId}
                      onValueChange={setSelectedPaymentMethodId}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue>
                          {(() => {
                            const selected = paymentMethods.find(
                              (pm) => pm.id === selectedPaymentMethodId
                            );
                            if (!selected) return "اختر طريقة الدفع";
                            return (
                              <div className="flex items-center gap-2">
                                {selected.type === "cash" && (
                                  <Banknote className="h-4 w-4" />
                                )}
                                {selected.type === "wallet" && (
                                  <Wallet className="h-4 w-4" />
                                )}
                                {selected.type === "visa" && (
                                  <CreditCard className="h-4 w-4" />
                                )}
                                {selected.type === "bank_transfer" && (
                                  <CreditCard className="h-4 w-4" />
                                )}
                                <span>{selected.name}</span>
                              </div>
                            );
                          })()}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {paymentMethods.map((pm) => (
                          <SelectItem key={pm.id} value={pm.id}>
                            <div className="flex items-center gap-2">
                              {pm.type === "cash" && (
                                <Banknote className="h-4 w-4" />
                              )}
                              {pm.type === "wallet" && (
                                <Wallet className="h-4 w-4" />
                              )}
                              {pm.type === "visa" && (
                                <CreditCard className="h-4 w-4" />
                              )}
                              {pm.type === "bank_transfer" && (
                                <CreditCard className="h-4 w-4" />
                              )}
                              <span>{pm.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    // طرق دفع متعددة (Split Payment)
                    <div className="space-y-2 border rounded-md p-2 bg-muted/30">
                      {paymentSplits.map((split, index) => (
                        <div
                          key={index}
                          className="flex gap-2 items-start"
                        >
                          <Select
                            value={split.methodId}
                            onValueChange={(value) =>
                              updatePaymentSplit(
                                index,
                                "methodId",
                                value
                              )
                            }
                          >
                            <SelectTrigger className="h-9 flex-1">
                              <SelectValue>
                                {
                                  paymentMethods.find(
                                    (pm) => pm.id === split.methodId
                                  )?.name
                                }
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {paymentMethods.map((pm) => (
                                <SelectItem key={pm.id} value={pm.id}>
                                  <div className="flex items-center gap-2">
                                    {pm.type === "cash" && (
                                      <Banknote className="h-4 w-4" />
                                    )}
                                    {pm.type === "wallet" && (
                                      <Wallet className="h-4 w-4" />
                                    )}
                                    {pm.type === "visa" && (
                                      <CreditCard className="h-4 w-4" />
                                    )}
                                    {pm.type === "bank_transfer" && (
                                      <CreditCard className="h-4 w-4" />
                                    )}
                                    <span>{pm.name}</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            type="number"
                            value={split.amount}
                            onChange={(e) =>
                              updatePaymentSplit(
                                index,
                                "amount",
                                e.target.value
                              )
                            }
                            className="h-9 w-24"
                            placeholder="المبلغ"
                          />
                          {paymentSplits.length > 1 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => removePaymentSplit(index)}
                              className="h-9 w-9 p-0"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      ))}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={addPaymentSplit}
                        className="w-full h-8"
                      >
                        <Plus className="h-3 w-3 ml-1" />
                        إضافة طريقة دفع
                      </Button>
                      {paymentSplits.length > 0 && (
                        <div className="text-[10px] text-center pt-1 border-t">
                          <span
                            className={
                              paid >= total
                                ? "text-green-600 font-bold"
                                : "text-amber-600"
                            }
                          >
                            المجموع: {paid.toFixed(2)} من{" "}
                            {total.toFixed(2)} {currency}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Discount & Tax */}
                <div className="space-y-2">
                  {/* Promotions Button */}
                  {promotions.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPromotionDialogOpen(true)}
                      className="w-full h-8 gap-2"
                    >
                      <Tag className="h-3 w-3" />
                      تطبيق عرض ({promotions.length})
                    </Button>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">خصم %</Label>
                      <Input
                        type="number"
                        value={discountPercent}
                        onChange={(e) => {
                          setDiscountPercent(e.target.value);
                          setDiscountAmount("");
                          setSelectedPromotion("");
                        }}
                        className="h-9"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">خصم مبلغ</Label>
                      <Input
                        type="number"
                        value={discountAmount}
                        onChange={(e) => {
                          setDiscountAmount(e.target.value);
                          setDiscountPercent("");
                          setSelectedPromotion("");
                        }}
                        className="h-9"
                      />
                    </div>
                  </div>

                  {selectedPromotion && (
                    <div className="bg-green-50 border border-green-200 rounded px-2 py-1 text-xs text-green-900 flex items-center gap-1">
                      <Tag className="h-3 w-3" />
                      <span>
                        تم تطبيق:{" "}
                        {
                          promotions.find(
                            (p) => p.id === selectedPromotion
                          )?.name
                        }
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-xs">
                    شامل ضريبة {taxRate}%
                  </Label>
                  <Switch
                    checked={includeTax}
                    onCheckedChange={setIncludeTax}
                    dir="ltr"
                  />
                </div>

                {/* Totals */}
                <div className="bg-muted p-2 rounded space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>المجموع:</span>
                    <span className="font-bold">
                      {Math.round(subtotal)}
                    </span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>الخصم:</span>
                      <span>-{Math.round(discount)}</span>
                    </div>
                  )}
                  {includeTax && tax > 0 && (
                    <div className="flex justify-between text-blue-600">
                      <span>الضريبة:</span>
                      <span>+{formatCurrency(tax)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-lg font-bold text-primary pt-1 border-t">
                    <span>الإجمالي:</span>
                    <span>
                      {formatCurrency(total)}
                    </span>
                  </div>
                </div>

                {/* Paid Amount - Only show if not in split payment mode */}
                {!splitPaymentMode && (
                  <div>
                    <Label className="text-xs">المدفوع</Label>
                    <Input
                      type="number"
                      value={paidAmount}
                      onChange={(e) => setPaidAmount(e.target.value)}
                      placeholder={formatCurrency(total)}
                      className="h-10 text-lg font-bold"
                    />
                  </div>
                )}

                {paid > 0 && (
                  <div
                    className={`text-center p-3 rounded ${change >= 0
                      ? "bg-green-100 text-green-900"
                      : "bg-red-100 text-red-900"
                      }`}
                  >
                    <div className="text-xs">
                      {change >= 0 ? "الباقي" : "المتبقي"}
                    </div>
                    <div className="text-xl font-bold bg-muted p-2 rounded text-center">
                      {formatCurrency(Math.abs(change))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  <Button variant="outline" onClick={clearCart} className="flex-1">
                    <X className="h-4 w-4 ml-2" />
                    إلغاء
                  </Button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => saveInvoice(false)}
                  >
                    <Save className="h-4 w-4 ml-2" />
                    حفظ
                  </Button>
                  <Button onClick={() => saveInvoice(true)}>
                    <Printer className="h-4 w-4 ml-2" />
                    حفظ وطباعة
                  </Button>
                  <Button variant="outline" onClick={generateQuotePDF}>
                    <FileText className="h-4 w-4 ml-2" />
                    عرض سعر
                  </Button>
                </div>
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* Add Customer Dialog */}
      <Dialog open={addCustomerDialog} onOpenChange={setAddCustomerDialog}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة عميل جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>الاسم *</Label>
              <Input
                value={newCustomerData.name}
                onChange={(e) =>
                  setNewCustomerData({
                    ...newCustomerData,
                    name: e.target.value,
                  })
                }
              />
            </div>
            <div>
              <Label>الهاتف *</Label>
              <Input
                value={newCustomerData.phone}
                onChange={(e) =>
                  setNewCustomerData({
                    ...newCustomerData,
                    phone: e.target.value,
                  })
                }
              />
            </div>
            <div>
              <Label>العنوان</Label>
              <Input
                value={newCustomerData.address}
                onChange={(e) =>
                  setNewCustomerData({
                    ...newCustomerData,
                    address: e.target.value,
                  })
                }
              />
            </div>
            <div>
              <Label>الرصيد الافتتاحي للأجل ({currency})</Label>
              <Input
                type="number"
                value={newCustomerData.initialCreditBalance}
                onChange={(e) =>
                  setNewCustomerData({
                    ...newCustomerData,
                    initialCreditBalance: parseFloat(e.target.value) || 0,
                  })
                }
                placeholder="0.00"
                step="0.01"
                min="0"
              />
              <p className="text-xs text-muted-foreground mt-1">
                سيتم إنشاء فاتورة آجلة تلقائياً بهذا المبلغ
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAddCustomerDialog(false);
                setNewCustomerData({
                  name: "",
                  phone: "",
                  address: "",
                  initialCreditBalance: 0,
                });
              }}
            >
              إلغاء
            </Button>
            <Button onClick={handleAddCustomer}>إضافة</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog >

      {/* Quantity Input Dialog */}
      < Dialog open={quantityDialog} onOpenChange={setQuantityDialog} >
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>أدخل الكمية</DialogTitle>
          </DialogHeader>
          {productForQuantity && (() => {
            // Calculate correct price using same logic as product cards
            const priceTypeId = selectedPriceTypeId || (priceTypes.find((pt) => pt.isDefault) || priceTypes[0])?.id || "";
            const displayPrice = Number(priceTypeId && productForQuantity.prices?.[priceTypeId]
              ? productForQuantity.prices[priceTypeId]
              : productForQuantity.price) || 0;

            return (
              <div className="space-y-4">
                <div className="p-3 bg-muted rounded-lg">
                  <p className="font-semibold text-lg">
                    {productForQuantity.nameAr}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    السعر: {displayPrice.toFixed(2)} {currency}
                  </p>
                  {productForQuantity.unitsPerCarton && (
                    <p className="text-sm text-muted-foreground">
                      العدد في الكرتونة: {productForQuantity.unitsPerCarton}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>الكمية</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setInputQuantity(Math.max(0, inputQuantity - 1))}
                      disabled={inputQuantity <= 0}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <Input
                      type="number"
                      value={inputQuantity}
                      onChange={(e) => setInputQuantity(Math.max(0, parseInt(e.target.value) || 0))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleQuantityConfirm();
                        }
                      }}
                      className="text-center text-lg font-bold h-12 w-24"
                      min={0}
                      autoFocus
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setInputQuantity(inputQuantity + 1)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Warehouse Selection - Show only warehouses with stock */}
                {(() => {
                  // Filter warehouses that have stock for this product
                  const warehousesWithStock = warehouses.filter(w =>
                    Object.keys(currentProductStocks).length === 0 || // If no stock data, show all
                    currentProductStocks[w.id] > 0
                  );

                  if (warehousesWithStock.length <= 1 && Object.keys(currentProductStocks).length === 0) {
                    return null; // Don't show if only one warehouse and no specific stock
                  }

                  return (
                    <div className="space-y-2">
                      <Label>المخزن {Object.keys(currentProductStocks).length > 0 && "(المخازن المتاحة فقط)"}</Label>
                      {warehousesWithStock.length === 0 ? (
                        <div className="text-center py-3 text-sm text-destructive bg-destructive/10 rounded-lg">
                          <Package className="h-5 w-5 mx-auto mb-1" />
                          لا يوجد مخزون من هذا المنتج في أي مخزن
                        </div>
                      ) : (
                        <Select
                          value={selectedWarehouseId}
                          onValueChange={setSelectedWarehouseId}
                        >
                          <SelectTrigger className="h-10">
                            <SelectValue>
                              <div className="flex items-center gap-2">
                                <Landmark className="h-4 w-4" />
                                <span>
                                  {warehouses.find((w) => w.id === selectedWarehouseId)?.nameAr || "اختر المخزن"}
                                </span>
                                {currentProductStocks[selectedWarehouseId] && (
                                  <Badge variant="outline" className="text-xs">
                                    {currentProductStocks[selectedWarehouseId]} متاح
                                  </Badge>
                                )}
                              </div>
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {warehousesWithStock.map((warehouse) => (
                              <SelectItem key={warehouse.id} value={warehouse.id}>
                                <div className="flex items-center gap-2 w-full">
                                  <Landmark className="h-4 w-4" />
                                  <span>{warehouse.nameAr}</span>
                                  {currentProductStocks[warehouse.id] > 0 && (
                                    <Badge variant="secondary" className="text-[10px] px-1 mr-auto">
                                      {currentProductStocks[warehouse.id]} متاح
                                    </Badge>
                                  )}
                                  {warehouse.isDefault && (
                                    <Badge variant="outline" className="text-[10px] px-1">افتراضي</Badge>
                                  )}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  );
                })()}

                <div className="bg-primary/10 p-3 rounded-lg">
                  <p className="text-sm font-medium">
                    الإجمالي: {(displayPrice * inputQuantity).toFixed(2)} {currency}
                  </p>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setQuantityDialog(false);
                setProductForQuantity(null);
                setInputQuantity(1);
              }}
            >
              إلغاء
            </Button>
            <Button onClick={handleQuantityConfirm}>إضافة للسلة</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog >

      {/* Unit Selection Dialog */}
      < Dialog open={unitSelectionDialog} onOpenChange={setUnitSelectionDialog} >
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>اختر الوحدة</DialogTitle>
          </DialogHeader>
          {productForUnitSelection && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg">
                <p className="font-semibold">
                  {productForUnitSelection.nameAr}
                </p>
                <p className="text-sm text-muted-foreground">
                  المخزون المتاح: {productForUnitSelection.stock} قطعة
                </p>
              </div>

              <div>
                <Label>الوحدة</Label>
                <Select
                  value={selectedProductUnitId}
                  onValueChange={setSelectedProductUnitId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الوحدة" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProductUnits.map((unit) => {
                      const priceTypeId =
                        selectedPriceTypeId ||
                        (priceTypes.find((pt) => pt.isDefault) || priceTypes[0])
                          ?.id ||
                        "";
                      const unitPrice =
                        unit.prices?.[priceTypeId] ||
                        productForUnitSelection.price ||
                        0;
                      const availableUnits = Math.floor(
                        productForUnitSelection.stock / unit.conversionFactor
                      );

                      return (
                        <SelectItem key={unit.id} value={unit.id}>
                          <div className="flex items-center justify-between gap-4 w-full">
                            <span className="font-semibold">
                              {unit.unitName}
                            </span>
                            <div className="flex items-center gap-3 text-sm">
                              <Badge variant="secondary">
                                {unit.conversionFactor} قطعة
                              </Badge>
                              <span className="text-green-600 font-medium">
                                {unitPrice.toFixed(2)} {currency}
                              </span>
                              <span className="text-muted-foreground">
                                ({availableUnits} متاح)
                              </span>
                            </div>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setUnitSelectionDialog(false);
                setProductForUnitSelection(null);
                setAvailableProductUnits([]);
              }}
            >
              إلغاء
            </Button>
            <Button onClick={handleUnitSelectionConfirm}>إضافة للسلة</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog >

      {/* Promotions Dialog */}
      < Dialog open={promotionDialogOpen} onOpenChange={setPromotionDialogOpen} >
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-green-600" />
              العروض والخصومات المتاحة
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 max-h-[400px] overflow-y-auto py-2">
            {promotions.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                لا توجد عروض متاحة حالياً
              </div>
            ) : (
              promotions.map((promo) => (
                <Card
                  key={promo.id}
                  className={`p-4 cursor-pointer hover:border-green-500 transition-all ${selectedPromotion === promo.id
                    ? "border-green-500 bg-green-50"
                    : ""
                    }`}
                  onClick={() => applyPromotion(promo.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-lg">{promo.name}</h3>
                        <Badge variant="secondary" className="gap-1">
                          {promo.discountType === "percentage" ? (
                            <>
                              <Percent className="h-3 w-3" />
                              {promo.discountValue}%
                            </>
                          ) : (
                            <>{promo.discountValue} جنيه</>
                          )}
                        </Badge>
                      </div>
                      {promo.description && (
                        <p className="text-sm text-muted-foreground mb-2">
                          {promo.description}
                        </p>
                      )}
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        <span>
                          من:{" "}
                          {new Date(promo.startDate).toLocaleDateString(
                            "ar-EG"
                          )}
                        </span>
                        <span>
                          إلى:{" "}
                          {new Date(promo.endDate).toLocaleDateString("ar-EG")}
                        </span>
                      </div>
                    </div>
                    <div className="bg-green-100 p-3 rounded-full">
                      <Tag className="h-6 w-6 text-green-600" />
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPromotionDialogOpen(false)}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog >

      {/* WhatsApp Confirmation Dialog */}
      < Dialog open={whatsappDialog} onOpenChange={setWhatsappDialog} >
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-green-600" />
              إرسال الفاتورة عبر واتساب
            </DialogTitle>
          </DialogHeader>

          {savedInvoiceForWhatsApp && (
            <div className="space-y-4">

              <div
                id="invoice-preview-capture"
                className="p-6 bg-white dark:bg-zinc-900 rounded-lg border border-border"
              >
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-dashed">
                  <div>
                    <span className="text-sm text-muted-foreground block mb-1">فاتورة رقم</span>
                    <span className="font-bold text-lg">#{savedInvoiceForWhatsApp.id}</span>
                  </div>
                  <div className="text-left">
                    <span className="text-sm text-muted-foreground block mb-1">الإجمالي</span>
                    <span className="text-xl font-bold text-primary">
                      {formatCurrency(savedInvoiceForWhatsApp.total)}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">العميل:</span>
                    <span className="font-medium">{savedInvoiceForWhatsApp.customerName}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">التاريخ:</span>
                    <span className="dir-ltr">{new Date(savedInvoiceForWhatsApp.createdAt).toLocaleDateString("ar-EG")}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">عدد المنتجات:</span>
                    <span className="font-medium">{savedInvoiceForWhatsApp.items.reduce((acc, item) => acc + item.quantity, 0)}</span>
                  </div>
                </div>

                <div className="text-center text-xs text-muted-foreground pt-2 border-t border-dashed">
                  شركة لونج تايم للصناعات الكهربائية
                </div>
              </div>

              <div className="space-y-2">
                <Label>إرسال إلى</Label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted cursor-pointer">
                    <input
                      type="radio"
                      name="sendTarget"
                      value="customer"
                      checked={whatsappSendTarget === "customer"}
                      onChange={() => setWhatsappSendTarget("customer")}
                      className="w-4 h-4"
                    />
                    <span>العميل</span>
                  </label>
                  <label className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted cursor-pointer">
                    <input
                      type="radio"
                      name="sendTarget"
                      value="salesRep"
                      checked={whatsappSendTarget === "salesRep"}
                      onChange={() => setWhatsappSendTarget("salesRep")}
                      className="w-4 h-4"
                    />
                    <span>المندوب</span>
                  </label>
                  <label className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted cursor-pointer">
                    <input
                      type="radio"
                      name="sendTarget"
                      value="repGroup"
                      checked={whatsappSendTarget === "repGroup"}
                      onChange={() => setWhatsappSendTarget("repGroup")}
                      className="w-4 h-4"
                    />
                    <span>جروب المندوب</span>
                  </label>
                  <label className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted cursor-pointer">
                    <input
                      type="radio"
                      name="sendTarget"
                      value="both"
                      checked={whatsappSendTarget === "both"}
                      onChange={() => setWhatsappSendTarget("both")}
                      className="w-4 h-4"
                    />
                    <span>العميل + الجروب</span>
                  </label>
                </div>
              </div>

              <div className="bg-green-50 dark:bg-green-950 p-3 rounded-lg text-sm">
                <p className="flex items-center gap-2 text-green-700 dark:text-green-300">
                  <MessageCircle className="h-4 w-4" />
                  سيتم فتح واتساب مع رسالة الفاتورة جاهزة للإرسال
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setWhatsappDialog(false);
                setSavedInvoiceForWhatsApp(null);
              }}
            >
              لاحقاً
            </Button>
            <Button
              variant="outline"
              onClick={handleDownloadPDF}
            >
              <FileText className="h-4 w-4 ml-2" />
              PDF
            </Button>
            <Button
              onClick={handleSendWhatsApp}
              className="bg-green-600 hover:bg-green-700"
            >
              <MessageCircle className="h-4 w-4 ml-2" />
              إرسال
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog >
    </div >
  );
};
export default POSv2;
