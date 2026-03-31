import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import { loadInvoiceTemplate } from "@/lib/invoiceTemplateConfig";
import { compileInvoiceTemplate } from "@/lib/invoiceTemplateEngine";

/**
 * Invoice data interface
 */
export interface InvoicePDFData {
    id: string;
    invoiceNumber: string;
    date: string;
    customerName: string;
    customerAddress?: string;
    salesRepName?: string;
    items: InvoiceItemData[];
    subtotal: number;
    total: number;
    discount?: number;
    previousBalance?: number;
    currentBalance?: number;
    isReturn?: boolean; // Flag for return invoice
    notes?: string; // ملاحظات الفاتورة
}

export interface InvoiceItemData {
    productName: string;
    productCode?: string;
    quantity: number;
    price: number;
    total: number;
    unitsPerCarton?: number;
}

/**
 * Load logo as base64 (always returns data: URL)
 */
async function loadLogoBase64(): Promise<string | null> {
    try {
        const logoModule = await import("@/assets/images/longtime-logo.png");
        const logoUrl = typeof logoModule.default === "string" ? logoModule.default : null;
        if (!logoUrl) return null;

        // If already a data: URL (base64), return as-is
        if (logoUrl.startsWith("data:")) {
            return logoUrl;
        }

        // Otherwise it's a file URL - fetch and convert to base64
        const response = await fetch(logoUrl);
        const blob = await response.blob();
        return await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error("Failed to load logo:", error);
        return null;
    }
}

/**
 * Generate QR code as base64
 */
async function generateQRCode(url?: string): Promise<string | null> {
    try {
        return await QRCode.toDataURL(url || "https://longtimelt.com", {
            width: 100,
            margin: 1,
            color: {
                dark: "#000000",
                light: "#ffffff",
            },
        });
    } catch (error) {
        console.error("Failed to generate QR code:", error);
        return null;
    }
}

/**
 * Generate Invoice as HTML using the user's saved Handlebars template
 * The user has full 360° control over the HTML/CSS layout via the template editor
 */
export async function generateInvoiceHTML(data: InvoicePDFData): Promise<string> {
    // Load the user's custom HTML template (or default)
    const templateHTML = await loadInvoiceTemplate();

    // Load logo and QR code to provide as template variables
    const logoBase64 = await loadLogoBase64();
    const qrCodeBase64 = await generateQRCode();

    // Compile the Handlebars template with the invoice data
    return compileInvoiceTemplate(templateHTML, {
        ...data,
        logoBase64,
        qrCodeBase64,
    });
}

/**
 * Generate PDF from HTML using Electron's printToPDF (same engine as print)
 * Falls back to html2canvas if not in Electron
 */
export async function generateInvoicePDF(data: InvoicePDFData): Promise<Blob> {
    const html = await generateInvoiceHTML(data);

    // Try Electron's printToPDF first (same rendering as print)
    if (window.electronAPI?.printer?.printToPDF) {
        try {
            console.log("[PDF] Using Electron printToPDF (native print engine)");
            const result = await window.electronAPI.printer.printToPDF(html);
            if (result.success && result.data) {
                // Convert base64 to Blob
                const byteCharacters = atob(result.data);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                return new Blob([byteArray], { type: "application/pdf" });
            }
            console.warn("[PDF] Electron printToPDF failed, falling back to html2canvas:", result.error);
        } catch (err) {
            console.warn("[PDF] Electron printToPDF error, falling back to html2canvas:", err);
        }
    }

    // Fallback: html2canvas + jsPDF
    console.log("[PDF] Using html2canvas fallback");
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "-9999px";
    iframe.style.top = "-9999px";
    iframe.style.width = "210mm";
    iframe.style.height = "297mm";
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) {
        document.body.removeChild(iframe);
        throw new Error("Failed to create iframe document");
    }

    iframeDoc.open();
    iframeDoc.write(html);
    iframeDoc.close();

    await new Promise(resolve => setTimeout(resolve, 500));

    try {
        const { default: html2canvas } = await import("html2canvas");

        const canvas = await html2canvas(iframeDoc.body, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: "#ffffff",
        });

        document.body.removeChild(iframe);

        const imgData = canvas.toDataURL("image/png");
        const pdf = new jsPDF({
            orientation: "portrait",
            unit: "mm",
            format: "a4",
        });

        const imgWidth = 210;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);

        return pdf.output("blob");
    } catch (error) {
        document.body.removeChild(iframe);
        console.error("PDF generation error:", error);
        throw error;
    }
}

/**
 * Download PDF directly
 */
export async function downloadInvoicePDF(
    data: InvoicePDFData,
    filename?: string
): Promise<void> {
    const blob = await generateInvoicePDF(data);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename || `${data.customerName || 'عميل'} - ${data.invoiceNumber}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Print invoice directly
 */
export async function printInvoice(data: InvoicePDFData): Promise<void> {
    const html = await generateInvoiceHTML(data);

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
        throw new Error("Could not open print window");
    }

    printWindow.document.write(html);
    printWindow.document.close();

    printWindow.onload = () => {
        printWindow.print();
        setTimeout(() => printWindow.close(), 500);
    };
}

/**
 * Convert invoice from POS format to PDF format
 * حساب الأرصدة يتم الآن بشكل فعلي من الحركات بدلاً من التخمين
 */
export async function convertToPDFData(
    invoice: any,
    customer: any,
    items: any[],
    salesRep?: any
): Promise<InvoicePDFData> {
    const invoiceTotal = Number(invoice.total) || 0;
    const invoiceDiscount = Number(invoice.discount || invoice.discountAmount) || 0;

    // حساب الرصيد الفعلي قبل وبعد هذه الفاتورة من كشف الحساب
    let prevBalance: number | undefined = undefined;
    let currBalance: number | undefined = undefined;

    if (customer?.id) {
        try {
            const { db } = await import("@/shared/lib/indexedDB");

            // جلب بيانات العميل الأحدث من IndexedDB مباشرة
            const freshCustomer = await db.get<any>("customers", customer.id);
            const customerData = freshCustomer || customer;
            const custId = String(customer.id);

            // الرصيد الافتتاحي
            const openingBalance = Number(customerData.previousStatement) || 0;
            
            console.log("[convertToPDFData] Customer:", customerData.name, "| id:", custId, "| previousStatement:", customerData.previousStatement, "| openingBalance:", openingBalance);

            // جلب كل الحركات
            const [allInvoices, allPayments, allReturns] = await Promise.all([
                db.getAll<any>("invoices"),
                db.getAll<any>("payments"),
                db.getAll<any>("salesReturns"),
            ]);

            // جلب البونص من IndexedDB
            let allBonuses: any[] = [];
            try {
                allBonuses = await db.getAll<any>("customerBonuses");
                // Fallback from localStorage
                const saved = localStorage.getItem("pos-bonuses");
                if (saved) {
                    const oldBonuses = JSON.parse(saved);
                    const existingIds = new Set(allBonuses.map((b: any) => b.id));
                    const missing = oldBonuses.filter((b: any) => !existingIds.has(b.id));
                    if (missing.length > 0) allBonuses = [...allBonuses, ...missing];
                }
            } catch { /* ignore */ }

            // تجميع كل الحركات مع أنواعها - استخدام String() للمقارنة الآمنة
            interface Movement { date: Date; type: string; amount: number; id: string; }
            const movements: Movement[] = [];

            allInvoices
                .filter((inv: any) => String(inv.customerId) === custId)
                .forEach((inv: any) => {
                    movements.push({
                        date: new Date(inv.createdAt),
                        type: "debit",
                        amount: Number(inv.total) || 0,
                        id: String(inv.id),
                    });
                });

            allPayments
                .filter((pay: any) => String(pay.customerId) === custId)
                .forEach((pay: any) => {
                    movements.push({
                        date: new Date(pay.createdAt),
                        type: "credit",
                        amount: Number(pay.amount) || 0,
                        id: String(pay.id),
                    });
                });

            allReturns
                .filter((ret: any) => String(ret.customerId) === custId)
                .forEach((ret: any) => {
                    movements.push({
                        date: new Date(ret.createdAt),
                        type: "credit",
                        amount: Number(ret.total || ret.amount) || 0,
                        id: String(ret.id),
                    });
                });

            allBonuses
                .filter((b: any) => String(b.customerId) === custId)
                .forEach((b: any) => {
                    movements.push({
                        date: new Date(b.createdAt),
                        type: "credit",
                        amount: Number(b.bonusAmount || b.amount) || 0,
                        id: String(b.id),
                    });
                });

            // ترتيب حسب التاريخ
            movements.sort((a, b) => a.date.getTime() - b.date.getTime());
            
            console.log("[convertToPDFData] Total movements for customer:", movements.length, "| Invoice ID:", String(invoice.id));
            movements.forEach((m, i) => console.log(`  [${i}] ${m.type} | ${m.amount} | id: ${m.id} | date: ${m.date.toISOString()}`));

            // حساب الرصيد التراكمي حتى ما قبل هذه الفاتورة
            const invoiceIdStr = String(invoice.id);
            let runningBalance = openingBalance;
            let foundInvoice = false;

            for (const mov of movements) {
                if (mov.id === invoiceIdStr) {
                    // هذه هي الفاتورة المطلوبة - الرصيد قبلها
                    prevBalance = runningBalance;
                    // تطبيق هذه الفاتورة
                    if (mov.type === "debit") {
                        runningBalance += mov.amount;
                    } else {
                        runningBalance -= mov.amount;
                    }
                    currBalance = runningBalance;
                    foundInvoice = true;
                    break;
                }
                // تطبيق الحركة
                if (mov.type === "debit") {
                    runningBalance += mov.amount;
                } else {
                    runningBalance -= mov.amount;
                }
            }

            // لو الفاتورة مش موجودة في الحركات (جديدة لسه مترفعتش)
            if (!foundInvoice) {
                prevBalance = runningBalance;
                currBalance = runningBalance + invoiceTotal;
            }
            
            console.log("[convertToPDFData] foundInvoice:", foundInvoice, "| prevBalance:", prevBalance, "| currBalance:", currBalance);
        } catch (error) {
            console.error("Error calculating invoice balances:", error);
            // fallback: استخدام currentBalance إذا متاح
            const cb = Number(customer.currentBalance);
            if (!isNaN(cb)) {
                currBalance = cb;
                prevBalance = cb - invoiceTotal;
            }
        }
    }

    // جلب بيانات المنتجات لـ unitsPerCarton
    let productsMap: Record<string, any> = {};
    try {
        const { db: dbInstance } = await import("@/shared/lib/indexedDB");
        const allProducts = await dbInstance.getAll<any>("products");
        allProducts.forEach((p: any) => {
            productsMap[p.id] = p;
        });
    } catch (e) {
        console.error("Error loading products for PDF:", e);
    }

    return {
        id: invoice.id || "",
        invoiceNumber: invoice.invoiceNumber || invoice.id || "",
        date: new Date(invoice.createdAt || Date.now()).toLocaleDateString("ar-EG"),
        customerName: customer?.name || invoice.customerName || "عميل",
        customerAddress: customer?.address || "",
        salesRepName: salesRep?.name,
        notes: invoice.notes || undefined,
        items: (items || []).map((item) => {
            const qty = Number(item.quantity) || 0;
            const price = Number(item.price || item.unitPrice) || 0;
            const total = Number(item.total) || (qty * price);
            // Look up unitsPerCarton from the product if not on the item
            const productData = productsMap[item.productId || item.id] || {};
            const upc = item.unitsPerCarton ? Number(item.unitsPerCarton) : (productData.unitsPerCarton ? Number(productData.unitsPerCarton) : undefined);
            return {
                productName: item.productName || item.name || "-",
                productCode: item.productCode || item.sku || item.barcode || "-",
                quantity: qty,
                price: price,
                total: total,
                unitsPerCarton: upc,
            };
        }),
        subtotal: Number(invoice.subtotal) || (invoiceTotal + invoiceDiscount),
        total: invoiceTotal,
        discount: invoiceDiscount,
        previousBalance: prevBalance,
        currentBalance: currBalance,
    };
}
