import { useEffect } from "react";
import React from "react";
import { useConflictResolution } from "@/hooks/useConflictResolution";
import { ConflictResolutionDialog } from "@/components/sync/ConflictResolutionDialog";
import { SyncStatusIndicator } from "@/components/sync/SyncStatusIndicator";
import {
  initializeInfrastructure,
  shutdownInfrastructure,
} from "@/infrastructure";

/**
 * SyncProvider - Component to initialize sync system and handle conflicts
 *
 * Usage:
 * ```tsx
 * <SyncProvider>
 *   <App />
 * </SyncProvider>
 * ```
 */
export function SyncProvider({ children }: { children: React.ReactNode }) {
  // Initialize infrastructure on mount
  useEffect(() => {
    let isInitialized = false;

    const init = async () => {
      try {
        // Get configuration from environment variables (using Vite's import.meta.env)
        const apiBaseURL =
          import.meta.env.VITE_API_BASE_URL || "http://localhost:3030";
        const wsURL = import.meta.env.VITE_WS_URL || "ws://localhost:3031";
        const syncInterval =
          Number(import.meta.env.VITE_SYNC_INTERVAL) || 5 * 60 * 1000;

        // Get sync credentials from license (Electron only)
        let syncCredentials: {
          syncToken?: string;
          clientId?: string;
          branchId?: string;
          merchantName?: string;
          syncInterval?: number;
          enableSync?: boolean;
          deviceId?: string;
        } | null = null;

        if (window.electronAPI?.license?.getSyncCredentials) {
          try {
            const result = await window.electronAPI.license.getSyncCredentials();
            if (result.success && result.syncToken) {
              syncCredentials = {
                syncToken: result.syncToken,
                clientId: result.clientId,
                branchId: result.branchId,
                merchantName: result.merchantName,
                deviceId: result.deviceId,
                // Use license sync settings
                syncInterval: result.syncInterval ?? 300000,
                enableSync: result.enableSync ?? true,
              };
              console.log("[SyncProvider] ✅ License sync settings loaded:", {
                clientId: result.clientId,
                branchId: result.branchId,
                deviceId: result.deviceId,
                syncInterval: result.syncInterval,
                enableSync: result.enableSync,
              });
            } else {
              console.warn("[SyncProvider] ⚠️ No sync credentials from license:", result.message);
            }
          } catch (e) {
            console.warn("[SyncProvider] ⚠️ Failed to get license credentials:", e);
          }
        }

        // Use license settings if available, otherwise fall back to .env
        const finalEnableSync = syncCredentials?.enableSync ?? true;
        const finalSyncInterval = syncCredentials?.syncInterval ?? syncInterval;

        if (!finalEnableSync) {
          console.log("[SyncProvider] ⚠️ Sync disabled by license settings");
        }

        await initializeInfrastructure({
          apiBaseURL,
          wsURL,
          enableSync: finalEnableSync,
          syncInterval: finalSyncInterval,
          // Pass sync credentials from license
          ...(syncCredentials && {
            syncToken: syncCredentials.syncToken,
            clientId: syncCredentials.clientId,
            branchId: syncCredentials.branchId,
            deviceId: syncCredentials.deviceId,
          }),
        });

        isInitialized = true;
        console.log("✅ Sync system initialized successfully");
      } catch (error) {
        console.error("❌ Failed to initialize sync system:", error);
      }
    };

    init();

    // Cleanup on unmount
    return () => {
      if (isInitialized) {
        shutdownInfrastructure();
      }
    };
  }, []);

  // Setup conflict resolution
  const { currentConflict, isDialogOpen, handleResolve, handleCloseDialog } =
    useConflictResolution({
      // Auto-resolve with server data by default
      // Change to 'none' to show dialog for each conflict
      autoResolve: "server",
    });

  return (
    <>
      {children}

      {/* Conflict Resolution Dialog */}
      <ConflictResolutionDialog
        conflict={currentConflict}
        open={isDialogOpen}
        onClose={handleCloseDialog}
        onResolve={handleResolve}
      />
    </>
  );
}

/**
 * useSyncStatus - Hook to access sync status in components
 */
export function useSyncStatus() {
  const [isOnline, setIsOnline] = React.useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = React.useState(false);

  React.useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return { isOnline, isSyncing };
}

// Re-export components for convenience
export { SyncStatusIndicator, ConflictResolutionDialog };
