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
    closeSocket: (accountId: string) =>
      ipcRenderer.invoke("whatsapp:close-socket", accountId),
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
    selectFolder: (defaultPath?: string) =>
      ipcRenderer.invoke("file:select-folder", defaultPath),
    saveToPath: (options: { filePath: string; content: string }) =>
      ipcRenderer.invoke("file:save-to-path", options),
  },

  // Printer APIs
  printer: {
    getPrinters: () => ipcRenderer.invoke("printer:getPrinters"),
    print: (data: any[], options: any) =>
      ipcRenderer.invoke("printer:print", data, options),
    printToPDF: (html: string) =>
      ipcRenderer.invoke("print:to-pdf", html),
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

  // Google Drive APIs
  drive: {
    saveCredentials: (credentials: { clientId: string; clientSecret: string }) =>
      ipcRenderer.invoke("drive:save-credentials", credentials),
    getCredentials: () =>
      ipcRenderer.invoke("drive:get-credentials"),
    authenticate: () =>
      ipcRenderer.invoke("drive:authenticate"),
    listAccounts: () =>
      ipcRenderer.invoke("drive:list-accounts"),
    toggleAccount: (accountId: string, enabled: boolean) =>
      ipcRenderer.invoke("drive:toggle-account", accountId, enabled),
    removeAccount: (accountId: string) =>
      ipcRenderer.invoke("drive:remove-account", accountId),
    uploadBackup: (options: { accountId: string; filename: string; content: string }) =>
      ipcRenderer.invoke("drive:upload-backup", options),
    uploadToAll: (options: { filename: string; content: string }) =>
      ipcRenderer.invoke("drive:upload-to-all", options),
    testConnection: (accountId: string) =>
      ipcRenderer.invoke("drive:test-connection", accountId),
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
        closeSocket: (
          accountId: string
        ) => Promise<{ success: boolean }>;
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
        selectFolder: (defaultPath?: string) => Promise<{
          success: boolean;
          canceled?: boolean;
          folderPath?: string;
          error?: string;
        }>;
        saveToPath: (options: {
          filePath: string;
          content: string;
        }) => Promise<{
          success: boolean;
          filePath?: string;
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
        printToPDF: (
          html: string
        ) => Promise<{ success: boolean; data?: string; error?: string }>;
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
      drive: {
        saveCredentials: (credentials: { clientId: string; clientSecret: string }) => Promise<{ success: boolean; error?: string }>;
        getCredentials: () => Promise<{ success: boolean; clientId?: string; clientSecret?: string; hasCredentials?: boolean; error?: string }>;
        authenticate: () => Promise<{ success: boolean; account?: { id: string; email: string; enabled: boolean }; error?: string }>;
        listAccounts: () => Promise<{ success: boolean; accounts: Array<{ id: string; email: string; enabled: boolean; lastUploadAt?: string }>; error?: string }>;
        toggleAccount: (accountId: string, enabled: boolean) => Promise<{ success: boolean; error?: string }>;
        removeAccount: (accountId: string) => Promise<{ success: boolean; error?: string }>;
        uploadBackup: (options: { accountId: string; filename: string; content: string }) => Promise<{ success: boolean; fileId?: string; fileName?: string; error?: string }>;
        uploadToAll: (options: { filename: string; content: string }) => Promise<{ success: boolean; results: Array<{ accountId: string; email: string; success: boolean; error?: string }>; error?: string }>;
        testConnection: (accountId: string) => Promise<{ success: boolean; message?: string; error?: string }>;
      };
    };
  }
}
