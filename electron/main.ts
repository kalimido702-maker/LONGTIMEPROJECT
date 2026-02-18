import { app, BrowserWindow, ipcMain, Menu, dialog } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import "./utils/crypto-polyfill.js"; // Must be imported BEFORE whatsappHandler
import { registerWhatsAppHandlers, setMainWindow } from "./handlers/whatsappHandler.js";
import {
  registerLicenseHandlers,
  verifyLicense,
} from "./handlers/licenseManager.js";
import {
  initAutoUpdater,
  registerAutoUpdaterHandlers,
} from "./handlers/autoUpdater.js";
import { registerPrinterHandlers } from "./handlers/printerHandler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// يمنع تشغيل أكثر من نسخة واحدة من التطبيق
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  let mainWindow: BrowserWindow | null = null;

  // تحديد مسارات الملفات بشكل صحيح
  if (app.isPackaged) {
    // في نسخة الـ release - dist موجود في Resources/dist
    process.env.DIST = path.join(process.resourcesPath, "dist");
    process.env.VITE_PUBLIC = path.join(process.resourcesPath);
  } else {
    // في بيئة التطوير
    process.env.DIST = path.join(__dirname, "../dist");
    process.env.VITE_PUBLIC = path.join(__dirname, "../public");
  }

  // تعطيل GPU Acceleration للـ Windows 7
  if (process.platform === "win32") {
    app.disableHardwareAcceleration();
  }

  // إعداد رابط التطبيق في بيئة التطوير
  if (!app.isPackaged) {
    app.setAsDefaultProtocolClient("masr-pos", process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  } else {
    app.setAsDefaultProtocolClient("masr-pos");
  }

  function createWindow() {
    // تحديد مسار الأيقونة بشكل صحيح
    let iconPath: string;
    if (app.isPackaged) {
      if (process.platform === "darwin") {
        iconPath = path.join(process.resourcesPath, "icon.icns");
      } else if (process.platform === "win32") {
        iconPath = path.join(process.resourcesPath, "icon.ico");
      } else {
        iconPath = path.join(process.resourcesPath, "icon.png");
      }
    } else {
      if (process.platform === "darwin") {
        iconPath = path.join(__dirname, "../public/icon.icns");
      } else if (process.platform === "win32") {
        iconPath = path.join(__dirname, "../public/icon.ico");
      } else {
        iconPath = path.join(__dirname, "../public/icon.png");
      }
    }

    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      title: "H-POS",
      icon: iconPath,
      webPreferences: {
        preload: path.join(__dirname, "preload.mjs"),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        webSecurity: !app.isPackaged, // تعطيل web security في packaged app
      },
      // cancel view and window and edit buttons
      titleBarStyle: "hiddenInset",
      titleBarOverlay: true,
      autoHideMenuBar: true,
    });

    // إخفاء القائمة الافتراضية
    mainWindow.setMenuBarVisibility(false);
    mainWindow.removeMenu();

    // إظهار Dev Tools في بيئة التطوير فقط
    if (!app.isPackaged) {
      mainWindow.webContents.openDevTools();
    }

    // تحميل التطبيق
    if (process.env.VITE_DEV_SERVER_URL) {
      mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else {
      // في نسخة الـ release
      if (app.isPackaged) {
        // المسار من Resources/dist/index.html
        const indexPath = path.join(
          process.resourcesPath,
          "dist",
          "index.html"
        );
        // استخدام file:// protocol بشكل صريح
        mainWindow.loadFile(indexPath).catch((err) => {
          console.error("Failed to load index.html:", err);
        });
      } else {
        // في بيئة التطوير
        const indexPath = path.join(process.env.DIST || "", "index.html");
        mainWindow.loadFile(indexPath).catch((err) => {
          console.error("Failed to load index.html:", err);
        });
      }
    }

    // معالجة إغلاق النافذة
    mainWindow.on("closed", () => {
      mainWindow = null;
    });
  }

  // عند استعداد التطبيق
  app.whenReady().then(() => {
    // Register License IPC handlers
    registerLicenseHandlers();
    // Register WhatsApp IPC handlers
    registerWhatsAppHandlers();
    // Register Auto-Update IPC handlers
    registerAutoUpdaterHandlers();
    // Register Printer IPC handlers
    registerPrinterHandlers();
    // Create main window
    createWindow();
    // Set main window reference for WhatsApp bot
    if (mainWindow) {
      setMainWindow(mainWindow);
    }
    // Initialize auto-updater with main window (only in production)
    if (mainWindow) {
      initAutoUpdater(mainWindow);
    }
  });

  // عند إغلاق جميع النوافذ
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  // عند تفعيل التطبيق (macOS)
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // عند محاولة فتح نسخة ثانية
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // ==================== IPC Handlers ====================

  // معلومات التطبيق
  ipcMain.handle("get-app-version", () => {
    return app.getVersion();
  });

  ipcMain.handle("get-app-path", () => {
    return app.getAppPath();
  });

  ipcMain.handle("get-user-data-path", () => {
    return app.getPath("userData");
  });


  // ==================== File Save Dialog ====================

  // Show save dialog and save file
  ipcMain.handle(
    "file:save-dialog",
    async (
      _event,
      options: { defaultPath: string; filters?: any[]; content: string }
    ) => {
      try {
        if (!mainWindow) {
          throw new Error("Main window not available");
        }

        const result = await dialog.showSaveDialog(mainWindow, {
          defaultPath: options.defaultPath,
          filters: options.filters || [
            { name: "Excel Files", extensions: ["xlsx"] },
            { name: "All Files", extensions: ["*"] },
          ],
        });

        if (result.canceled || !result.filePath) {
          return { success: false, canceled: true };
        }

        // Save the file
        fs.writeFileSync(result.filePath, options.content, "utf8");

        return {
          success: true,
          filePath: result.filePath,
          fileName: path.basename(result.filePath),
        };
      } catch (error: any) {
        console.error("Save file error:", error);
        return {
          success: false,
          error: error.message,
        };
      }
    }
  );

  // ==================== Print to PDF ====================
  ipcMain.handle(
    "print:to-pdf",
    async (_event, html: string) => {
      let pdfWindow: BrowserWindow | null = null;
      try {
        // Create a hidden BrowserWindow to render the HTML
        pdfWindow = new BrowserWindow({
          width: 794, // A4 width at 96 DPI
          height: 1123, // A4 height at 96 DPI
          show: false,
          webPreferences: {
            offscreen: true,
          },
        });

        // Load the HTML content
        await pdfWindow.loadURL(
          `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
        );

        // Wait for content to fully render (fonts, images, etc.)
        await new Promise((resolve) => setTimeout(resolve, 1500));

        // Generate PDF using the same engine as print
        const pdfBuffer = await pdfWindow.webContents.printToPDF({
          printBackground: true,
          preferCSSPageSize: true,
          margins: {
            marginType: "none",
          },
        });

        pdfWindow.close();
        pdfWindow = null;

        // Return as base64
        return {
          success: true,
          data: Buffer.from(pdfBuffer).toString("base64"),
        };
      } catch (error: any) {
        console.error("Print to PDF error:", error);
        if (pdfWindow) {
          pdfWindow.close();
        }
        return {
          success: false,
          error: error.message,
        };
      }
    }
  );
}
