import {
  createFastifyClient,
  createWebSocketClient,
  getFastifyClient,
  getWebSocketClient,
} from "./http";
import {
  createSyncQueue,
  createSyncEngine,
  getSyncEngine,
  createServerSyncHandler,
  initializeSmartSync,
  getSmartSync,
} from "./sync";

export interface InfrastructureConfig {
  apiBaseURL: string;
  wsURL: string;
  enableSync?: boolean;
  syncInterval?: number;
  // License-based sync credentials
  syncToken?: string;
  clientId?: string;
  branchId?: string;
  deviceId?: string;
}

let isInitialized = false;

export async function initializeInfrastructure(
  config: InfrastructureConfig
): Promise<void> {
  if (isInitialized) {
    console.warn("Infrastructure already initialized");
    return;
  }

  console.log("==========================================");
  console.log("[SYNC DEBUG] Initializing infrastructure...");
  console.log("[SYNC DEBUG] API URL:", config.apiBaseURL);
  console.log("[SYNC DEBUG] WS URL:", config.wsURL);
  console.log("[SYNC DEBUG] Enable Sync:", config.enableSync);
  console.log("==========================================");

  try {
    // Initialize HTTP client
    const httpClient = createFastifyClient({
      baseURL: config.apiBaseURL,
      timeout: 30000,
    });
    console.log("[SYNC DEBUG] HTTP client created");

    // Load stored auth tokens
    const authLoaded = httpClient.loadAuth();
    console.log("[SYNC DEBUG] Auth loaded:", authLoaded);

    // If license sync token provided, use it for authentication
    if (config.syncToken) {
      httpClient.setAuth({
        accessToken: config.syncToken,
        refreshToken: "", // No refresh for license tokens
      });
      console.log("[SYNC DEBUG] ✅ Using license sync token for auth");
      console.log("[SYNC DEBUG] Client ID:", config.clientId);
      console.log("[SYNC DEBUG] Branch ID:", config.branchId);
    } else {
      console.log("[SYNC DEBUG] Is authenticated:", httpClient.isAuthenticated());
    }

    // Quick connectivity check (non-blocking)
    httpClient
      .get("/api/health")
      .then(() => console.log("[SYNC DEBUG] ✅ Backend reachable"))
      .catch((err) => console.error("[SYNC DEBUG] ❌ Backend NOT reachable:", err?.message));

    // Initialize WebSocket client
    const wsClient = createWebSocketClient({
      url: config.wsURL,
      reconnectInterval: 1000,
      maxReconnectInterval: 30000,
      reconnectDecay: 1.5,
      heartbeatInterval: 30000,
    });

    // Set credentials before connecting
    if (config.syncToken) {
      wsClient.setAuthToken(config.syncToken);
      console.log("[Infrastructure] WebSocket auth token set");
    }
    if (config.deviceId) {
      wsClient.setDeviceId(config.deviceId);
      console.log("[Infrastructure] WebSocket device ID set:", config.deviceId);
    }

    // Connect WebSocket with credentials
    wsClient.connect();
    console.log("[Infrastructure] WebSocket connection initiated");

    // Initialize Sync Queue
    await createSyncQueue();

    // Initialize Sync Engine
    if (config.enableSync !== false) {
      const syncEngine = await createSyncEngine({
        syncInterval: config.syncInterval || 5 * 60 * 1000,
        enableAutoSync: true,
      });

      // Setup sync engine event listeners
      syncEngine.on("started", () => {
        console.log("Sync engine started");
      });

      syncEngine.on("syncComplete", (stats) => {
        console.log("Sync completed:", stats);
      });

      syncEngine.on("syncError", (error) => {
        console.error("Sync error:", error);
      });

      syncEngine.on("online", () => {
        console.log("App is online");
      });

      syncEngine.on("offline", () => {
        console.log("App is offline");
      });

      // Start sync engine even if not authenticated (API may allow public sync/ping)
      await syncEngine.start();

      // Initialize ServerSyncHandler to handle incoming server updates
      createServerSyncHandler(syncEngine);
      console.log("ServerSyncHandler initialized");

      // Initialize Smart Sync Manager for bidirectional sync
      console.log("[SYNC DEBUG] Initializing SmartSync...");
      const smartSync = initializeSmartSync(httpClient, wsClient, {
        syncInterval: config.syncInterval || 30000, // 30 seconds
        pullOnConnect: true,
        pushOnChange: true,
        enableRealTime: true,
        batchSize: 50,
      });
      console.log("[SYNC DEBUG] SmartSync initialized");

      // Setup SmartSync event listeners
      smartSync.on('syncComplete', (result) => {
        console.log('[SYNC DEBUG] ✅ Sync complete:', result);
      });

      smartSync.on('syncError', (error) => {
        console.error('[SYNC DEBUG] ❌ Sync error:', error);
      });

      smartSync.on('remoteUpdate', (event) => {
        console.log('[SYNC DEBUG] Remote update received:', event);
      });

      smartSync.on('online', () => {
        console.log('[SYNC DEBUG] App is online');
      });

      smartSync.on('offline', () => {
        console.log('[SYNC DEBUG] App is offline');
      });

      // Start SmartSync (initial full sync + periodic sync)
      console.log("[SYNC DEBUG] Starting SmartSync...");
      await smartSync.start();
      console.log('[SYNC DEBUG] ✅ SmartSyncManager started successfully');
    }

    isInitialized = true;
    console.log("==========================================");
    console.log("[SYNC DEBUG] ✅ Infrastructure initialized successfully");
    console.log("==========================================");
  } catch (error) {
    console.error("Failed to initialize infrastructure:", error);
    throw error;
  }
}

export async function shutdownInfrastructure(): Promise<void> {
  if (!isInitialized) {
    return;
  }

  console.log("Shutting down infrastructure...");

  try {
    const syncEngine = getSyncEngine();
    await syncEngine.stop();

    const wsClient = getWebSocketClient();
    wsClient.disconnect();

    isInitialized = false;
    console.log("Infrastructure shut down successfully");
  } catch (error) {
    console.error("Error during infrastructure shutdown:", error);
  }
}

export function isInfrastructureInitialized(): boolean {
  return isInitialized;
}

// Re-export for convenience
export { getFastifyClient, getWebSocketClient } from "./http";
export { getSyncEngine, getSyncQueue } from "./sync";
export * from "./http";
export * from "./sync";
