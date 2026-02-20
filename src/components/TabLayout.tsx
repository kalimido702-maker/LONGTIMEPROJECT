/**
 * TabLayout Component - Main layout with tab bar and content
 * Only shown for authenticated users (not on login page)
 * Note: POSHeader is removed here as each page includes its own header
 */

import React from 'react';
import { TabBar } from '@/components/TabBar';
import { TabContent } from '@/components/TabContent';
import { TabProvider } from '@/contexts/TabContext';
import UpdateProgressBar from '@/components/UpdateProgressBar';
import { SyncProgressBar } from '@/components/sync/SyncProgressBar';

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
            </div>
        </TabProvider>
    );
}

export default TabLayout;

