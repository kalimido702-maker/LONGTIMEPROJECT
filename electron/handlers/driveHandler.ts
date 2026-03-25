/**
 * Google Drive Handler - إدارة النسخ الاحتياطي على Google Drive
 * يدعم ربط أكثر من حساب Drive ورفع النسخ الاحتياطي تلقائياً
 */

import { ipcMain, BrowserWindow, app } from "electron";
import { google, drive_v3 } from "googleapis";
import fs from "node:fs";
import path from "node:path";

// ==================== Configuration ====================

// OAuth2 Client Credentials (Desktop App type)
// يجب إنشاء مشروع في Google Cloud Console وتفعيل Drive API
// ثم إنشاء OAuth2 credentials من نوع "Desktop App"
const GOOGLE_CLIENT_ID =
  "YOUR_GOOGLE_CLIENT_ID";
const GOOGLE_CLIENT_SECRET = "YOUR_GOOGLE_CLIENT_SECRET";
const REDIRECT_URI = "http://localhost";

// Scopes needed
const SCOPES = [
  "https://www.googleapis.com/auth/drive.file", // Access files created by the app
  "https://www.googleapis.com/auth/userinfo.email", // Get user email
];

// Backup folder name in Google Drive
const DRIVE_BACKUP_FOLDER = "MYPOS_Backups";

// ==================== Types ====================

interface DriveAccount {
  id: string;
  email: string;
  tokens: {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expiry_date: number;
    scope: string;
  };
  enabled: boolean;
  lastUploadAt?: string;
  folderId?: string; // Google Drive folder ID for backups
}

interface DriveAccountsData {
  accounts: DriveAccount[];
  clientId?: string;
  clientSecret?: string;
}

// ==================== Storage ====================

const getAccountsFilePath = (): string => {
  return path.join(app.getPath("userData"), "drive-accounts.json");
};

const loadAccounts = (): DriveAccountsData => {
  try {
    const filePath = getAccountsFilePath();
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error loading drive accounts:", error);
  }
  return { accounts: [] };
};

const saveAccounts = (data: DriveAccountsData): void => {
  try {
    const filePath = getAccountsFilePath();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.error("Error saving drive accounts:", error);
  }
};

// ==================== OAuth2 Helpers ====================

const getClientCredentials = (): {
  clientId: string;
  clientSecret: string;
} => {
  const data = loadAccounts();
  return {
    clientId: data.clientId || GOOGLE_CLIENT_ID,
    clientSecret: data.clientSecret || GOOGLE_CLIENT_SECRET,
  };
};

const createOAuth2Client = () => {
  const { clientId, clientSecret } = getClientCredentials();
  return new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
};

const getAuthenticatedClient = (account: DriveAccount) => {
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials(account.tokens);

  // Auto-refresh token
  oauth2Client.on("tokens", (tokens) => {
    const data = loadAccounts();
    const acc = data.accounts.find((a) => a.id === account.id);
    if (acc && tokens) {
      if (tokens.access_token) acc.tokens.access_token = tokens.access_token;
      if (tokens.refresh_token) acc.tokens.refresh_token = tokens.refresh_token;
      if (tokens.expiry_date) acc.tokens.expiry_date = tokens.expiry_date;
      if (tokens.scope) acc.tokens.scope = tokens.scope;
      saveAccounts(data);
    }
  });

  return oauth2Client;
};

// Get or create the backup folder in Google Drive
const getOrCreateBackupFolder = async (
  drive: drive_v3.Drive,
  accountId: string
): Promise<string> => {
  // Check if we already have a folder ID cached
  const data = loadAccounts();
  const account = data.accounts.find((a) => a.id === accountId);
  if (account?.folderId) {
    // Verify folder still exists
    try {
      const res = await drive.files.get({
        fileId: account.folderId,
        fields: "id, trashed",
      });
      if (res.data.id && !res.data.trashed) {
        return account.folderId;
      }
    } catch {
      // Folder doesn't exist anymore, create new one
    }
  }

  // Search for existing folder
  const searchRes = await drive.files.list({
    q: `name='${DRIVE_BACKUP_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id, name)",
    spaces: "drive",
  });

  if (searchRes.data.files && searchRes.data.files.length > 0) {
    const folderId = searchRes.data.files[0].id!;
    // Cache the folder ID
    if (account) {
      account.folderId = folderId;
      saveAccounts(data);
    }
    return folderId;
  }

  // Create new folder
  const createRes = await drive.files.create({
    requestBody: {
      name: DRIVE_BACKUP_FOLDER,
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id",
  });

  const newFolderId = createRes.data.id!;
  // Cache the folder ID
  if (account) {
    account.folderId = newFolderId;
    saveAccounts(data);
  }
  return newFolderId;
};

// ==================== IPC Handlers ====================

let mainWindow: BrowserWindow | null = null;

export const setDriveMainWindow = (win: BrowserWindow) => {
  mainWindow = win;
};

export const registerDriveHandlers = () => {
  // ==================== Save Google API Credentials ====================
  ipcMain.handle(
    "drive:save-credentials",
    async (
      _event,
      credentials: { clientId: string; clientSecret: string }
    ) => {
      try {
        const data = loadAccounts();
        data.clientId = credentials.clientId;
        data.clientSecret = credentials.clientSecret;
        saveAccounts(data);
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );

  // ==================== Get Credentials ====================
  ipcMain.handle("drive:get-credentials", async () => {
    try {
      const { clientId, clientSecret } = getClientCredentials();
      const hasCredentials =
        clientId !== GOOGLE_CLIENT_ID && clientId.includes(".apps.googleusercontent.com");
      return { success: true, clientId, clientSecret, hasCredentials };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // ==================== Authenticate (Add Account) ====================
  ipcMain.handle("drive:authenticate", async () => {
    try {
      const oauth2Client = createOAuth2Client();

      const authUrl = oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: SCOPES,
        prompt: "consent", // Force consent to get refresh_token
      });

      // Open auth window
      const authWindow = new BrowserWindow({
        width: 600,
        height: 700,
        parent: mainWindow || undefined,
        modal: true,
        show: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
        title: "تسجيل الدخول إلى Google Drive",
      });

      authWindow.setMenuBarVisibility(false);
      authWindow.removeMenu();

      return new Promise<{
        success: boolean;
        account?: { id: string; email: string; enabled: boolean };
        error?: string;
      }>((resolve) => {
        let resolved = false;

        // Intercept the redirect to localhost BEFORE it actually loads
        // This prevents ERR_CONNECTION_REFUSED
        const filter = { urls: ["http://localhost/*"] };
        authWindow.webContents.session.webRequest.onBeforeRequest(
          filter,
          async (details, callback) => {
            // Block the request so it doesn't try to connect
            callback({ cancel: true });

            if (resolved) return;
            resolved = true;

            try {
              await handleAuthCallback(
                details.url,
                oauth2Client,
                resolve,
                authWindow
              );
            } catch (err: any) {
              authWindow.close();
              resolve({ success: false, error: err.message });
            }
          }
        );

        // Handle window close without auth
        authWindow.on("closed", () => {
          if (!resolved) {
            resolved = true;
            resolve({ success: false, error: "تم إلغاء تسجيل الدخول" });
          }
        });

        authWindow.loadURL(authUrl);
      });
    } catch (error: any) {
      console.error("Drive authentication error:", error);
      return { success: false, error: error.message };
    }
  });

  // ==================== List Accounts ====================
  ipcMain.handle("drive:list-accounts", async () => {
    try {
      const data = loadAccounts();
      return {
        success: true,
        accounts: data.accounts.map((a) => ({
          id: a.id,
          email: a.email,
          enabled: a.enabled,
          lastUploadAt: a.lastUploadAt,
        })),
      };
    } catch (error: any) {
      return { success: false, error: error.message, accounts: [] };
    }
  });

  // ==================== Toggle Account ====================
  ipcMain.handle(
    "drive:toggle-account",
    async (_event, accountId: string, enabled: boolean) => {
      try {
        const data = loadAccounts();
        const account = data.accounts.find((a) => a.id === accountId);
        if (!account) {
          return { success: false, error: "الحساب غير موجود" };
        }
        account.enabled = enabled;
        saveAccounts(data);
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );

  // ==================== Remove Account ====================
  ipcMain.handle(
    "drive:remove-account",
    async (_event, accountId: string) => {
      try {
        const data = loadAccounts();
        data.accounts = data.accounts.filter((a) => a.id !== accountId);
        saveAccounts(data);
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );

  // ==================== Upload Backup ====================
  ipcMain.handle(
    "drive:upload-backup",
    async (
      _event,
      options: { accountId: string; filename: string; content: string }
    ) => {
      try {
        const data = loadAccounts();
        const account = data.accounts.find(
          (a) => a.id === options.accountId
        );
        if (!account) {
          return { success: false, error: "الحساب غير موجود" };
        }

        const oauth2Client = getAuthenticatedClient(account);
        const drive = google.drive({ version: "v3", auth: oauth2Client });

        // Get or create backup folder
        const folderId = await getOrCreateBackupFolder(
          drive,
          account.id
        );

        // Upload the backup file
        const { Readable } = await import("node:stream");
        const stream = Readable.from([options.content]);

        const res = await drive.files.create({
          requestBody: {
            name: options.filename,
            parents: [folderId],
            mimeType: "application/json",
          },
          media: {
            mimeType: "application/json",
            body: stream,
          },
          fields: "id, name, size",
        });

        // Update last upload time
        account.lastUploadAt = new Date().toISOString();
        saveAccounts(data);

        // Clean old backups in Drive
        await cleanOldDriveBackups(drive, folderId);

        return {
          success: true,
          fileId: res.data.id,
          fileName: res.data.name,
        };
      } catch (error: any) {
        console.error("Drive upload error:", error);
        return { success: false, error: error.message };
      }
    }
  );

  // ==================== Upload to All Enabled Accounts ====================
  ipcMain.handle(
    "drive:upload-to-all",
    async (
      _event,
      options: { filename: string; content: string }
    ) => {
      try {
        const data = loadAccounts();
        const enabledAccounts = data.accounts.filter((a) => a.enabled);

        if (enabledAccounts.length === 0) {
          return { success: true, results: [], message: "لا توجد حسابات مفعلة" };
        }

        const results: Array<{
          accountId: string;
          email: string;
          success: boolean;
          error?: string;
        }> = [];

        // Upload to all enabled accounts in parallel
        await Promise.allSettled(
          enabledAccounts.map(async (account) => {
            try {
              const oauth2Client = getAuthenticatedClient(account);
              const drive = google.drive({
                version: "v3",
                auth: oauth2Client,
              });

              const folderId = await getOrCreateBackupFolder(
                drive,
                account.id
              );

              const { Readable } = await import("node:stream");
              const stream = Readable.from([options.content]);

              await drive.files.create({
                requestBody: {
                  name: options.filename,
                  parents: [folderId],
                  mimeType: "application/json",
                },
                media: {
                  mimeType: "application/json",
                  body: stream,
                },
              });

              // Update last upload time
              const freshData = loadAccounts();
              const acc = freshData.accounts.find(
                (a) => a.id === account.id
              );
              if (acc) {
                acc.lastUploadAt = new Date().toISOString();
                saveAccounts(freshData);
              }

              // Clean old backups
              await cleanOldDriveBackups(drive, folderId);

              results.push({
                accountId: account.id,
                email: account.email,
                success: true,
              });
            } catch (err: any) {
              console.error(
                `Drive upload failed for ${account.email}:`,
                err
              );
              results.push({
                accountId: account.id,
                email: account.email,
                success: false,
                error: err.message,
              });
            }
          })
        );

        return { success: true, results };
      } catch (error: any) {
        console.error("Drive upload-to-all error:", error);
        return { success: false, error: error.message, results: [] };
      }
    }
  );

  // ==================== Test Connection ====================
  ipcMain.handle(
    "drive:test-connection",
    async (_event, accountId: string) => {
      try {
        const data = loadAccounts();
        const account = data.accounts.find((a) => a.id === accountId);
        if (!account) {
          return { success: false, error: "الحساب غير موجود" };
        }

        const oauth2Client = getAuthenticatedClient(account);
        const drive = google.drive({ version: "v3", auth: oauth2Client });

        // Try to list files to test connection
        await drive.files.list({
          pageSize: 1,
          fields: "files(id)",
        });

        return { success: true, message: "الاتصال ناجح" };
      } catch (error: any) {
        console.error("Drive test connection error:", error);
        return { success: false, error: error.message };
      }
    }
  );
};

// ==================== Helper Functions ====================

const handleAuthCallback = async (
  url: string,
  oauth2Client: any,
  resolve: (value: any) => void,
  authWindow: BrowserWindow
) => {
  try {
    if (!url.startsWith(REDIRECT_URI)) return;

    const urlObj = new URL(url);
    const code = urlObj.searchParams.get("code");
    const error = urlObj.searchParams.get("error");

    if (error) {
      authWindow.close();
      resolve({ success: false, error: `Google auth error: ${error}` });
      return;
    }

    if (!code) return;

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info (email)
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email || "unknown@gmail.com";

    // Check if account already exists
    const data = loadAccounts();
    const existingIndex = data.accounts.findIndex(
      (a) => a.email === email
    );

    const accountId = `drive_${Date.now()}`;
    const account: DriveAccount = {
      id: existingIndex >= 0 ? data.accounts[existingIndex].id : accountId,
      email,
      tokens: {
        access_token: tokens.access_token || "",
        refresh_token: tokens.refresh_token || "",
        token_type: tokens.token_type || "Bearer",
        expiry_date: tokens.expiry_date || 0,
        scope: tokens.scope || "",
      },
      enabled: true,
      lastUploadAt: undefined,
    };

    if (existingIndex >= 0) {
      // Update existing account tokens
      data.accounts[existingIndex] = {
        ...data.accounts[existingIndex],
        tokens: account.tokens,
        enabled: true,
      };
    } else {
      data.accounts.push(account);
    }

    saveAccounts(data);
    authWindow.close();

    resolve({
      success: true,
      account: {
        id: account.id,
        email: account.email,
        enabled: account.enabled,
      },
    });
  } catch (err: any) {
    console.error("Auth callback error:", err);
    authWindow.close();
    resolve({ success: false, error: err.message });
  }
};

const cleanOldDriveBackups = async (
  drive: drive_v3.Drive,
  folderId: string
): Promise<void> => {
  try {
    // List all backup files in folder, sorted by creation time
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: "files(id, name, createdTime)",
      orderBy: "createdTime desc",
      pageSize: 100,
    });

    const files = res.data.files || [];

    // Keep only last 30 backups
    if (files.length > 30) {
      const filesToDelete = files.slice(30);
      for (const file of filesToDelete) {
        try {
          await drive.files.delete({ fileId: file.id! });
        } catch {
          // Ignore deletion errors
        }
      }
    }
  } catch (error) {
    console.error("Error cleaning old drive backups:", error);
  }
};
