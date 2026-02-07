/**
 * Printer Handler
 * معالج IPC للطباعة - غير مستخدم حالياً (الطباعة تتم عبر window.print)
 */

import { ipcMain, BrowserWindow } from 'electron';

/**
 * تسجيل معالجات الطباعة
 */
export function registerPrinterHandlers(): void {
    // الحصول على قائمة الطابعات
    ipcMain.handle('printer:getPrinters', async () => {
        try {
            const win = BrowserWindow.getFocusedWindow();
            if (!win) {
                return [];
            }

            const printers = await win.webContents.getPrintersAsync();
            return printers.map(printer => ({
                name: printer.name,
                displayName: printer.displayName,
                description: printer.description,
                status: printer.status,
                isDefault: printer.isDefault,
            }));
        } catch (error) {
            console.error('Failed to get printers:', error);
            return [];
        }
    });
}

/**
 * إلغاء تسجيل معالجات الطباعة
 */
export function unregisterPrinterHandlers(): void {
    ipcMain.removeHandler('printer:getPrinters');
}
