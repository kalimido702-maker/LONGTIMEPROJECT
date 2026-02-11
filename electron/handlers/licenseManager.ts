/**
 * License Manager - نظام حماية احترافي للتطبيق
 * يمنع تشغيل النسخة على أكثر من جهاز
 *
 * يستخدم التحقق المركزي (Online) + Offline Fallback
 */

import { app, ipcMain } from "electron";
import * as crypto from "crypto";
import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

// ==================== Constants ====================

// مفتاح التشفير السري (غيّره لقيمة سرية خاصة بك)
const ENCRYPTION_SECRET = "MASR-POS-2024-SECURE-KEY-@#$%^&*";
const LICENSE_FILE_NAME = "license.dat";
const ALGORITHM = "aes-256-gcm";

// ==================== License Server Configuration ====================
// Production Server (HTTP - no SSL on port 3030)
const LICENSE_SERVER_URL = "http://13coffee.net:3030/api/license";
// فعّل التحقق من السيرفر
const USE_ONLINE_VALIDATION = true;

// ==================== Interfaces ====================

interface LicenseData {
  licenseKey: string;
  deviceId: string;
  activationDate: string;
  expiryDate?: string;
  customerName?: string;
  features?: string[];
  maxDevices?: number;
  lastOnlineCheck?: string; // آخر تحقق من السيرفر
  serverValidated?: boolean; // هل تم التحقق من السيرفر
  // Sync credentials from server
  clientId?: string;      // merchant ID for sync
  branchId?: string;      // branch ID for sync
  syncToken?: string;     // JWT for sync API
  merchantName?: string;  // merchant name from server
  // Sync settings from server
  syncInterval?: number;      // milliseconds
  enableSync?: boolean;
  enableOfflineMode?: boolean;
  autoUpdate?: boolean;
}

interface HardwareInfo {
  cpuId: string;
  macAddress: string;
  hostname: string;
  platform: string;
  diskSerial: string;
  username: string;
}

interface EncryptedData {
  iv: string;
  authTag: string;
  data: string;
}

// ==================== Hardware Fingerprint ====================

// Cache the device ID to ensure consistency within a session
let cachedDeviceId: string | null = null;

// Cache sync credentials to prevent excessive API calls (causes 429 rate limiting)
let cachedSyncCredentials: {
  data: any;
  timestamp: number;
} | null = null;
const SYNC_CREDENTIALS_CACHE_TTL = 3 * 60 * 1000; // 3 minutes cache TTL

/**
 * الحصول على معلومات الـ Hardware الفريدة للجهاز
 */
function getHardwareInfo(): HardwareInfo {
  // CPU ID
  let cpuId = "";
  try {
    if (process.platform === "win32") {
      cpuId =
        execSync("wmic cpu get processorid", { encoding: "utf8" })
          .split("\n")[1]
          ?.trim() || "";
    } else if (process.platform === "darwin") {
      cpuId = execSync("sysctl -n machdep.cpu.brand_string", {
        encoding: "utf8",
      }).trim();
      // أيضاً نحصل على serial number
      try {
        const serial = execSync(
          "ioreg -rd1 -c IOPlatformExpertDevice | awk '/IOPlatformSerialNumber/ { print $3 }'",
          { encoding: "utf8" }
        )
          .trim()
          .replace(/"/g, "");
        cpuId += `-${serial}`;
      } catch { }
    } else {
      cpuId = execSync("cat /proc/cpuinfo | grep 'Serial' | awk '{print $3}'", {
        encoding: "utf8",
      }).trim();
    }
  } catch (e) {
    cpuId = os.cpus()[0]?.model || "unknown";
  }

  // MAC Address - use stable interface only
  let macAddress = "";
  const networkInterfaces = os.networkInterfaces();
  // Prefer en0 on Mac (built-in interface)
  const preferredInterfaces = ["en0", "eth0", "Ethernet", "Wi-Fi"];
  for (const preferred of preferredInterfaces) {
    if (networkInterfaces[preferred]) {
      for (const iface of networkInterfaces[preferred]!) {
        if (!iface.internal && iface.mac && iface.mac !== "00:00:00:00:00:00") {
          macAddress = iface.mac;
          break;
        }
      }
    }
    if (macAddress) break;
  }
  // Fallback to any interface
  if (!macAddress) {
    for (const name of Object.keys(networkInterfaces)) {
      const interfaces = networkInterfaces[name];
      if (interfaces) {
        for (const iface of interfaces) {
          if (!iface.internal && iface.mac && iface.mac !== "00:00:00:00:00:00") {
            macAddress = iface.mac;
            break;
          }
        }
      }
      if (macAddress) break;
    }
  }

  // Disk Serial / Hardware UUID
  let diskSerial = "";
  try {
    if (process.platform === "win32") {
      diskSerial =
        execSync("wmic diskdrive get serialnumber", { encoding: "utf8" })
          .split("\n")[1]
          ?.trim() || "";
    } else if (process.platform === "darwin") {
      diskSerial = execSync(
        "system_profiler SPHardwareDataType | awk '/Hardware UUID/ { print $3 }'",
        { encoding: "utf8" }
      ).trim();
    } else {
      diskSerial = execSync("lsblk -o SERIAL | head -2 | tail -1", {
        encoding: "utf8",
      }).trim();
    }
  } catch (e) {
    diskSerial = "unknown";
  }

  return {
    cpuId,
    macAddress,
    hostname: os.hostname(),
    platform: `${process.platform}-${process.arch}`,
    diskSerial,
    username: os.userInfo().username,
  };
}

/**
 * توليد بصمة فريدة للجهاز (Device ID)
 * على Mac: نستخدم Hardware UUID فقط لأنه ثابت
 * على Windows: نستخدم CPU ID + Disk Serial
 * 
 * IMPORTANT: Device ID is persisted to file to prevent changes after power outages
 */
function generateDeviceId(): string {
  // Return cached ID if available (in-memory cache)
  if (cachedDeviceId) {
    return cachedDeviceId;
  }

  // Try to read persisted Device ID from file first
  const deviceIdFilePath = path.join(
    app.getPath("userData"),
    ".device_id"
  );

  try {
    if (fs.existsSync(deviceIdFilePath)) {
      const savedId = fs.readFileSync(deviceIdFilePath, "utf8").trim();
      if (savedId && savedId.length > 10) {
        console.log("📱 Using persisted Device ID from file");
        cachedDeviceId = savedId;
        return cachedDeviceId;
      }
    }
  } catch (e) {
    console.warn("📱 Could not read persisted Device ID:", e);
  }

  // Generate new Device ID if none exists
  let rawFingerprint = "";

  if (process.platform === "darwin") {
    // على Mac، نستخدم Hardware UUID فقط - أكثر استقراراً
    try {
      const hardwareUUID = execSync(
        "system_profiler SPHardwareDataType | awk '/Hardware UUID/ { print $3 }'",
        { encoding: "utf8" }
      ).trim();
      rawFingerprint = hardwareUUID;
      console.log("📱 Generated Device ID using Hardware UUID");
    } catch (e) {
      // Fallback
      const hw = getHardwareInfo();
      rawFingerprint = `${hw.cpuId}|${hw.diskSerial}|${hw.platform}`;
      console.log("📱 Generated Device ID using fallback hardware info");
    }
  } else if (process.platform === "win32") {
    // Windows: استخدام WMIC بشكل أكثر استقراراً
    try {
      // Try to get motherboard serial first (most stable)
      let boardSerial = "";
      try {
        boardSerial = execSync("wmic baseboard get serialnumber", { encoding: "utf8" })
          .split("\n")[1]?.trim() || "";
      } catch { }

      // Get BIOS serial (also stable)
      let biosSerial = "";
      try {
        biosSerial = execSync("wmic bios get serialnumber", { encoding: "utf8" })
          .split("\n")[1]?.trim() || "";
      } catch { }

      // Get CPU ID
      let cpuId = "";
      try {
        cpuId = execSync("wmic cpu get processorid", { encoding: "utf8" })
          .split("\n")[1]?.trim() || "";
      } catch { }

      // Use the most stable combination available
      if (boardSerial && boardSerial !== "To be filled by O.E.M.") {
        rawFingerprint = boardSerial;
      } else if (biosSerial && biosSerial !== "To be filled by O.E.M.") {
        rawFingerprint = biosSerial;
      } else if (cpuId) {
        rawFingerprint = cpuId;
      } else {
        // Last resort: use user/hostname
        rawFingerprint = `${os.hostname()}-${os.userInfo().username}-${process.arch}`;
      }

      console.log("📱 Generated Device ID using Windows hardware info");
    } catch (e) {
      // Ultimate fallback
      rawFingerprint = `${os.hostname()}-${os.userInfo().username}-${process.arch}`;
      console.warn("📱 Using fallback Device ID generation");
    }
  } else {
    // Linux: استخدام عدة عوامل
    const hw = getHardwareInfo();
    rawFingerprint = `${hw.cpuId}|${hw.diskSerial}|${hw.platform}`;
  }

  // تشفير البصمة بـ SHA-256
  const hash = crypto.createHash("sha256").update(rawFingerprint).digest("hex");

  // تنسيق البصمة على شكل مجموعات (مثل: XXXX-XXXX-XXXX-XXXX)
  cachedDeviceId = (
    hash
      .substring(0, 32)
      .toUpperCase()
      .match(/.{1,8}/g)
      ?.join("-") || hash.substring(0, 32)
  );

  // Persist to file for future use (prevents changes after restarts/power outages)
  try {
    fs.writeFileSync(deviceIdFilePath, cachedDeviceId, "utf8");
    console.log("📱 Device ID persisted to file:", cachedDeviceId);
  } catch (e) {
    console.warn("📱 Could not persist Device ID:", e);
  }

  return cachedDeviceId;
}

// ==================== Online License Validation ====================

interface ServerLicenseResponse {
  success: boolean;
  message: string;
  valid?: boolean;
  deviceId?: string;
  expiryDate?: string;
  customerName?: string;
  isAlreadyActivated?: boolean;
  activatedDeviceId?: string;
  // Sync credentials
  clientId?: string;
  branchId?: string;
  syncToken?: string;
  merchantName?: string;
  // Sync settings
  syncInterval?: number;
  enableSync?: boolean;
  enableOfflineMode?: boolean;
  autoUpdate?: boolean;
  // Package features
  features?: string[];
}

/**
 * التحقق من الترخيص من السيرفر المركزي (يُرجع syncToken جديد)
 */
async function validateLicenseOnline(
  licenseKey: string,
  deviceId: string
): Promise<ServerLicenseResponse> {
  if (!USE_ONLINE_VALIDATION) {
    // إذا التحقق الأونلاين معطّل، نرجع نجاح
    return { success: true, valid: true, message: "Offline mode" };
  }

  try {
    // Use /verify endpoint which returns fresh syncToken
    const response = await fetch(`${LICENSE_SERVER_URL}/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        licenseKey,
        deviceId,
        appVersion: app.getVersion(),
        platform: process.platform,
      }),
    });

    // Handle server responses (including errors like 404)
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      // 404 = License not found, 403 = Forbidden - these are VALID server responses
      // meaning the license is invalid/expired, NOT a connection error
      if (response.status === 404 || response.status === 403 || response.status === 400) {
        console.log(`🔴 Server rejected license: ${response.status}`, data);
        return {
          success: true,  // Server responded successfully
          valid: false,   // But license is invalid
          message: data.message || "الترخيص غير موجود أو منتهي.",
        };
      }
      // 500+ = Server error, treat as connection problem
      throw new Error(`Server error: ${response.status}`);
    }

    return data;
  } catch (error: any) {
    console.error("Online validation error:", error);
    // فقط في حالة فشل الاتصال الفعلي (network error) نسمح بالعمل offline
    return {
      success: false,
      message: "فشل الاتصال بالسيرفر. يعمل التطبيق في وضع offline.",
    };
  }
}

/**
 * تفعيل الترخيص على السيرفر المركزي
 */
async function activateLicenseOnline(
  licenseKey: string,
  deviceId: string,
  customerName?: string
): Promise<ServerLicenseResponse> {
  console.log("🌐 activateLicenseOnline called:", {
    licenseKey,
    deviceId,
    customerName,
  });
  console.log("📡 USE_ONLINE_VALIDATION:", USE_ONLINE_VALIDATION);
  console.log("📡 LICENSE_SERVER_URL:", LICENSE_SERVER_URL);

  if (!USE_ONLINE_VALIDATION) {
    console.log("⚠️ Online validation disabled");
    return { success: true, valid: true, message: "Offline mode" };
  }

  try {
    const payload = {
      licenseKey,
      deviceId,
      customerName,
      appVersion: app.getVersion(),
      platform: process.platform,
      hostname: os.hostname(),
    };

    console.log("📨 Sending request to:", `${LICENSE_SERVER_URL}/activate`);
    console.log("📨 Payload:", payload);

    const response = await fetch(`${LICENSE_SERVER_URL}/activate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    console.log("📬 Response status:", response.status, response.statusText);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.log("❌ Server error:", errorData);
      return {
        success: false,
        message: errorData.message || `Server error: ${response.status}`,
        isAlreadyActivated: errorData.isAlreadyActivated,
        activatedDeviceId: errorData.activatedDeviceId,
      };
    }

    const result = await response.json();
    console.log("✅ Server response:", result);
    return result;
  } catch (error: any) {
    console.error("❌ Online activation error:", error);
    return {
      success: false,
      message: "فشل الاتصال بالسيرفر. تأكد من اتصال الإنترنت.",
    };
  }
}

/**
 * إلغاء تفعيل الترخيص من السيرفر
 */
async function deactivateLicenseOnline(
  licenseKey: string,
  deviceId: string
): Promise<ServerLicenseResponse> {
  if (!USE_ONLINE_VALIDATION) {
    return { success: true, message: "Offline mode" };
  }

  try {
    const response = await fetch(`${LICENSE_SERVER_URL}/deactivate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        licenseKey,
        deviceId,
      }),
    });

    return await response.json();
  } catch (error: any) {
    console.error("Online deactivation error:", error);
    return { success: false, message: "فشل الاتصال بالسيرفر." };
  }
}

// ==================== Encryption ====================

/**
 * توليد مفتاح التشفير من الـ secret
 */
function deriveKey(secret: string): Buffer {
  return crypto.scryptSync(secret, "salt-masr-pos", 32);
}

/**
 * تشفير البيانات
 */
function encryptData(data: string): EncryptedData {
  const key = deriveKey(ENCRYPTION_SECRET);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(data, "utf8", "hex");
  encrypted += cipher.final("hex");

  return {
    iv: iv.toString("hex"),
    authTag: cipher.getAuthTag().toString("hex"),
    data: encrypted,
  };
}

/**
 * فك تشفير البيانات
 */
function decryptData(encrypted: EncryptedData): string {
  const key = deriveKey(ENCRYPTION_SECRET);
  const iv = Buffer.from(encrypted.iv, "hex");
  const authTag = Buffer.from(encrypted.authTag, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted.data, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

// ==================== License File Management ====================

/**
 * الحصول على مسار ملف الترخيص
 */
function getLicenseFilePath(): string {
  const userDataPath = app.getPath("userData");
  return path.join(userDataPath, LICENSE_FILE_NAME);
}

/**
 * حفظ بيانات الترخيص
 */
function saveLicenseData(data: LicenseData): boolean {
  try {
    const jsonData = JSON.stringify(data);
    const encrypted = encryptData(jsonData);
    const filePath = getLicenseFilePath();

    fs.writeFileSync(filePath, JSON.stringify(encrypted), "utf8");
    return true;
  } catch (error) {
    console.error("Error saving license:", error);
    return false;
  }
}

/**
 * قراءة بيانات الترخيص
 */
function loadLicenseData(): LicenseData | null {
  try {
    const filePath = getLicenseFilePath();
    console.log("📂 License file path:", filePath);

    if (!fs.existsSync(filePath)) {
      console.log("📂 License file does not exist");
      return null;
    }

    console.log("📂 License file exists, reading...");
    const fileContent = fs.readFileSync(filePath, "utf8");
    const encrypted: EncryptedData = JSON.parse(fileContent);
    const decrypted = decryptData(encrypted);

    const data = JSON.parse(decrypted) as LicenseData;
    console.log("✅ License data loaded successfully:", data.licenseKey);
    return data;
  } catch (error) {
    console.error("❌ Error loading license:", error);
    return null;
  }
}

/**
 * حذف ملف الترخيص
 */
function deleteLicenseData(): boolean {
  try {
    const filePath = getLicenseFilePath();
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return true;
  } catch (error) {
    console.error("Error deleting license:", error);
    return false;
  }
}

// ==================== License Validation ====================

/**
 * التحقق من صحة مفتاح الترخيص (يمكنك تخصيص هذه الدالة حسب نظام الترخيص الخاص بك)
 *
 * صيغة المفتاح المقترحة: XXXX-XXXX-XXXX-XXXX
 * حيث آخر 4 أحرف هي checksum
 */
function validateLicenseKeyFormat(licenseKey: string): boolean {
  // تنظيف المفتاح
  const cleanKey = licenseKey.replace(/[^A-Z0-9]/gi, "").toUpperCase();

  // المفتاح يجب أن يكون 16 حرف
  if (cleanKey.length !== 16) {
    console.log(
      "❌ License key length invalid:",
      cleanKey.length,
      "expected 16"
    );
    return false;
  }

  // في Development mode أو لو المفتاح يبدأ بـ TEST - skip checksum
  if (!app.isPackaged || cleanKey.startsWith("TEST")) {
    console.log("✅ License key format valid (dev/test mode)");
    return true;
  }

  // التحقق من الـ checksum (آخر 4 أحرف) - للإنتاج فقط
  const keyPart = cleanKey.substring(0, 12);
  const checksum = cleanKey.substring(12, 16);

  // حساب الـ checksum المتوقع
  const hash = crypto
    .createHash("md5")
    .update(keyPart + ENCRYPTION_SECRET)
    .digest("hex");
  const expectedChecksum = hash.substring(0, 4).toUpperCase();

  const isValid = checksum === expectedChecksum;
  console.log("🔐 Checksum validation:", isValid ? "✅" : "❌");
  return isValid;
}

/**
 * توليد مفتاح ترخيص جديد (للاستخدام من جانب الإدارة)
 */
function generateLicenseKey(): string {
  // توليد 12 حرف عشوائي
  const randomPart = crypto
    .randomBytes(6)
    .toString("hex")
    .toUpperCase()
    .substring(0, 12);

  // حساب الـ checksum
  const hash = crypto
    .createHash("md5")
    .update(randomPart + ENCRYPTION_SECRET)
    .digest("hex");
  const checksum = hash.substring(0, 4).toUpperCase();

  // تنسيق المفتاح
  const fullKey = randomPart + checksum;
  return fullKey.match(/.{1,4}/g)?.join("-") || fullKey;
}

/**
 * التحقق من صلاحية الترخيص
 * يتحقق محلياً أولاً، ثم من السيرفر إذا متاح
 */
async function verifyLicense(): Promise<{
  valid: boolean;
  message: string;
  data?: LicenseData;
}> {
  console.log("🔐 verifyLicense called...");

  const licenseData = loadLicenseData();
  console.log("📁 Local license data:", licenseData ? "Found" : "Not found");

  if (!licenseData) {
    console.log("❌ No local license file found");
    return {
      valid: false,
      message: "لم يتم العثور على ترخيص. يرجى تفعيل التطبيق.",
    };
  }

  // التحقق من Device ID
  const currentDeviceId = generateDeviceId();
  console.log("🔑 Checking Device ID...");
  console.log("   Current:", currentDeviceId);
  console.log("   License:", licenseData.deviceId);

  if (licenseData.deviceId !== currentDeviceId) {
    console.log("❌ Device ID mismatch!");
    return {
      valid: false,
      message:
        "هذا الترخيص مسجل على جهاز آخر. يرجى التواصل مع الدعم الفني للحصول على ترخيص جديد.",
    };
  }
  console.log("✅ Device ID matches");

  // التحقق من تاريخ الانتهاء (إذا موجود)
  if (licenseData.expiryDate) {
    const expiryDate = new Date(licenseData.expiryDate);
    console.log("📅 Checking expiry date:", expiryDate.toISOString());
    if (new Date() > expiryDate) {
      console.log("❌ License expired!");
      return {
        valid: false,
        message: `انتهت صلاحية الترخيص في ${expiryDate.toLocaleDateString(
          "ar-EG"
        )}. يرجى تجديد الاشتراك.`,
      };
    }
    console.log("✅ License not expired");
  }

  // التحقق من السيرفر - دائماً عند فتح التطبيق (لتجديد syncToken)
  if (USE_ONLINE_VALIDATION) {
    try {
      console.log("🔄 Verifying license online and refreshing syncToken...");
      const serverResult = await validateLicenseOnline(
        licenseData.licenseKey,
        currentDeviceId
      );
      console.log("🌐 Server result:", JSON.stringify(serverResult, null, 2));

      if (serverResult.success && serverResult.valid === false) {
        // المفتاح غير صالح أو مُلغى من السيرفر - نحذف الملف المحلي
        console.log("🔴 License rejected by server, deleting local license file...");
        deleteLicenseData();
        return {
          valid: false,
          message:
            serverResult.message || "الترخيص غير صالح. تواصل مع الدعم الفني.",
        };
      }

      // تحديث البيانات وsyncToken الجديد
      if (serverResult.success && serverResult.valid) {
        licenseData.lastOnlineCheck = new Date().toISOString();
        licenseData.serverValidated = true;

        // Refresh sync credentials if returned from server
        if (serverResult.syncToken) {
          licenseData.syncToken = serverResult.syncToken;
          console.log("✅ syncToken refreshed from server");
        }
        if (serverResult.clientId) {
          licenseData.clientId = serverResult.clientId;
        }
        if (serverResult.branchId) {
          licenseData.branchId = serverResult.branchId;
        }
        if (serverResult.merchantName) {
          licenseData.merchantName = serverResult.merchantName;
        }
        // Update sync settings
        if (serverResult.syncInterval !== undefined) {
          licenseData.syncInterval = serverResult.syncInterval;
        }
        if (serverResult.enableSync !== undefined) {
          licenseData.enableSync = serverResult.enableSync;
        }
        if (serverResult.enableOfflineMode !== undefined) {
          licenseData.enableOfflineMode = serverResult.enableOfflineMode;
        }
        if (serverResult.autoUpdate !== undefined) {
          licenseData.autoUpdate = serverResult.autoUpdate;
        }
        // Update package features
        if (serverResult.features !== undefined) {
          licenseData.features = serverResult.features;
          console.log("✅ Package features updated from server:", serverResult.features);
        }

        saveLicenseData(licenseData);
      }
    } catch (error) {
      // في حالة فشل الاتصال، نسمح بالعمل offline
      console.warn("Online check failed, continuing offline:", error);
    }
  }

  return { valid: true, message: "الترخيص صالح", data: licenseData };
}

// ==================== Activation ====================

/**
 * تفعيل الترخيص
 * 1. التحقق من صيغة المفتاح
 * 2. التحقق من السيرفر (إذا متاح)
 * 3. حفظ الترخيص محلياً
 */
async function activateLicense(
  licenseKey: string,
  customerName?: string,
  expiryDate?: string
): Promise<{ success: boolean; message: string; deviceId?: string }> {
  console.log("🔐 activateLicense called with:", { licenseKey, customerName });

  // التحقق من صيغة المفتاح
  if (!validateLicenseKeyFormat(licenseKey)) {
    console.log("❌ Invalid license key format:", licenseKey);
    return {
      success: false,
      message:
        "مفتاح الترخيص غير صالح. يرجى التحقق من المفتاح والمحاولة مرة أخرى.",
    };
  }

  console.log("✅ License key format is valid");

  // التحقق إذا كان هناك ترخيص موجود محلياً
  const existingLicense = loadLicenseData();
  if (existingLicense) {
    const currentDeviceId = generateDeviceId();
    if (existingLicense.deviceId === currentDeviceId) {
      return {
        success: false,
        message: "التطبيق مفعّل بالفعل على هذا الجهاز.",
      };
    }
  }

  // توليد Device ID
  const deviceId = generateDeviceId();

  // Variables to store sync credentials from server
  let clientId: string | undefined;
  let branchId: string | undefined;
  let syncToken: string | undefined;
  let merchantName: string | undefined;
  // Variables to store sync settings from server (with defaults)
  let syncInterval: number = 300000; // 5 minutes default
  let enableSync: boolean = true;
  let enableOfflineMode: boolean = false;
  let autoUpdate: boolean = true;
  // Variables to store package features (empty = all features enabled for backward compatibility)
  let features: string[] = [];

  // التحقق من السيرفر المركزي (إذا مفعّل)
  if (USE_ONLINE_VALIDATION) {
    const serverResponse = await activateLicenseOnline(
      licenseKey,
      deviceId,
      customerName
    );

    if (!serverResponse.success) {
      // إذا المفتاح مستخدم على جهاز آخر
      if (serverResponse.isAlreadyActivated) {
        return {
          success: false,
          message: `⚠️ هذا المفتاح مُفعّل بالفعل على جهاز آخر!\n\nمعرّف الجهاز المُفعّل: ${serverResponse.activatedDeviceId?.substring(
            0,
            15
          )}...\n\nللنقل إلى هذا الجهاز، تواصل مع الدعم الفني.`,
        };
      }
      return { success: false, message: serverResponse.message };
    }

    // استخدام البيانات من السيرفر
    if (serverResponse.expiryDate) {
      expiryDate = serverResponse.expiryDate;
    }
    if (serverResponse.customerName) {
      customerName = serverResponse.customerName;
    }
    // Store sync credentials from server
    clientId = (serverResponse as any).clientId;
    branchId = (serverResponse as any).branchId;
    syncToken = (serverResponse as any).syncToken;
    merchantName = (serverResponse as any).merchantName || customerName;
    // Store sync settings from server
    syncInterval = (serverResponse as any).syncInterval ?? 300000;
    enableSync = (serverResponse as any).enableSync ?? true;
    enableOfflineMode = (serverResponse as any).enableOfflineMode ?? false;
    autoUpdate = (serverResponse as any).autoUpdate ?? true;
    // Store package features from server (null = all features enabled)
    if ((serverResponse as any).features) {
      features = (serverResponse as any).features as string[];
    }
  }

  // إنشاء بيانات الترخيص
  const licenseData: LicenseData = {
    licenseKey: licenseKey.toUpperCase(),
    deviceId,
    activationDate: new Date().toISOString(),
    expiryDate: expiryDate || undefined,
    customerName: customerName || undefined,
    features: features.length > 0 ? features : undefined, // null means all features enabled
    lastOnlineCheck: new Date().toISOString(),
    serverValidated: USE_ONLINE_VALIDATION,
    // Sync credentials from server
    clientId,
    branchId,
    syncToken,
    merchantName,
    // Sync settings from server
    syncInterval,
    enableSync,
    enableOfflineMode,
    autoUpdate,
  };

  // حفظ الترخيص
  if (saveLicenseData(licenseData)) {
    return {
      success: true,
      message: "تم تفعيل الترخيص بنجاح! 🎉",
      deviceId,
    };
  } else {
    return {
      success: false,
      message: "حدث خطأ أثناء حفظ الترخيص. يرجى المحاولة مرة أخرى.",
    };
  }
}

/**
 * إلغاء تفعيل الترخيص (للانتقال لجهاز آخر)
 */
async function deactivateLicense(
  confirmationCode: string
): Promise<{ success: boolean; message: string }> {
  // كود التأكيد للأمان (يمكن تخصيصه)
  const expectedCode =
    "RESET-" + new Date().toISOString().slice(0, 10).replace(/-/g, "");

  if (confirmationCode !== expectedCode) {
    return { success: false, message: "كود التأكيد غير صحيح." };
  }

  // إلغاء التفعيل من السيرفر (إذا مفعّل)
  const licenseData = loadLicenseData();
  if (USE_ONLINE_VALIDATION && licenseData) {
    const serverResponse = await deactivateLicenseOnline(
      licenseData.licenseKey,
      licenseData.deviceId
    );
    if (!serverResponse.success) {
      console.warn("Failed to deactivate on server:", serverResponse.message);
      // نستمر في الحذف المحلي حتى لو فشل السيرفر
    }
  }

  if (deleteLicenseData()) {
    return {
      success: true,
      message: "تم إلغاء تفعيل الترخيص. يمكنك الآن تفعيله على جهاز آخر.",
    };
  } else {
    return { success: false, message: "حدث خطأ أثناء إلغاء التفعيل." };
  }
}

// ==================== IPC Handlers ====================

export function registerLicenseHandlers() {
  // الحصول على Device ID الحالي
  ipcMain.handle("license:get-device-id", () => {
    return generateDeviceId();
  });

  // الحصول على معلومات الـ Hardware
  ipcMain.handle("license:get-hardware-info", () => {
    return getHardwareInfo();
  });

  // التحقق من الترخيص
  ipcMain.handle("license:verify", async () => {
    return await verifyLicense();
  });

  // تفعيل الترخيص
  ipcMain.handle(
    "license:activate",
    async (
      _event,
      licenseKey: string,
      customerName?: string,
      expiryDate?: string
    ) => {
      return await activateLicense(licenseKey, customerName, expiryDate);
    }
  );

  // إلغاء تفعيل الترخيص
  ipcMain.handle(
    "license:deactivate",
    async (_event, confirmationCode: string) => {
      return await deactivateLicense(confirmationCode);
    }
  );

  // الحصول على بيانات الترخيص
  ipcMain.handle("license:get-data", async () => {
    const result = await verifyLicense();
    if (result.valid && result.data) {
      return {
        success: true,
        data: {
          licenseKey: result.data.licenseKey,
          deviceId: result.data.deviceId,
          activationDate: result.data.activationDate,
          expiryDate: result.data.expiryDate,
          customerName: result.data.customerName,
        },
      };
    }
    return { success: false, message: result.message };
  });

  // توليد مفتاح جديد (للمطورين/الإدارة فقط)
  ipcMain.handle("license:generate-key", () => {
    // هذا للتطوير فقط - في الإنتاج يجب إزالته أو حمايته
    if (!app.isPackaged) {
      return generateLicenseKey();
    }
    return null;
  });

  // التحقق من السيرفر يدوياً
  ipcMain.handle("license:check-online", async () => {
    const licenseData = loadLicenseData();
    if (!licenseData) {
      return { success: false, message: "لا يوجد ترخيص" };
    }

    const result = await validateLicenseOnline(
      licenseData.licenseKey,
      licenseData.deviceId
    );

    // تحديث آخر تحقق
    if (result.success) {
      licenseData.lastOnlineCheck = new Date().toISOString();
      saveLicenseData(licenseData);
    }

    return result;
  });

  // Get sync credentials and settings for API authentication
  ipcMain.handle("license:get-sync-credentials", async () => {
    const result = await verifyLicense();
    if (result.valid && result.data) {
      // Get device ID
      const deviceId = await generateDeviceId();

      return {
        success: true,
        // Sync credentials
        clientId: result.data.clientId,
        branchId: result.data.branchId,
        syncToken: result.data.syncToken,
        merchantName: result.data.merchantName,
        deviceId: deviceId,
        // Sync settings
        syncInterval: result.data.syncInterval ?? 300000,
        enableSync: result.data.enableSync ?? true,
        enableOfflineMode: result.data.enableOfflineMode ?? false,
        autoUpdate: result.data.autoUpdate ?? true,
        // Package features (null = all features enabled for backward compatibility)
        features: result.data.features || null,
      };
    }
    return { success: false, message: result.message };
  });
}

// ==================== Exports ====================

export { verifyLicense, generateDeviceId, generateLicenseKey, getHardwareInfo };
