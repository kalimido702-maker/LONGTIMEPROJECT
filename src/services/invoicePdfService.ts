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
    total: number;
    discount?: number;
    previousBalance?: number;
    currentBalance?: number;
    isReturn?: boolean; // Flag for return invoice
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
 * Load logo as base64
 */
async function loadLogoBase64(): Promise<string | null> {
    try {
        const logoModule = await import("@/assets/images/longtime-logo.png");
        if (typeof logoModule.default === "string") {
            return logoModule.default;
        }
        return null;
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

    const formatNum = (num: number | undefined | null, minDecimals = 0, maxDecimals = 2): string => {
        if (num === undefined || num === null) return "";
        return (num).toLocaleString("en-US", {
            minimumFractionDigits: minDecimals,
            maximumFractionDigits: maxDecimals
        });
    };

    const itemsRows = data.items.map((item, index) => `
        <tr>
            <td class="col-index">${index + 1}</td>
            <td class="col-name">${item.productName || ""}</td>
            <td class="col-qty">${formatNum(item.quantity, 0, 0)}</td>
            <td class="col-unit">قطعة</td>
            <td class="col-price">${formatNum(item.price, 2, 2)}</td>
            <td class="col-total">${formatNum(item.total, 2, 2)}</td>
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
        
        /* ===== HEADER: Logo (Right) + Meta Table (Left) ===== */
        .header-top {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            margin-bottom: 0;
            flex-direction: column-reverse;
        }
        
        .logo-section {
            text-align: right;
        }
        
        .logo-container {
            width: 110px;
        }
        
        .logo {
            width: 100%;
            height: auto;
        }
        
        .meta-section {
            margin-top: 25px;
        }
        
        .meta-table {
            border-collapse: collapse;
            width: 200px;
        }
        
        .meta-table th {
            background: #2d8a9e;
            color: white;
            padding: 5px 6px;
            font-size: 10px;
            font-weight: 600;
            text-align: center;
            border: none;
        }
        
        .meta-table td {
            background: #fff;
            padding: 5px 6px;
            font-size: 12px;
            font-weight: 700;
            text-align: center;
            border: 2px solid #2d8a9e;
            border-top: none;
        }
        
        /* ===== COMPANY NAME & INVOICE TYPE BAR (Right Side) ===== */
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
            display: inline-block;
            padding: 3px 20px 3px 12px;
            font-size: 10px;
            font-weight: 600;
            margin-top: 4px;
        }
        
        /* ===== CUSTOMER SECTION ===== */
        .customer-section {
            margin-bottom: 15px;
            text-align: right;
        }
        
        .customer-name {
            font-size: 16px;
            font-weight: 800;
            color: #000;
        }
        
        .customer-address {
            font-size: 12px;
            color: #333;
            font-weight: 600;
            margin-top: 2px;
        }
        
        /* ===== ITEMS TABLE ===== */
        .items-table-container {
            margin-bottom: 15px;
        }
        
        .items-table {
            width: 100%;
            border-collapse: collapse;
            border: 2px solid #2d8a9e;
        }
        
        .items-table th {
            background: #2d8a9e;
            color: white;
            padding: 6px 3px;
            font-size: 10px;
            font-weight: 700;
            text-align: center;
            border: 1px solid rgba(255,255,255,0.3);
            border-bottom: 2px solid #2d8a9e;
        }
        
        .items-table th.col-name {
            text-align: right;
            padding-right: 8px;
        }
        
        .items-table td {
            padding: 5px 3px;
            font-size: 11px;
            text-align: center;
            vertical-align: middle;
            color: #000;
            border: 1px solid #aaa;
            border-bottom: 1px solid #888;
        }
        
        .items-table td.col-name {
            text-align: right;
            padding-right: 8px;
            font-size: 10px;
        }
        
        .items-table td.col-index {
            font-weight: 700;
        }
        
        .items-table td.col-total {
            font-weight: 600;
        }
        
        /* Column widths - adjusted after removing code column */
        .col-index { width: 5%; }
        .col-name { width: 38%; }
        .col-qty { width: 8%; }
        .col-unit { width: 10%; }
        .col-price { width: 14%; }
        .col-total { width: 14%; }
        .col-units { width: 11%; }
        
        .footer {
            display: flex;
            flex-direction: row;
            justify-content: space-between;
            align-items: flex-start;
            margin-top: 10px;
        }
        
        .totals-block {
            width: 260px;
        }
        
        .total-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 5px 0;
            font-size: 13px;
            font-weight: 700;
            border-bottom: 2px solid #000;
        }
        
        .total-row .amount {
            font-weight: 800;
        }
        
        .qr-section {
            text-align: center;
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        
        .site-url {
            font-size: 12px;
            font-weight: 700;
            color: #000;
            margin-bottom: 4px;
        }
        
        .qr-code {
            width: 50px;
            height: 50px;
        }

        .header-section {
            display: flex;
            flex-direction: row-reverse;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 10px;
        }

        /*col-units should sperated column so should have space from right between the ful  l width of the table*/
        .col-units {
            width: 14%;
            border-left: 1px solid #aaa;
            border-right: 1px solid #aaa;
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
                        <th class="col-units">العدد في<br>الكرتونة</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsRows}
                </tbody>
            </table>
        </div>
        
        <!-- Footer -->
        <div class="footer">
            <div class="totals-block">
                <div class="total-row">
                    <span>الإجمالي</span>
                    <span class="amount">${formatNum(data.total, 0, 0)}</span>
                </div>
                
                ${(data.discount && data.discount > 0) ? `
                <div class="total-row">
                    <span>الخصم</span>
                    <span class="amount">${formatNum(data.discount, 0, 0)}</span>
                </div>
                <div class="total-row">
                    <span>الإجمالي بعد الخصم</span>
                    <span class="amount">${formatNum(data.total - data.discount, 0, 0)}</span>
                </div>
                ` : ''}
                
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
            
            <div class="qr-section">
                ${qrCodeBase64
            ? `<img src="${qrCodeBase64}" class="qr-code" alt="QR Code">`
            : ''
        }
            </div>
        </div>
    </div>
</body>
</html>
    `.trim();
}

/**
 * Generate PDF from HTML using browser print
 */
export async function generateInvoicePDF(data: InvoicePDFData): Promise<Blob> {
    const html = await generateInvoiceHTML(data);

    // Create hidden iframe for printing
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

    // Wait for images to load
    await new Promise(resolve => setTimeout(resolve, 500));

    // Use html2canvas + jsPDF for actual PDF generation
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
 */
export function convertToPDFData(
    invoice: any,
    customer: any,
    items: any[],
    salesRep?: any
): InvoicePDFData {
    const invoiceTotal = invoice.total || 0;
    const invoiceDiscount = invoice.discount || invoice.discountAmount || 0;
    const prevBalance = customer?.currentBalance !== undefined ? (customer.currentBalance - invoiceTotal + (invoice.paidAmount || 0)) : undefined;
    const currBalance = customer?.currentBalance !== undefined ? customer.currentBalance : undefined;

    return {
        id: invoice.id || "",
        invoiceNumber: invoice.invoiceNumber || invoice.id || "",
        date: new Date(invoice.createdAt || Date.now()).toLocaleDateString("ar-EG"),
        customerName: customer?.name || invoice.customerName || "عميل",
        customerAddress: customer?.address || "",
        salesRepName: salesRep?.name,
        items: (items || []).map((item) => {
            const qty = item.quantity || 0;
            const price = item.price || item.unitPrice || 0;
            const total = item.total || (qty * price);
            return {
                productName: item.productName || item.name || "-",
                productCode: item.productCode || item.sku || item.barcode || "-",
                quantity: qty,
                price: price,
                total: total,
                unitsPerCarton: item.unitsPerCarton,
            };
        }),
        total: invoiceTotal,
        discount: invoiceDiscount,
        previousBalance: prevBalance,
        currentBalance: currBalance,
    };
}
