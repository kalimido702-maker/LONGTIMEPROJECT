/**
 * AppContext - Context رئيسي لإدارة حالة التطبيق العامة
 * يجمع الـ Contexts المختلفة ويوفر واجهة موحدة
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import {
    APP_DEFAULTS,
    SYSTEM_MESSAGES,
    DATE_FORMATS,
    TABLE_SETTINGS,
} from '@/lib/constants';

interface AppConfig {
    // إعدادات التطبيق العامة
    locale: string;
    direction: 'rtl' | 'ltr';
    dateFormat: string;
    pageSizeDefault: number;

    // حالات التطبيق
    isOnline: boolean;
    isLoading: boolean;
    lastSync?: Date;
}

interface AppContextType {
    config: AppConfig;
    updateConfig: (updates: Partial<AppConfig>) => void;
    constants: {
        messages: typeof SYSTEM_MESSAGES;
        defaults: typeof APP_DEFAULTS;
        dateFormats: typeof DATE_FORMATS;
        tableSettings: typeof TABLE_SETTINGS;
    };
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [config, setConfig] = useState<AppConfig>({
        locale: 'ar-EG',
        direction: 'rtl',
        dateFormat: DATE_FORMATS.DISPLAY,
        pageSizeDefault: TABLE_SETTINGS.DEFAULT_PAGE_SIZE,
        isOnline: navigator.onLine,
        isLoading: false,
    });

    // مراقبة حالة الإنترنت
    useEffect(() => {
        const handleOnline = () => setConfig(prev => ({ ...prev, isOnline: true }));
        const handleOffline = () => setConfig(prev => ({ ...prev, isOnline: false }));

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const updateConfig = (updates: Partial<AppConfig>) => {
        setConfig(prev => ({ ...prev, ...updates }));
    };

    const value: AppContextType = {
        config,
        updateConfig,
        constants: {
            messages: SYSTEM_MESSAGES,
            defaults: APP_DEFAULTS,
            dateFormats: DATE_FORMATS,
            tableSettings: TABLE_SETTINGS,
        },
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = () => {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error('useAppContext must be used within an AppProvider');
    }
    return context;
};
