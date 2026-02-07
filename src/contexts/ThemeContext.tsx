/**
 * ThemeContext - نظام إدارة الثيمات المركزي
 * يوفر إمكانية تبديل الثيمات وتخصيص الألوان من الإعدادات
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { ThemeMode, ColorScheme, applyTheme, DEFAULT_THEME } from '@/lib/theme.config';

interface ThemeContextType {
    mode: ThemeMode;
    colorScheme: ColorScheme;
    setMode: (mode: ThemeMode) => void;
    setColorScheme: (scheme: ColorScheme) => void;
    toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [mode, setModeState] = useState<ThemeMode>(DEFAULT_THEME.mode);
    const [colorScheme, setColorSchemeState] = useState<ColorScheme>(DEFAULT_THEME.colorScheme);
    const [isInitialized, setIsInitialized] = useState(false);

    // تحميل الثيم من الإعدادات عند بدء التطبيق
    useEffect(() => {
        loadThemeFromSettings();
    }, []);

    // تطبيق الثيم عند التغيير
    useEffect(() => {
        if (isInitialized) {
            applyTheme(colorScheme, mode);
            saveThemeToSettings();
        }
    }, [mode, colorScheme, isInitialized]);

    const loadThemeFromSettings = async () => {
        try {
            // قراءة الثيم من localStorage
            const savedMode = localStorage.getItem('theme-mode');
            const savedColorScheme = localStorage.getItem('theme-color-scheme');

            if (savedMode) {
                setModeState(savedMode as ThemeMode);
            }

            if (savedColorScheme) {
                setColorSchemeState(savedColorScheme as ColorScheme);
            }

            setIsInitialized(true);
        } catch (error) {
            console.error('Error loading theme:', error);
            setIsInitialized(true);
        }
    };

    const saveThemeToSettings = async () => {
        try {
            localStorage.setItem('theme-mode', mode);
            localStorage.setItem('theme-color-scheme', colorScheme);
        } catch (error) {
            console.error('Error saving theme:', error);
        }
    };

    const setMode = (newMode: ThemeMode) => {
        setModeState(newMode);
    };

    const setColorScheme = (newScheme: ColorScheme) => {
        setColorSchemeState(newScheme);
    };

    const toggleMode = () => {
        setModeState(prev => prev === 'light' ? 'dark' : 'light');
    };

    return (
        <ThemeContext.Provider
            value={{
                mode,
                colorScheme,
                setMode,
                setColorScheme,
                toggleMode,
            }}
        >
            {children}
        </ThemeContext.Provider>
    );
};

export const useThemeContext = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useThemeContext must be used within a ThemeProvider');
    }
    return context;
};
