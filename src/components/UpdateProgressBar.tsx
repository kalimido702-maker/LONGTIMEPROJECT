/**
 * UpdateProgressBar Component
 * Shows a non-intrusive progress bar at the bottom of the screen when an update is downloading
 * Only visible when there's an active update
 */

import { useState, useEffect } from 'react';
import { Download, X, RefreshCw, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

interface UpdateInfo {
    version: string;
    releaseDate: string;
}

interface DownloadProgress {
    percent: number;
    bytesPerSecond: number;
    transferred: number;
    total: number;
}

type UpdateState = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error';

export function UpdateProgressBar() {
    const [updateState, setUpdateState] = useState<UpdateState>('idle');
    const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
    const [progress, setProgress] = useState<DownloadProgress | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [dismissed, setDismissed] = useState(false);

    const isElectron = typeof window !== 'undefined' && window.electronAPI?.autoUpdater;

    useEffect(() => {
        if (!isElectron) return;

        const api = window.electronAPI.autoUpdater;

        // Listen for update events
        api.onUpdateAvailable((info) => {
            setUpdateInfo(info);
            setUpdateState('downloading');
            setDismissed(false);
        });

        api.onDownloadProgress((prog) => {
            setProgress(prog);
            setUpdateState('downloading');
        });

        api.onUpdateDownloaded((info) => {
            setUpdateInfo(info);
            setUpdateState('ready');
            setProgress(null);
        });

        api.onError((err) => {
            setError(err.message);
            setUpdateState('error');
            // Auto-hide error after 5 seconds
            setTimeout(() => {
                setUpdateState('idle');
                setError(null);
            }, 5000);
        });

        return () => {
            api.removeAllListeners();
        };
    }, [isElectron]);

    const handleInstallNow = () => {
        if (isElectron) {
            window.electronAPI.autoUpdater.installUpdate();
        }
    };

    const handleDismiss = () => {
        setDismissed(true);
    };

    const formatBytes = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const formatSpeed = (bytesPerSecond: number) => {
        return `${formatBytes(bytesPerSecond)}/s`;
    };

    // Don't render if idle, error cleared, or dismissed
    if (updateState === 'idle' || dismissed) {
        return null;
    }

    return (
        <div
            className="fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg"
            dir="rtl"
        >
            <div className="container mx-auto px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                    {/* Icon and Status */}
                    <div className="flex items-center gap-3">
                        {updateState === 'downloading' && (
                            <Download className="h-5 w-5 animate-bounce" />
                        )}
                        {updateState === 'ready' && (
                            <CheckCircle className="h-5 w-5 text-green-300" />
                        )}
                        {updateState === 'error' && (
                            <X className="h-5 w-5 text-red-300" />
                        )}

                        <div>
                            {updateState === 'downloading' && (
                                <span className="font-medium">
                                    جاري تحميل التحديث {updateInfo?.version}...
                                </span>
                            )}
                            {updateState === 'ready' && (
                                <span className="font-medium">
                                    التحديث {updateInfo?.version} جاهز للتثبيت
                                </span>
                            )}
                            {updateState === 'error' && (
                                <span className="font-medium text-red-200">
                                    خطأ في التحديث: {error}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Progress Bar (when downloading) */}
                    {updateState === 'downloading' && progress && (
                        <div className="flex-1 max-w-md flex items-center gap-3">
                            <Progress
                                value={progress.percent}
                                className="h-2 bg-blue-400"
                            />
                            <span className="text-sm whitespace-nowrap">
                                {progress.percent.toFixed(0)}%
                            </span>
                            <span className="text-xs text-blue-200 whitespace-nowrap hidden sm:inline">
                                {formatSpeed(progress.bytesPerSecond)}
                            </span>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                        {updateState === 'ready' && (
                            <>
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={handleDismiss}
                                    className="bg-blue-500 hover:bg-blue-400 text-white border-0"
                                >
                                    لاحقاً
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={handleInstallNow}
                                    className="bg-green-500 hover:bg-green-400 text-white"
                                >
                                    <RefreshCw className="h-4 w-4 ml-2" />
                                    تثبيت الآن
                                </Button>
                            </>
                        )}
                        {updateState === 'downloading' && (
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={handleDismiss}
                                className="text-white hover:bg-blue-500"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default UpdateProgressBar;
