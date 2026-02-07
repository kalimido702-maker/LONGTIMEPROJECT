import { useState, useEffect, useCallback } from "react";
import { getSyncEngine } from "@/infrastructure";
import { ConflictData } from "@/components/sync/ConflictResolutionDialog";

interface UseConflictResolutionOptions {
  autoResolve?: "local" | "server" | "none";
}

export function useConflictResolution(
  options: UseConflictResolutionOptions = {}
) {
  const { autoResolve = "none" } = options;

  const [currentConflict, setCurrentConflict] = useState<ConflictData | null>(
    null
  );
  const [conflictQueue, setConflictQueue] = useState<ConflictData[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    let syncEngine;
    try {
      syncEngine = getSyncEngine();
    } catch (error) {
      // SyncEngine not initialized yet, skip
      console.warn("SyncEngine not initialized yet in useConflictResolution");
      return;
    }
    if (!syncEngine) return;

    // Listen for conflict events from sync engine
    const handleConflict = (conflictData: {
      table: string;
      id: string;
      localData: any;
      serverData: any;
    }) => {
      const conflict: ConflictData = {
        id: conflictData.id,
        table: conflictData.table,
        localData: conflictData.localData,
        serverData: conflictData.serverData,
        localUpdatedAt:
          conflictData.localData?.local_updated_at ||
          conflictData.localData?.updated_at ||
          new Date().toISOString(),
        serverUpdatedAt:
          conflictData.serverData?.server_updated_at ||
          conflictData.serverData?.updated_at ||
          new Date().toISOString(),
      };

      // Auto-resolve if configured
      if (autoResolve !== "none") {
        resolveConflict(conflict, autoResolve);
        return;
      }

      // Add to queue and show dialog
      setConflictQueue((prev) => [...prev, conflict]);
    };

    syncEngine.on("conflict", handleConflict);

    return () => {
      syncEngine.off("conflict", handleConflict);
    };
  }, [autoResolve]);

  // Show next conflict when queue changes
  useEffect(() => {
    if (conflictQueue.length > 0 && !currentConflict) {
      const [nextConflict, ...rest] = conflictQueue;
      setCurrentConflict(nextConflict);
      setConflictQueue(rest);
      setIsDialogOpen(true);
    }
  }, [conflictQueue, currentConflict]);

  const resolveConflict = useCallback(
    async (conflict: ConflictData, resolution: "local" | "server" | "skip") => {
      let syncEngine;
      try {
        syncEngine = getSyncEngine();
      } catch (error) {
        console.warn("SyncEngine not available for conflict resolution");
        return;
      }
      if (!syncEngine) return;

      try {
        if (resolution === "skip") {
          // Do nothing, will retry on next sync
          return;
        }

        if (resolution === "server") {
          // Use server data - update local database
          // This will be handled by the sync engine
          syncEngine.emit("conflictResolved", {
            table: conflict.table,
            id: conflict.id,
            resolution: "server",
            data: conflict.serverData,
          });
        } else if (resolution === "local") {
          // Use local data - add to sync queue to force push
          syncEngine.emit("conflictResolved", {
            table: conflict.table,
            id: conflict.id,
            resolution: "local",
            data: conflict.localData,
          });
        }
      } catch (error) {
        console.error("Failed to resolve conflict:", error);
      }
    },
    []
  );

  const handleResolve = useCallback(
    (resolution: "local" | "server" | "skip") => {
      if (currentConflict) {
        resolveConflict(currentConflict, resolution);
        setCurrentConflict(null);
        setIsDialogOpen(false);
      }
    },
    [currentConflict, resolveConflict]
  );

  const handleCloseDialog = useCallback(() => {
    setIsDialogOpen(false);
    // Move current conflict back to queue
    if (currentConflict) {
      setConflictQueue((prev) => [...prev, currentConflict]);
      setCurrentConflict(null);
    }
  }, [currentConflict]);

  return {
    currentConflict,
    isDialogOpen,
    conflictCount: conflictQueue.length + (currentConflict ? 1 : 0),
    handleResolve,
    handleCloseDialog,
  };
}
