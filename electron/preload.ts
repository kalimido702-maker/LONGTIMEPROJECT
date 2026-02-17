import { contextBridge, ipcRenderer } from "electron";

// تعريض API آمنة للـ renderer process
contextBridge.exposeInMainWorld("electronAPI", {
  // معلومات التطبيق
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  getAppPath: () => ipcRenderer.invoke("get-app-path"),
  getUserDataPath: () => ipcRenderer.invoke("get-user-data-path"),

  // License APIs
  license: {
    getDeviceId: () => ipcRenderer.invoke("license:get-device-id"),
    getHardwareInfo: () => ipcRenderer.invoke("license:get-hardware-info"),
    verify: () => ipcRenderer.invoke("license:verify"),
    activate: (
      licenseKey: string,
      customerName?: string,
      expiryDate?: string
    ) =>
      ipcRenderer.invoke(
        "license:activate",
        licenseKey,
        customerName,
        expiryDate
      ),
    deactivate: (confirmationCode: string) =>
      ipcRenderer.invoke("license:deactivate", confirmationCode),
    getData: () => ipcRenderer.invoke("license:get-data"),
    generateKey: () => ipcRenderer.invoke("license:generate-key"),
    // NEW: Get sync credentials for API authentication
    getSyncCredentials: () => ipcRenderer.invoke("license:get-sync-credentials"),
  },

  // WhatsApp APIs
  whatsapp: {
    initAccount: (accountId: string, accountPhone: string) =>
      ipcRenderer.invoke("whatsapp:init-account", accountId, accountPhone),
    getState: (accountId: string) =>
      ipcRenderer.invoke("whatsapp:get-state", accountId),
    sendText: (accountId: string, to: string, message: string) =>
      ipcRenderer.invoke("whatsapp:send-text", accountId, to, message),
    sendMedia: (
      accountId: string,
      to: string,
      mediaUrl: string,
      mediaType: "image" | "document" | "video",
      caption?: string,
      filename?: string
    ) =>
      ipcRenderer.invoke(
        "whatsapp:send-media",
        accountId,
        to,
        mediaUrl,
        mediaType,
        caption,
        filename
      ),
    disconnect: (accountId: string) =>
      ipcRenderer.invoke("whatsapp:disconnect", accountId),
    isConnected: (accountId: string) =>
      ipcRenderer.invoke("whatsapp:is-connected", accountId),
    getGroups: (accountId: string) =>
      ipcRenderer.invoke("whatsapp:get-groups", accountId),
    // Bot APIs
    botSetEnabled: (enabled: boolean) =>
      ipcRenderer.invoke("whatsapp:bot-set-enabled", enabled),
    botReply: (accountId: string, to: string, message: string) =>
      ipcRenderer.invoke("whatsapp:bot-reply", accountId, to, message),
    botReplyWithMedia: (accountId: string, to: string, message: string, mediaBase64: string, filename: string) =>
      ipcRenderer.invoke("whatsapp:bot-reply-media", accountId, to, message, mediaBase64, filename),
    onBotIncoming: (callback: (data: { accountId: string; senderPhone: string; senderJid: string; messageText: string }) => void) => {
      ipcRenderer.on("whatsapp:bot-incoming", (_event, data) => callback(data));
    },
    removeBotIncomingListener: () => {
      ipcRenderer.removeAllListeners("whatsapp:bot-incoming");
    },
  },

  // File System APIs
  file: {
    saveDialog: (options: {
      defaultPath: string;
      filters?: any[];
      content: string;
    }) => ipcRenderer.invoke("file:save-dialog", options),
  },

  // Printer APIs
  printer: {
    getPrinters: () => ipcRenderer.invoke("printer:getPrinters"),
    print: (data: any[], options: any) =>
      ipcRenderer.invoke("printer:print", data, options),
  },

  // Auto-Updater APIs
  autoUpdater: {
    checkForUpdates: () => ipcRenderer.invoke("auto-updater:check"),
    installUpdate: () => ipcRenderer.invoke("auto-updater:install"),
    getVersion: () => ipcRenderer.invoke("auto-updater:get-version"),
    // Event listeners
    onUpdateAvailable: (callback: (info: { version: string; releaseDate: string }) => void) => {
      ipcRenderer.on("auto-updater:update-available", (_event, data) => callback(data));
    },
    onDownloadProgress: (callback: (progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void) => {
      ipcRenderer.on("auto-updater:update-download-progress", (_event, data) => callback(data));
    },
    onUpdateDownloaded: (callback: (info: { version: string; releaseDate: string }) => void) => {
      ipcRenderer.on("auto-updater:update-downloaded", (_event, data) => callback(data));
    },
    onError: (callback: (error: { message: string }) => void) => {
      ipcRenderer.on("auto-updater:update-error", (_event, data) => callback(data));
    },
    // Remove listeners
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners("auto-updater:update-available");
      ipcRenderer.removeAllListeners("auto-updater:update-download-progress");
      ipcRenderer.removeAllListeners("auto-updater:update-downloaded");
      ipcRenderer.removeAllListeners("auto-updater:update-error");
    },
  },
});

// تعريف الأنواع لـ TypeScript
declare global {
  interface Window {
    electronAPI: {
      getAppVersion: () => Promise<string>;
      getAppPath: () => Promise<string>;
      getUserDataPath: () => Promise<string>;
      license: {
        getDeviceId: () => Promise<string>;
        getHardwareInfo: () => Promise<{
          cpuId: string;
          macAddress: string;
          hostname: string;
          platform: string;
          diskSerial: string;
          username: string;
        }>;
        verify: () => Promise<{
          valid: boolean;
          message: string;
          data?: {
            licenseKey: string;
            deviceId: string;
            activationDate: string;
            expiryDate?: string;
            customerName?: string;
          };
        }>;
        activate: (
          licenseKey: string,
          customerName?: string,
          expiryDate?: string
        ) => Promise<{ success: boolean; message: string; deviceId?: string }>;
        deactivate: (
          confirmationCode: string
        ) => Promise<{ success: boolean; message: string }>;
        getData: () => Promise<{
          success: boolean;
          message?: string;
          data?: {
            licenseKey: string;
            deviceId: string;
            activationDate: string;
            expiryDate?: string;
            customerName?: string;
          };
        }>;
        generateKey: () => Promise<string | null>;
        // Sync credentials and settings for API auth
        getSyncCredentials: () => Promise<{
          success: boolean;
          // Credentials
          clientId?: string;
          branchId?: string;
          syncToken?: string;
          merchantName?: string;
          // Settings
          syncInterval?: number;
          enableSync?: boolean;
          enableOfflineMode?: boolean;
          autoUpdate?: boolean;
          // Error
          message?: string;
        }>;
      };
      whatsapp: {
        initAccount: (
          accountId: string,
          accountPhone: string
        ) => Promise<{ success: boolean; status: string; message: string }>;
        getState: (accountId: string) => Promise<{
          status: string;
          qrCode?: string;
          phone?: string;
          error?: string;
        }>;
        sendText: (
          accountId: string,
          to: string,
          message: string
        ) => Promise<{ success: boolean; message: string }>;
        sendMedia: (
          accountId: string,
          to: string,
          mediaUrl: string,
          mediaType: "image" | "document" | "video",
          caption?: string,
          filename?: string
        ) => Promise<{ success: boolean; message: string }>;
        disconnect: (
          accountId: string
        ) => Promise<{ success: boolean; message: string }>;
        isConnected: (accountId: string) => Promise<boolean>;
        getGroups: (accountId: string) => Promise<{
          success: boolean;
          groups?: { id: string; name: string }[];
          message?: string;
        }>;
      };
      file: {
        saveDialog: (options: {
          defaultPath: string;
          filters?: any[];
          content: string;
        }) => Promise<{
          success: boolean;
          canceled?: boolean;
          filePath?: string;
          fileName?: string;
          error?: string;
        }>;
      };
      printer: {
        getPrinters: () => Promise<
          Array<{
            name: string;
            displayName: string;
            description?: string;
            status: number;
            isDefault: boolean;
          }>
        >;
        print: (
          data: any[],
          options: any
        ) => Promise<{ success: boolean; error?: string }>;
      };
      autoUpdater: {
        checkForUpdates: () => Promise<boolean>;
        installUpdate: () => Promise<void>;
        getVersion: () => Promise<string>;
        onUpdateAvailable: (callback: (info: { version: string; releaseDate: string }) => void) => void;
        onDownloadProgress: (callback: (progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void) => void;
        onUpdateDownloaded: (callback: (info: { version: string; releaseDate: string }) => void) => void;
        onError: (callback: (error: { message: string }) => void) => void;
        removeAllListeners: () => void;
      };
    };
  }
}
