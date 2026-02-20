import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";

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
async function generateQRCode(): Promise<string | null> {
    try {
        return await QRCode.toDataURL("https://longtimelt.com", {
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
 * Generate Long Time Invoice as HTML (for proper Arabic support)
 */
export async function generateInvoiceHTML(data: InvoicePDFData): Promise<string> {
    const logoBase64 = await loadLogoBase64();
    const qrCodeBase64 = await generateQRCode();

    const formatNum = (num: number | string | undefined | null, _minDecimals = 0, maxDecimals = 2): string => {
        if (num === undefined || num === null || num === "") return "";
        const n = Number(num);
        if (isNaN(n) || !isFinite(n)) return "0";
        // Ensure maxDecimals is a valid integer between 0 and 20
        const safeMaxDecimals = Math.max(0, Math.min(20, Math.floor(Number(maxDecimals) || 0)));
        // عرض الكسور فقط عندما تكون ذات معنى - بدون .00
        const hasDecimals = n % 1 !== 0;
        return n.toLocaleString("en-US", {
            minimumFractionDigits: hasDecimals ? Math.min(2, safeMaxDecimals) : 0,
            maximumFractionDigits: hasDecimals ? safeMaxDecimals : 0
        });
    };

    const itemsRows = data.items.map((item, index) => `
        <tr>
            <td class="col-index">${index + 1}</td>
            <td class="col-name">${item.productName || ""}</td>
            <td class="col-qty">${formatNum(item.quantity, 0, 0)}</td>
            <td class="col-unit">قطعة</td>
            <td class="col-price">${formatNum(item.price, 0, 2)}</td>
            <td class="col-total">${formatNum(item.total, 0, 2)}</td>
            <td class="col-spacer"></td>
            <td class="col-units">${item.unitsPerCarton ? formatNum(item.unitsPerCarton, 0, 0) : ""}</td>
        </tr>
    `).join("");

    return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${data.isReturn ? 'فاتورة مرتجعات' : 'فاتورة بيع'} رقم ${data.invoiceNumber}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
        
        @page {
            size: A4;
            margin: 0;
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        
        body {
            font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
            direction: rtl;
            background: #fff;
            color: #000;
            width: 210mm;
            min-height: 297mm;
            margin: 0 auto;
            position: relative;
        }
        
        .invoice-container {
            padding: 10mm 12mm 12mm 12mm;
        }
        
        /* ===== HEADER SECTION: Logo+Meta (Left) + Company+Customer (Right) ===== */
        .header-section {
            display: flex;
            flex-direction: row-reverse;
            align-items: flex-start;
            justify-content: space-between;
            margin-bottom: 10px;
        }

        .header-top {
            display: flex;
            flex-direction: column-reverse;
            align-items: flex-start;
            margin-bottom: 0;
        }
        
        .logo-section {
            text-align: left;
            margin-right: auto;
            margin-left: 0;
        }
        
        .logo-container {
            width: 150px;
        }
        
        .logo {
            width: 100%;
            height: auto;
        }
        
        /* ===== META TABLE (below logo) - no column borders ===== */
        .meta-section {
            margin-top: 15px;
        }
        
        .meta-table {
            border-collapse: collapse;
            width: 200px;
        }
        
        .meta-table th {
            background: #2d8a9e;
            color: white;
            padding: 5px 6px;
            font-size: 12px;
            font-weight: 600;
            text-align: center;
            border: none;
        }
        
        .meta-table td {
            background: #fff;
            padding: 5px 6px;
            font-size: 14px;
            font-weight: 700;
            text-align: center;
            border: none;
            border-bottom: 4px solid #2d8a9e;
        }
        
        /* ===== COMPANY NAME & INVOICE TYPE BAR ===== */
        .company-section {
            text-align: right;
            margin-bottom: 10px;
        }
        
        .company-name {
            font-size: 24px;
            font-weight: 800;
            color: #000;
        }
        
        .invoice-type-bar {
            background: #2d8a9e;
            color: white;
            display: block;
            padding: 4px 20px 4px 12px;
            font-size: 13px;
            font-weight: 600;
            margin-top: 4px;
        }
        
        /* ===== CUSTOMER SECTION ===== */
        .customer-section {
            margin-bottom: 8px;
            margin-top: 8px;
            text-align: right;
        }
        
        .customer-name {
            font-size: 18px;
            font-weight: 800;
            color: #000;
        }
        
        .customer-address {
            font-size: 14px;
            color: #333;
            font-weight: 600;
            margin-top: 3px;
        }
        
        /* ===== ITEMS TABLE ===== */
        .items-table-container {
            margin-bottom: 15px;
        }
        
        .items-table {
            width: 100%;
            border-collapse: collapse;
        }
        
        .items-table th {
            background: #2d8a9e;
            color: white;
            padding: 7px 4px;
            font-size: 13px;
            font-weight: 700;
            text-align: center;
            vertical-align: middle;
            border: 1px solid rgba(255,255,255,0.3);
            border-bottom: 2px solid #2d8a9e;
        }
        
        /* Outer borders for main table columns only */
        .items-table th.col-index { border-top: 2px solid #2d8a9e; }
        .items-table th.col-total { border-top: 2px solid #2d8a9e; }
        
        .items-table th.col-name {
            text-align: right;
            padding-right: 10px;
        }
        
        /* Fixed row height, bigger text, vertical centering */
        .items-table td {
            padding: 8px 4px;
            font-size: 14px;
            font-weight: 600;
            text-align: center;
            vertical-align: middle;
            color: #000;
            border: 1px solid #aaa;
            border-bottom: 1px solid #888;
        }
        
        .items-table td.col-name {
            text-align: right;
            padding-right: 10px;
            font-size: 13px;
        }
        
        .items-table td.col-index {
            font-weight: 700;
        }
        
        .items-table td.col-total {
            font-weight: 700;
        }
        
        /* Column widths */
        .col-index { width: 5%; }
        .col-name { width: 35%; }
        .col-qty { width: 8%; }
        .col-unit { width: 10%; }
        .col-price { width: 13%; }
        .col-total { width: 13%; }
        
        /* Main table outer border (right side = col-index, left side = col-total) */
        .items-table th.col-index,
        .items-table td.col-index {
            border-right: 2px solid #2d8a9e;
        }
        .items-table th.col-total,
        .items-table td.col-total {
            border-left: 2px solid #2d8a9e;
        }
        /* Top border for header */
        .items-table thead th.col-index,
        .items-table thead th.col-name,
        .items-table thead th.col-qty,
        .items-table thead th.col-unit,
        .items-table thead th.col-price,
        .items-table thead th.col-total {
            border-top: 2px solid #2d8a9e;
        }
        /* Bottom border for last row */
        .items-table tbody tr:last-child td.col-index,
        .items-table tbody tr:last-child td.col-name,
        .items-table tbody tr:last-child td.col-qty,
        .items-table tbody tr:last-child td.col-unit,
        .items-table tbody tr:last-child td.col-price,
        .items-table tbody tr:last-child td.col-total {
            border-bottom: 2px solid #2d8a9e;
        }
        
        /* Spacer column - completely invisible, no borders at all */
        .col-spacer {
            width: 5%;
            border: none !important;
            background: #fff !important;
            padding: 0 !important;
        }
        .items-table th.col-spacer {
            background: #fff !important;
            border: none !important;
        }
        .items-table td.col-spacer {
            border: none !important;
            background: #fff !important;
        }

        .items-table tbody tr {
            padding: 7px 4px;
            font-size: 13px;
            font-weight: 700;
            text-align: center;
            vertical-align: middle;
        }
        
        /* Carton column - separate visual block */
        .col-units { 
            width: 11%; 
        }
        .items-table th.col-units {
            border: 2px solid #2d8a9e;
            border-bottom: 2px solid #2d8a9e;
        }
        .items-table td.col-units {
            border-right: 2px solid #2d8a9e;
            border-left: 2px solid #2d8a9e;
            border-bottom: 1px solid #aaa;
        }
        .items-table tbody tr:last-child td.col-units {
            border-bottom: 2px solid #2d8a9e;
        }
        
        /* ===== FOOTER: QR (right) + Totals (left) ===== */
        .footer {
            display: flex;
            flex-direction: row;
            justify-content: space-between;
            align-items: flex-start;
            margin-top: 12px;
        }
        
        /* Totals on the LEFT side */
        .totals-block {
            width: 260px;
            order: 2;
        }
        
        .total-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 5px 0;
            font-size: 15px;
            font-weight: 700;
            border-bottom: 2px solid #000;
        }
        
        .total-row .amount {
            font-weight: 800;
        }
        
        /* QR on the RIGHT side with website link to its left */
        .qr-section {
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 12px;
            order: 1;
        }
        
        .site-url {
            font-size: 14px;
            font-weight: 700;
            color: #2d8a9e;
            text-decoration: none;
        }
        
        .qr-code {
            width: 110px;
            height: 110px;
        }
        
        /* ===== NOTES SECTION ===== */
        .notes-section {
            margin-top: 12px;
            padding: 8px 12px;
            border: 1.5px solid #2d8a9e;
            border-radius: 4px;
            text-align: right;
        }
        
        .notes-label {
            font-size: 13px;
            font-weight: 700;
            color: #2d8a9e;
            margin-bottom: 4px;
        }
        
        .notes-text {
            font-size: 14px;
            font-weight: 600;
            color: #333;
            line-height: 1.6;
            white-space: pre-wrap;
        }
        
    </style>
</head>
<body>
    <div class="invoice-container">
        <div class="header-section">
            <!-- Header Top: Logo (Left) + Meta Table (bottom) -->
            <div class="header-top">
                <div class="meta-section">
                    <table class="meta-table">
                        <thead>
                            <tr>
                                <th>رقم الفاتورة</th>
                                <th>التاريخ</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>${data.invoiceNumber}</td>
                                <td>${data.date}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                
                <div class="logo-section">
                    <div class="logo-container">
                        <img src="${logoBase64}" class="logo" alt="Long Time Logo">
                    </div>
                </div>
            </div>
            
            <!-- Company Name & Invoice Type Bar -->
            <div class="company-section">
                <div class="company-name">لونج تايم للصناعات الكهربائية</div>
                <div class="invoice-type-bar">${data.isReturn ? 'مرتجع من:' : 'فاتورة إلى:'}</div>
                <!-- Customer Section -->
                <div class="customer-section">
                    <div class="customer-name">السادة / ${data.customerName}</div>
                    ${data.customerAddress ? `<div class="customer-address">${data.customerAddress}</div>` : ''}
                </div>
            </div>
        </div>
        
        <!-- Items Table -->
        <div class="items-table-container">
            <table class="items-table">
                <thead>
                    <tr>
                        <th class="col-index">م</th>
                        <th class="col-name">اسم الصنف</th>
                        <th class="col-qty">الكمية</th>
                        <th class="col-unit">الوحدة</th>
                        <th class="col-price">الفئة</th>
                        <th class="col-total">الإجمالي</th>
                        <th class="col-spacer"></th>
                        <th class="col-units">العدد في<br>الكرتونة</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsRows}
                </tbody>
            </table>
        </div>
        
        <!-- Footer: QR (right) + Totals (left) -->
        <div class="footer">
            <div class="qr-section">
                ${qrCodeBase64
            ? `<img src="${qrCodeBase64}" class="qr-code" alt="QR Code">`
            : ''
        }
                <a href="https://longtimelt.com" class="site-url">longtimelt.com</a>
            </div>

            <div class="totals-block">
                ${(data.discount && Number(data.discount) > 0) ? `
                <div class="total-row">
                    <span>الإجمالي</span>
                    <span class="amount">${formatNum(data.subtotal, 0, 0)}</span>
                </div>
                <div class="total-row">
                    <span>الخصم</span>
                    <span class="amount">${formatNum(data.discount, 0, 0)}</span>
                </div>
                <div class="total-row">
                    <span>الإجمالي بعد الخصم</span>
                    <span class="amount">${formatNum(data.total, 0, 0)}</span>
                </div>
                ` : `
                <div class="total-row">
                    <span>الإجمالي</span>
                    <span class="amount">${formatNum(data.total, 0, 0)}</span>
                </div>
                `}
                
                ${data.previousBalance !== undefined ? `
                <div class="total-row">
                    <span>الرصيد السابق</span>
                    <span class="amount">${formatNum(data.previousBalance, 0, 0)}</span>
                </div>
                ` : ''}
                
                ${data.currentBalance !== undefined ? `
                <div class="total-row">
                    <span>الرصيد الحالي</span>
                    <span class="amount">${formatNum(data.currentBalance, 0, 0)}</span>
                </div>
                ` : ''}
            </div>
        </div>
        
        ${data.notes ? `
        <!-- Notes Section -->
        <div class="notes-section">
            <div class="notes-label">ملاحظات:</div>
            <div class="notes-text">${data.notes}</div>
        </div>
        ` : ''}
    </div>
</body>
</html>
    `.trim();
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
    link.download = filename || `invoice-${data.invoiceNumber}.pdf`;
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

            // جلب البونص
            let allBonuses: any[] = [];
            try {
                const saved = localStorage.getItem("pos-bonuses");
                if (saved) allBonuses = JSON.parse(saved);
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
