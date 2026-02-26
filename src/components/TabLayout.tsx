/**
 * TabLayout Component - Main layout with tab bar and content
 * Only shown for authenticated users (not on login page)
 * Note: POSHeader is removed here as each page includes its own header
 */

import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { TabBar } from '@/components/TabBar';
import { TabContent } from '@/components/TabContent';
import { TabProvider } from '@/contexts/TabContext';
import UpdateProgressBar from '@/components/UpdateProgressBar';
import { SyncProgressBar } from '@/components/sync/SyncProgressBar';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import {
    InputOTP,
    InputOTPGroup,
    InputOTPSlot,
} from '@/components/ui/input-otp';
import { Shield, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Lazy-load DataControlCenter
const DataControlCenter = lazy(() => import('@/pages/admin/DataControlCenter'));

// PIN for accessing Data Control Center
const DATA_CENTER_PIN = '1234';

function DataControlCenterWrapper() {
    const [showPinDialog, setShowPinDialog] = useState(false);
    const [showDataCenter, setShowDataCenter] = useState(false);
    const [pin, setPin] = useState('');
    const [pinError, setPinError] = useState(false);

    // Handle keyboard shortcut: Ctrl+Shift+D (or Cmd+Shift+D on macOS)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isModifier = e.ctrlKey || e.metaKey; // Ctrl on Windows/Linux, Cmd on macOS
            if (isModifier && e.shiftKey && (e.key === 'D' || e.key === 'd' || e.code === 'KeyD')) {
                e.preventDefault();
                e.stopPropagation();
                if (showDataCenter) {
                    setShowDataCenter(false);
                } else {
                    setShowPinDialog(true);
                    setPin('');
                    setPinError(false);
                }
            }
            if (e.key === 'Escape' && showDataCenter) {
                setShowDataCenter(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [showDataCenter]);

    // Verify PIN
    const handlePinComplete = useCallback(
        (value: string) => {
            if (value === DATA_CENTER_PIN) {
                setShowPinDialog(false);
                setShowDataCenter(true);
                setPin('');
                setPinError(false);
            } else {
                setPinError(true);
                setPin('');
            }
        },
        []
    );

    return (
        <>
            {/* PIN Dialog */}
            <Dialog open={showPinDialog} onOpenChange={(open) => {
                setShowPinDialog(open);
                if (!open) {
                    setPin('');
                    setPinError(false);
                }
            }}>
                <DialogContent className="sm:max-w-sm" dir="rtl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 justify-center">
                            <Shield className="h-5 w-5 text-primary" />
                            مركز التحكم بالبيانات
                        </DialogTitle>
                        <DialogDescription className="text-center">
                            أدخل رمز الدخول المكون من 4 أرقام
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col items-center gap-4 py-4">
                        <InputOTP
                            maxLength={4}
                            value={pin}
                            onChange={(value) => {
                                setPin(value);
                                setPinError(false);
                            }}
                            onComplete={handlePinComplete}
                            autoFocus
                        >
                            <InputOTPGroup>
                                <InputOTPSlot index={0} />
                                <InputOTPSlot index={1} />
                                <InputOTPSlot index={2} />
                                <InputOTPSlot index={3} />
                            </InputOTPGroup>
                        </InputOTP>
                        {pinError && (
                            <p className="text-destructive text-sm flex items-center gap-1">
                                <XCircle className="h-4 w-4" />
                                رمز خاطئ، حاول مرة أخرى
                            </p>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Data Control Center - Full screen overlay */}
            {showDataCenter && (
                <div className="fixed inset-0 z-50 bg-background">
                    <div className="absolute top-2 left-2 z-10">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowDataCenter(false)}
                            className="text-muted-foreground hover:text-foreground"
                        >
                            <XCircle className="h-5 w-5 ml-1" />
                            إغلاق (Esc)
                        </Button>
                    </div>
                    <Suspense
                        fallback={
                            <div className="flex items-center justify-center h-full">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                            </div>
                        }
                    >
                        <DataControlCenter />
                    </Suspense>
                </div>
            )}
        </>
    );
}

export function TabLayout() {
    return (
        <TabProvider>
            <div className="flex flex-col h-screen" dir="rtl">
                {/* Tab Bar - في أعلى التطبيق */}
                <TabBar />

                {/* Tab Content - يحتوي على Header الخاص بكل صفحة */}
                <TabContent />

                {/* Sync Progress Bar - شريط تقدم المزامنة */}
                <SyncProgressBar />

                {/* Update Progress Bar */}
                <UpdateProgressBar />

                {/* Data Control Center - accessible via Ctrl+Shift+D */}
                <DataControlCenterWrapper />
            </div>
        </TabProvider>
    );
}

export default TabLayout;

