/**
 * Tab Context - Manages browser-style tabs for the POS application
 * Features:
 * - Multiple tabs with unique IDs
 * - POS tab always open (not closeable)
 * - Persistence to localStorage
 * - Each tab maintains its own path
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    ShoppingCart,
    Users,
    FileText,
    Package,
    FolderOpen,
    TrendingUp,
    DollarSign,
    CreditCard,
    Calendar,
    Clock,
    Ruler,
    Settings,
    Shield,
    UserCheck,
    Printer,
    MessageSquare,
    Send,
    RotateCcw,
    Truck,
    Wallet,
    Landmark,
    LayoutGrid,
    Gift,
    BarChart3,
    Smartphone,
    ScrollText,
} from 'lucide-react';

export interface Tab {
    id: string;
    path: string;
    title: string;
    iconName: string; // Store icon name instead of component
    closeable: boolean;
}

interface TabContextType {
    tabs: Tab[];
    activeTabId: string;
    refreshCounter: number;
    addTab: (path: string) => void;
    closeTab: (id: string) => void;
    setActiveTab: (id: string) => void;
    navigateInCurrentTab: (path: string) => void;
    refreshActiveTab: () => void;
}

const TabContext = createContext<TabContextType | undefined>(undefined);

// Mapping of paths to tab info
export const pathToTabInfo: Record<string, { title: string; iconName: string }> = {
    '/': { title: 'الرئيسية', iconName: 'LayoutGrid' },
    '/pos': { title: 'نقطة البيع', iconName: 'ShoppingCart' },
    '/customers': { title: 'العملاء', iconName: 'Users' },
    '/invoices': { title: 'الفواتير', iconName: 'FileText' },
    '/quotes': { title: 'عروض الأسعار', iconName: 'FileText' },
    '/inventory': { title: 'المخزون', iconName: 'Package' },
    '/product-categories': { title: 'التصنيفات', iconName: 'FolderOpen' },
    '/suppliers': { title: 'الموردين', iconName: 'Truck' },
    '/purchases': { title: 'المشتريات', iconName: 'Package' },
    '/purchase-returns': { title: 'مرتجع المشتريات', iconName: 'RotateCcw' },
    '/sales-returns': { title: 'مرتجع المبيعات', iconName: 'RotateCcw' },
    '/employees': { title: 'الموظفين', iconName: 'UserCheck' },
    '/supervisors': { title: 'المشرفين', iconName: 'UserCheck' },
    '/sales-reps': { title: 'المندوبين', iconName: 'Users' },
    '/employee-advances': { title: 'السلف', iconName: 'DollarSign' },
    '/employee-deductions': { title: 'الخصومات', iconName: 'DollarSign' },
    '/expenses': { title: 'المصروفات', iconName: 'TrendingUp' },
    '/expense-categories': { title: 'تصنيفات المصروفات', iconName: 'FolderOpen' },
    '/deposits': { title: 'الإيداعات', iconName: 'DollarSign' },
    '/deposit-sources': { title: 'مصادر الإيداع', iconName: 'FolderOpen' },
    '/credit': { title: 'الآجل', iconName: 'CreditCard' },
    '/collections': { title: 'القبض السريع', iconName: 'Wallet' },
    '/bonus': { title: 'البونص', iconName: 'Gift' },
    '/supervisor-bonus': { title: 'بونص المشرفين', iconName: 'Award' },
    '/installments': { title: 'التقسيط', iconName: 'Calendar' },
    '/payment-methods': { title: 'طرق الدفع', iconName: 'CreditCard' },
    '/reports': { title: 'التقارير', iconName: 'TrendingUp' },
    '/sales-rep-report': { title: 'مبيعات المندوبين', iconName: 'BarChart3' },
    '/promotions': { title: 'العروض', iconName: 'DollarSign' },
    '/units': { title: 'الوحدات', iconName: 'Ruler' },
    '/warehouses': { title: 'المخازن', iconName: 'Landmark' },
    '/price-types': { title: 'أنواع الأسعار', iconName: 'DollarSign' },
    '/settings': { title: 'الإعدادات', iconName: 'Settings' },
    '/backup-settings': { title: 'النسخ الاحتياطي', iconName: 'Database' },
    '/roles-permissions': { title: 'الأدوار والصلاحيات', iconName: 'Shield' },
    '/printer-settings': { title: 'إعدادات الطابعة', iconName: 'Printer' },
    '/print-settings': { title: 'إعدادات الطباعة الموحدة', iconName: 'Printer' },
    '/license-activation': { title: 'تفعيل الترخيص', iconName: 'Shield' },
    '/whatsapp-management': { title: 'الواتساب', iconName: 'MessageSquare' },
    '/whatsapp-campaigns': { title: 'حملات الواتساب', iconName: 'Send' },
    '/whatsapp-groups': { title: 'مجموعات WhatsApp', iconName: 'Users' },
    '/restaurant': { title: 'المطعم', iconName: 'ShoppingCart' },
    '/mobile-accounts': { title: 'حسابات الموبايل', iconName: 'Smartphone' },
    '/logs': { title: 'سجلات النظام', iconName: 'ScrollText' },
};

// Icon component mapping
export const iconComponents: Record<string, React.ComponentType<{ className?: string }>> = {
    ShoppingCart,
    Users,
    FileText,
    Package,
    FolderOpen,
    TrendingUp,
    DollarSign,
    CreditCard,
    Calendar,
    Clock,
    Ruler,
    Settings,
    Shield,
    UserCheck,
    Printer,
    MessageSquare,
    Send,
    RotateCcw,
    Truck,
    Wallet,
    Landmark,
    LayoutGrid,
    Gift,
    BarChart3,
    Smartphone,
    ScrollText,
};

const STORAGE_KEY = 'pos-tabs';
const DEFAULT_TAB: Tab = {
    id: 'home-main',
    path: '/',
    title: 'الرئيسية',
    iconName: 'LayoutGrid',
    closeable: false, // POS tab is always open
};

export function TabProvider({ children }: { children: ReactNode }) {
    const [tabs, setTabs] = useState<Tab[]>([DEFAULT_TAB]);
    const [activeTabId, setActiveTabId] = useState<string>(DEFAULT_TAB.id);

    const [refreshCounter, setRefreshCounter] = useState<number>(0);
    const location = useLocation();
    const navigate = useNavigate();

    // Sync URL changes to Tabs
    useEffect(() => {
        const path = location.pathname;
        if (path === '/login' || path === '/license') return;

        // Find tab matching this path (ignoring query params which are already split by useLocation)
        // We match strictly on path for now, assuming tabs are created with clean paths
        // But wait, if we navigate to /pos, location.pathname is /pos. Tab path is /pos. Match!

        // Handling root path
        const searchPath = path === '/' ? '/' : path;

        const existingTab = tabs.find(t => t.path === searchPath);
        if (existingTab) {
            if (existingTab.id !== activeTabId) {
                setActiveTabId(existingTab.id);
            }
        } else {
            // Optional: Auto-create tab if not exists?
            // For now, let's rely on explicit addTab or just existing persistence.
            // But if user manually types URL, we might want to Add Tab.
            // Let's defer that to avoid side-effects, unless needed.
            // Actually, if I click "Edit", I navigate to /pos. POS tab should exist.
            // If it doesn't exist (deleted?), we should probably create it.

            const tabInfo = pathToTabInfo[searchPath];
            if (tabInfo) {
                addTab(searchPath);
            }
        }
    }, [location.pathname]); // Only trigger on path change, not query params change (unless we want to?)
    // Actually, we want to switch tab even if query params change? No, tab selection depends on path.
    // If I am on /pos?id=1 and switch to /pos?id=2, same tab. 
    // If I am on /invoices and switch to /pos?id=1, path changes /invoices -> /pos. Effect triggers.

    // Reverse Sync: When active tab changes, update URL?
    // If I click a Tab, setActiveTab is called.
    // We should update URL to match the tab.
    useEffect(() => {
        const activeTab = tabs.find(t => t.id === activeTabId);
        if (activeTab) {
            // Avoid infinite loop: Only navigate if current URL is different
            // But activeTab.path might lack query params that are currently in URL?
            // If we strict sync, we might lose query params when switching back to a tab?
            // For POS edit, we want to PRESERVE the QParams of the navigation.

            // Issue: If I strictly navigate here, I might overwrite the URL set by Invoices.tsx
            // Check: Invoices.tsx calls navigate('/pos?id=1').
            // Router updates URL -> /pos?id=1.
            // TabContext (Effect 1) sees /pos. Sets activeTabId = POS.
            // TabContext (Effect 2) sees activeTabId changed. activeTab.path is /pos.
            // If Effect 2 navigates to `/pos`, it CLEARS the query params!

            // Fix: Effect 2 should only navigate if the PATH is different.
            if (location.pathname !== activeTab.path) {
                navigate(activeTab.path);
            }
        }
    }, [activeTabId]);
    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const { tabs: savedTabs, activeTabId: savedActiveId } = JSON.parse(saved);
                if (savedTabs && savedTabs.length > 0) {
                    // Ensure POS tab exists and is not closeable
                    const hasPos = savedTabs.some((t: Tab) => t.path === '/');
                    if (!hasPos) {
                        savedTabs.unshift(DEFAULT_TAB);
                    } else {
                        // Make sure POS tab is not closeable
                        const posIndex = savedTabs.findIndex((t: Tab) => t.path === '/');
                        if (posIndex >= 0) {
                            savedTabs[posIndex].closeable = false;
                        }
                    }
                    setTabs(savedTabs);
                    setActiveTabId(savedActiveId || savedTabs[0].id);
                }
            }
        } catch (e) {
            console.error('Failed to load tabs from localStorage:', e);
        }
    }, []);

    // Save tabs to localStorage when they change
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs, activeTabId }));
        } catch (e) {
            console.error('Failed to save tabs to localStorage:', e);
        }
    }, [tabs, activeTabId]);

    const addTab = (path: string) => {
        // Check if tab for this path already exists
        const existingTab = tabs.find(t => t.path === path);
        if (existingTab) {
            setActiveTabId(existingTab.id);
            return;
        }

        // Get tab info from mapping
        const tabInfo = pathToTabInfo[path] || { title: path, iconName: 'FileText' };

        const newTab: Tab = {
            id: `tab-${Date.now()}`,
            path,
            title: tabInfo.title,
            iconName: tabInfo.iconName,
            closeable: path !== '/', // Only POS tab is not closeable
        };

        setTabs(prev => [...prev, newTab]);
        setActiveTabId(newTab.id);
    };

    const closeTab = (id: string) => {
        const tabToClose = tabs.find(t => t.id === id);
        if (!tabToClose || !tabToClose.closeable) return;

        const tabIndex = tabs.findIndex(t => t.id === id);
        const newTabs = tabs.filter(t => t.id !== id);

        // If closing active tab, switch to adjacent tab
        if (activeTabId === id && newTabs.length > 0) {
            const newActiveIndex = Math.min(tabIndex, newTabs.length - 1);
            setActiveTabId(newTabs[newActiveIndex].id);
        }

        setTabs(newTabs);
    };

    const setActiveTab = (id: string) => {
        const tab = tabs.find(t => t.id === id);
        if (tab) {
            setActiveTabId(id);
        }
    };

    const navigateInCurrentTab = (path: string) => {
        // Update the current tab's path
        setTabs(prev => prev.map(t => {
            if (t.id === activeTabId) {
                const tabInfo = pathToTabInfo[path] || { title: path, iconName: 'FileText' };
                return {
                    ...t,
                    path,
                    title: tabInfo.title,
                    iconName: tabInfo.iconName,
                };
            }
            return t;
        }));
    };

    const refreshActiveTab = () => {
        setRefreshCounter(prev => prev + 1);
    };

    return (
        <TabContext.Provider value={{
            tabs,
            activeTabId,
            refreshCounter,
            addTab,
            closeTab,
            setActiveTab,
            navigateInCurrentTab,
            refreshActiveTab,
        }}>
            {children}
        </TabContext.Provider>
    );
}

export function useTabs() {
    const context = useContext(TabContext);
    if (!context) {
        throw new Error('useTabs must be used within a TabProvider');
    }
    return context;
}

export default TabContext;
