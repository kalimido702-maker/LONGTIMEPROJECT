/**
 * TabBar Component - Browser-style tab bar for POS application
 * Features:
 * - Horizontal scrollable tabs
 * - Active tab styling
 * - Close button on closeable tabs
 * - + button to add new tab from menu
 */

import React from 'react';
import { X, Plus, ChevronDown, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { useTabs, iconComponents, pathToTabInfo } from '@/contexts/TabContext';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

// Menu structure for adding tabs - same as POSHeader
const menuGroups = [
    {
        label: 'الصفحات الرئيسية',
        items: [
            { path: '/', permission: 'invoices', name: 'نقطة البيع' },
            { path: '/customers', permission: 'customers', name: 'العملاء' },
            { path: '/invoices', permission: 'invoices', name: 'سجل الفواتير' },
            { path: '/reports', permission: 'reports', name: 'التقارير' },
            { path: '/sales-rep-report', permission: 'reports', name: 'مبيعات المندوبين' },
        ],
    },
    {
        label: 'الإدارة',
        items: [
            { path: '/inventory', permission: 'products', name: 'المخزون' },
            { path: '/product-categories', permission: 'products', name: 'أقسام المنتجات' },
            { path: '/suppliers', permission: 'suppliers', name: 'الموردين' },
            { path: '/purchases', permission: 'purchases', name: 'المشتريات' },
            { path: '/employees', permission: 'employees', name: 'الموظفين' },
            { path: '/supervisors', permission: 'employees', name: 'المشرفين' },
            { path: '/sales-reps', permission: 'employees', name: 'المندوبين' },
            { path: '/employee-advances', permission: 'employeeAdvances', name: 'سُلف الموظفين' },
            { path: '/employee-deductions', permission: 'employeeAdvances', name: 'خصومات الموظفين' },
            { path: '/promotions', permission: 'promotions', name: 'العروض والخصومات' },
            { path: '/installments', permission: 'installments', name: 'إدارة التقسيط' },
            { path: '/credit', permission: 'credit', name: 'إدارة الآجل' },
        ],
    },
    {
        label: 'المالية',
        items: [
            { path: '/collections', permission: 'collections', name: 'القبض السريع' },
            { path: '/bonus', permission: 'credit', name: 'البونص' },
            { path: '/supervisor-bonus', permission: 'credit', name: 'بونص المشرفين' },
            { path: '/deposit-sources', permission: 'depositSources', name: 'مصادر الإيداعات' },
            { path: '/deposits', permission: 'deposits', name: 'الإيداعات' },
            { path: '/expense-categories', permission: 'expenseCategories', name: 'فئات المصروفات' },
            { path: '/expenses', permission: 'expenses', name: 'المصروفات' },
        ],
    },
    {
        label: 'الورديات والمرتجعات',
        items: [
            { path: '/shifts', permission: 'shifts', name: 'إدارة الورديات' },
            { path: '/sales-returns', permission: 'returns', name: 'مرتجع المبيعات' },
            { path: '/purchase-returns', permission: 'returns', name: 'مرتجع المشتريات' },
        ],
    },
    {
        label: 'المطاعم',
        items: [
            { path: '/restaurant', permission: 'restaurant', name: 'الصالات والطاولات' },
        ],
    },
    {
        label: 'الواتساب',
        items: [
            { path: '/whatsapp-management', permission: 'settings', name: 'إدارة الحسابات' },
            { path: '/whatsapp-campaigns', permission: 'settings', name: 'الحملات التسويقية' },
            { path: '/whatsapp-groups', permission: 'settings', name: 'المجموعات والإرسال الدوري' },
        ],
    },
    {
        label: 'الإعدادات الأساسية',
        items: [
            { path: '/units', permission: 'settings', name: 'وحدات القياس' },
            { path: '/warehouses', permission: 'settings', name: 'المخازن' },
            { path: '/price-types', permission: 'settings', name: 'أنواع التسعير' },
            { path: '/payment-methods', permission: 'settings', name: 'طرق الدفع' },
        ],
    },
    {
        label: 'النظام',
        items: [
            { path: '/settings', permission: 'settings', name: 'الإعدادات' },
            { path: '/backup-settings', permission: 'settings', name: 'النسخ الاحتياطي' },
            { path: '/roles-permissions', permission: 'settings', name: 'الأدوار والصلاحيات' },
            { path: '/print-settings', permission: 'settings', name: 'إعدادات الطباعة' },
        ],
    },
];

export function TabBar() {
    const { tabs, activeTabId, addTab, closeTab, setActiveTab, refreshActiveTab } = useTabs();
    const { can } = useAuth();

    const handleAddTab = (path: string) => {
        addTab(path);
    };

    const handleCloseTab = (e: React.MouseEvent, tabId: string) => {
        e.stopPropagation();
        closeTab(tabId);
    };

    return (
        <div
            className="bg-gradient-primary text-primary-foreground flex items-center gap-1 px-2 py-1 overflow-x-auto pt-3"
            dir="rtl"
        >
            {/* Tabs */}
            <div className="flex items-center gap-1 flex-1 overflow-x-auto scrollbar-thin scrollbar-thumb-muted-foreground/20">
                {tabs.map((tab) => {
                    const IconComponent = iconComponents[tab.iconName];
                    const isActive = tab.id === activeTabId;

                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                "flex items-center gap-2 px-3 py-1.5 rounded-t-lg text-sm font-medium transition-all min-w-[120px] max-w-[200px] group",
                                isActive
                                    ? "bg-background text-foreground shadow-sm border border-b-0"
                                    : "text-white hover:text-foreground hover:bg-muted bg-white/10"
                            )}
                        >
                            {IconComponent && <IconComponent className="h-4 w-4 shrink-0" />}
                            <span className="truncate flex-1 text-right">{tab.title}</span>
                            {tab.closeable && (
                                <button
                                    onClick={(e) => handleCloseTab(e, tab.id)}
                                    className={cn(
                                        "h-4 w-4 rounded-sm hover:bg-destructive/20 flex items-center justify-center shrink-0",
                                        isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                                    )}
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Refresh Button */}
            <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 shrink-0"
                onClick={refreshActiveTab}
                title="تحديث الصفحة الحالية"
            >
                <RefreshCw className="h-4 w-4" />
            </Button>

            {/* Add Tab Button */}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0">
                        <Plus className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>فتح صفحة جديدة</DropdownMenuLabel>
                    <DropdownMenuSeparator />

                    {menuGroups.map((group, groupIndex) => {
                        // Filter items based on permissions
                        const visibleItems = group.items.filter(item =>
                            can(item.permission as any, 'view')
                        );

                        if (visibleItems.length === 0) return null;

                        return (
                            <React.Fragment key={groupIndex}>
                                <DropdownMenuSub>
                                    <DropdownMenuSubTrigger>
                                        <span>{group.label}</span>
                                    </DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent>
                                        {visibleItems.map((item) => {
                                            const info = pathToTabInfo[item.path];
                                            const IconComponent = iconComponents[info?.iconName || 'FileText'];

                                            return (
                                                <DropdownMenuItem
                                                    key={item.path}
                                                    onClick={() => handleAddTab(item.path)}
                                                    className="gap-2"
                                                >
                                                    {IconComponent && <IconComponent className="h-4 w-4" />}
                                                    <span>{item.name}</span>
                                                </DropdownMenuItem>
                                            );
                                        })}
                                    </DropdownMenuSubContent>
                                </DropdownMenuSub>
                            </React.Fragment>
                        );
                    })}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}

export default TabBar;
