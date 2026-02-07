// Electron API Types
declare global {
  interface Window {
    electronAPI: {
      getAppVersion: () => Promise<string>;
      getAppPath: () => Promise<string>;
      getUserDataPath: () => Promise<string>;
      getDatabasePath: () => Promise<string>;
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
        // Sync credentials for API authentication
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
      };
      products: any;
      customers: any;
      invoices: any;
      settings: any;
      reports: any;
      printer: {
        getPrinters: () => Promise<
          Array<{
            name: string;
            displayName: string;
            description?: string;
            status?: number;
            isDefault?: boolean;
            options?: any;
          }>
        >;
        print: (html: string, options: any) => Promise<void>;
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
    };
  }
}

export { };
