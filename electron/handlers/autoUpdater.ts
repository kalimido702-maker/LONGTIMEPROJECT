/**
 * Auto-Updater Module
 * Handles automatic app updates using electron-updater
 */

import { app, ipcMain, BrowserWindow, dialog } from "electron";
import { autoUpdater } from "electron-updater";

// Configure logger
autoUpdater.logger = console;

// Configure auto-update settings
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

// Disable differential download to avoid blockmap errors and temp file path issues
autoUpdater.disableDifferentialDownload = true;

let mainWindow: BrowserWindow | null = null;

/**
 * Initialize auto-updater
 */
export function initAutoUpdater(window: BrowserWindow, backendUrl?: string) {
    mainWindow = window;

    // Only enable in production
    if (!app.isPackaged) {
        console.log("[AutoUpdater] Skipping in development mode");
        return;
    }

    // Get backend URL from parameter or environment
    const updateServerUrl = backendUrl || process.env.UPDATE_SERVER_URL || "http://13coffee.net:3030";

    // Configure update feed URL - Backend API (generic provider)
    // The backend serves /api/updates/latest.yml which auto-detects platform from User-Agent
    autoUpdater.setFeedURL({
        provider: "generic",
        url: `${updateServerUrl}/api/updates`,
        useMultipleRangeRequest: false,
    });

    console.log(`[AutoUpdater] Configured with server: ${updateServerUrl}/api/updates`);

    setupEventHandlers();


    // Check for updates after app is ready
    setTimeout(() => {
        checkForUpdates();
    }, 5000); // Wait 5 seconds after startup
}

/**
 * Setup auto-updater event handlers
 */
function setupEventHandlers() {
    autoUpdater.on("checking-for-update", () => {
        console.log("[AutoUpdater] Checking for updates...");
        sendToRenderer("update-checking", {});
    });

    autoUpdater.on("update-available", (info: { version: string; releaseDate: string }) => {
        console.log("[AutoUpdater] Update available:", info.version);
        sendToRenderer("update-available", {
            version: info.version,
            releaseDate: info.releaseDate,
        });
    });

    autoUpdater.on("update-not-available", (info: { version: string }) => {
        console.log("[AutoUpdater] App is up to date:", info.version);
        sendToRenderer("update-not-available", {
            version: info.version,
        });
    });

    autoUpdater.on("download-progress", (progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => {
        console.log(`[AutoUpdater] Download progress: ${progress.percent.toFixed(2)}%`);
        sendToRenderer("update-download-progress", {
            percent: progress.percent,
            bytesPerSecond: progress.bytesPerSecond,
            transferred: progress.transferred,
            total: progress.total,
        });
    });

    autoUpdater.on("update-downloaded", (info: { version: string; releaseDate: string }) => {
        console.log("[AutoUpdater] Update downloaded:", info.version);
        sendToRenderer("update-downloaded", {
            version: info.version,
            releaseDate: info.releaseDate,
        });

        // Show dialog to user
        if (mainWindow) {
            dialog
                .showMessageBox(mainWindow, {
                    type: "info",
                    title: "تحديث جاهز",
                    message: `تم تحميل إصدار جديد (${info.version})`,
                    detail: "هل تريد إعادة تشغيل التطبيق الآن لتثبيت التحديث؟",
                    buttons: ["إعادة التشغيل الآن", "لاحقاً"],
                    defaultId: 0,
                    cancelId: 1,
                })
                .then((result) => {
                    if (result.response === 0) {
                        autoUpdater.quitAndInstall(false, true);
                    }
                });
        }
    });

    autoUpdater.on("error", (error: Error) => {
        // Ignore 404 errors (update file not found) - commonly happens if no update is published yet
        if (error.message.includes("404") || error.message.includes("Cannot find channel")) {
            console.log("[AutoUpdater] Update check failed (404/Missing):", error.message);
            return;
        }

        console.error("[AutoUpdater] Error:", error);
        sendToRenderer("update-error", {
            message: error.message,
        });
    });
}

/**
 * Send message to renderer process
 */
function sendToRenderer(channel: string, data: any) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(`auto-updater:${channel}`, data);
    }
}

/**
 * Check for updates
 */
export async function checkForUpdates(): Promise<boolean> {
    if (!app.isPackaged) {
        console.log("[AutoUpdater] Skipping check in development mode");
        return false;
    }

    try {
        const result = await autoUpdater.checkForUpdates();
        return result !== null;
    } catch (error) {
        console.error("[AutoUpdater] Check failed:", error);
        return false;
    }
}

/**
 * Register IPC handlers for auto-updater
 */
export function registerAutoUpdaterHandlers() {
    // Check for updates manually
    ipcMain.handle("auto-updater:check", async () => {
        return await checkForUpdates();
    });

    // Quit and install
    ipcMain.handle("auto-updater:install", () => {
        autoUpdater.quitAndInstall(false, true);
    });

    // Get current version
    ipcMain.handle("auto-updater:get-version", () => {
        return app.getVersion();
    });
}
