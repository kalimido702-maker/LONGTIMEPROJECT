import React, { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { getSyncEngine } from "@/infrastructure";
import { SyncStats, SyncStatus } from "@/infrastructure/sync/SyncEngine";
import {
  Cloud,
  CloudOff,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
} from "lucide-react";

export function SyncStatusIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [stats, setStats] = useState<SyncStats>({
    lastSyncTime: null,
    totalSynced: 0,
    totalFailed: 0,
    pendingCount: 0,
    isOnline: navigator.onLine,
    status: SyncStatus.IDLE,
  });
  const [lastSyncTime, setLastSyncTime] = useState<string>("");

  useEffect(() => {
    const syncEngine = getSyncEngine();
    if (!syncEngine) return;

    // Listen to sync engine events
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleSyncStart = () => setIsSyncing(true);
    const handleSyncComplete = (syncStats: SyncStats) => {
      setIsSyncing(false);
      setStats(syncStats);
    };
    const handleSyncError = () => setIsSyncing(false);

    syncEngine.on("online", handleOnline);
    syncEngine.on("offline", handleOffline);
    syncEngine.on("syncStart", handleSyncStart);
    syncEngine.on("syncComplete", handleSyncComplete);
    syncEngine.on("syncError", handleSyncError);

    // Update last sync time periodically
    const updateLastSyncTime = () => {
      if (stats.lastSyncTime) {
        const now = new Date();
        const syncDate = new Date(stats.lastSyncTime);
        const diffMinutes = Math.floor(
          (now.getTime() - syncDate.getTime()) / 1000 / 60
        );

        if (diffMinutes === 0) {
          setLastSyncTime("الآن");
        } else if (diffMinutes < 60) {
          setLastSyncTime(`منذ ${diffMinutes} دقيقة`);
        } else {
          const diffHours = Math.floor(diffMinutes / 60);
          setLastSyncTime(`منذ ${diffHours} ساعة`);
        }
      }
    };

    updateLastSyncTime();
    const interval = setInterval(updateLastSyncTime, 60000); // Update every minute

    return () => {
      syncEngine.off("online", handleOnline);
      syncEngine.off("offline", handleOffline);
      syncEngine.off("syncStart", handleSyncStart);
      syncEngine.off("syncComplete", handleSyncComplete);
      syncEngine.off("syncError", handleSyncError);
      clearInterval(interval);
    };
  }, [stats.lastSyncTime]);

  const handleManualSync = async () => {
    const syncEngine = getSyncEngine();
    if (syncEngine && !isSyncing) {
      await syncEngine.syncNow();
    }
  };

  const getStatusIcon = () => {
    if (!isOnline) {
      return <CloudOff className="w-4 h-4" />;
    }
    if (isSyncing) {
      return <RefreshCw className="w-4 h-4 animate-spin" />;
    }
    if (stats.totalFailed > 0) {
      return <AlertCircle className="w-4 h-4" />;
    }
    if (stats.pendingCount > 0) {
      return <Clock className="w-4 h-4" />;
    }
    return <CheckCircle2 className="w-4 h-4" />;
  };

  const getStatusVariant = ():
    | "default"
    | "secondary"
    | "destructive"
    | "outline" => {
    if (!isOnline) return "secondary";
    if (stats.totalFailed > 0) return "destructive";
    if (stats.pendingCount > 0) return "outline";
    return "default";
  };

  const getStatusText = () => {
    if (!isOnline) return "غير متصل";
    if (isSyncing) return "جاري المزامنة...";
    if (stats.totalFailed > 0) return `فشل ${stats.totalFailed}`;
    if (stats.pendingCount > 0) return `معلق ${stats.pendingCount}`;
    return "متزامن";
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          {getStatusIcon()}
          <Badge variant={getStatusVariant()} className="gap-1">
            {getStatusText()}
          </Badge>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">حالة المزامنة</h3>
            <Badge variant={isOnline ? "default" : "secondary"}>
              {isOnline ? (
                <>
                  <Cloud className="w-3 h-3 ml-1" />
                  متصل
                </>
              ) : (
                <>
                  <CloudOff className="w-3 h-3 ml-1" />
                  غير متصل
                </>
              )}
            </Badge>
          </div>

          {/* Stats */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">تم المزامنة</span>
              <span className="font-medium text-green-600">
                {stats.totalSynced}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">في الانتظار</span>
              <span className="font-medium text-orange-600">
                {stats.pendingCount}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">فشل</span>
              <span className="font-medium text-red-600">
                {stats.totalFailed}
              </span>
            </div>
          </div>

          {/* Progress */}
          {isSyncing && (
            <div className="space-y-2">
              <Progress value={undefined} className="h-2" />
              <p className="text-xs text-center text-gray-600">
                جاري المزامنة...
              </p>
            </div>
          )}

          {/* Last sync time */}
          {stats.lastSyncTime && !isSyncing && (
            <div className="text-xs text-gray-600 text-center">
              آخر مزامنة: {lastSyncTime}
            </div>
          )}

          {/* Manual sync button */}
          <Button
            onClick={handleManualSync}
            disabled={!isOnline || isSyncing}
            className="w-full"
            size="sm"
          >
            <RefreshCw
              className={`w-4 h-4 ml-2 ${isSyncing ? "animate-spin" : ""}`}
            />
            مزامنة الآن
          </Button>

          {/* Offline message */}
          {!isOnline && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-sm">
              <p className="text-yellow-800">
                أنت غير متصل بالإنترنت. سيتم حفظ التغييرات محلياً ومزامنتها عند
                الاتصال.
              </p>
            </div>
          )}

          {/* Failed items message */}
          {stats.totalFailed > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-sm">
              <p className="text-red-800">
                فشل مزامنة {stats.totalFailed} عنصر. سيتم إعادة المحاولة
                تلقائياً.
              </p>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
