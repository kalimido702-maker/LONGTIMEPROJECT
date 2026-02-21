/**
 * TabContent Component - Renders the content of the active tab
 * Each tab's content is kept mounted to preserve state
 */

import React, { Suspense, lazy } from 'react';
import { useTabs } from '@/contexts/TabContext';
import { cn } from '@/lib/utils';

// Lazy load pages for better performance
const POSv2 = lazy(() => import('@/pages/pos/POSv2'));
const Home = lazy(() => import('@/pages/Home'));
const Restaurant = lazy(() => import('@/pages/pos/Restaurant'));
const Customers = lazy(() => import('@/pages/sales/Customers'));
const Invoices = lazy(() => import('@/pages/sales/Invoices'));
const Quotes = lazy(() => import('@/pages/sales/Quotes'));
const SalesReturns = lazy(() => import('@/pages/sales/SalesReturns'));
const Promotions = lazy(() => import('@/pages/sales/Promotions'));
const Suppliers = lazy(() => import('@/pages/purchases/Suppliers'));
const Purchases = lazy(() => import('@/pages/purchases/Purchases'));
const PurchaseReturns = lazy(() => import('@/pages/purchases/PurchaseReturns'));
const Inventory = lazy(() => import('@/pages/inventory/Inventory'));
const ProductCategories = lazy(() => import('@/pages/inventory/ProductCategories'));
const Units = lazy(() => import('@/pages/inventory/Units'));
const PriceTypes = lazy(() => import('@/pages/inventory/PriceTypes'));
const Warehouses = lazy(() => import('@/pages/inventory/Warehouses'));
const Employees = lazy(() => import('@/pages/employees/Employees'));
const EmployeeAdvances = lazy(() => import('@/pages/employees/EmployeeAdvances'));
const EmployeeDeductions = lazy(() => import('@/pages/employees/EmployeeDeductions'));
const Expenses = lazy(() => import('@/pages/finance/Expenses'));
const ExpenseCategories = lazy(() => import('@/pages/finance/ExpenseCategories'));
const Deposits = lazy(() => import('@/pages/finance/Deposits'));
const DepositSources = lazy(() => import('@/pages/finance/DepositSources'));
const Installments = lazy(() => import('@/pages/finance/Installments'));
const Credit = lazy(() => import('@/pages/finance/Credit'));
const PaymentMethods = lazy(() => import('@/pages/finance/PaymentMethods'));
const Collections = lazy(() => import('@/pages/finance/Collections'));
const Bonus = lazy(() => import('@/pages/finance/Bonus'));
const SupervisorBonus = lazy(() => import('@/pages/finance/SupervisorBonus'));
const Reports = lazy(() => import('@/pages/reports/ReportsNew'));
const SalesRepReport = lazy(() => import('@/pages/reports/SalesRepReport'));
// const Shifts = lazy(() => import('@/pages/reports/Shifts'));
const WhatsAppManagement = lazy(() => import('@/pages/whatsapp/WhatsAppManagement'));
const WhatsAppCampaigns = lazy(() => import('@/pages/whatsapp/WhatsAppCampaigns'));
const WhatsAppGroups = lazy(() => import('@/pages/whatsapp/WhatsAppGroups'));
const Settings = lazy(() => import('@/pages/settings/Settings'));
const BackupSettings = lazy(() => import('@/pages/settings/BackupSettings'));
const RolesPermissions = lazy(() => import('@/pages/settings/RolesPermissions'));
const Supervisors = lazy(() => import('@/pages/supervisors/Supervisors'));
const SalesReps = lazy(() => import('@/pages/salesReps/SalesReps'));

// Map paths to components
const pathToComponent: Record<string, React.ComponentType> = {
    '/': Home,
    '/pos': POSv2,
    '/restaurant': Restaurant,
    '/customers': Customers,
    '/invoices': Invoices,
    '/quotes': Quotes,
    '/sales-returns': SalesReturns,
    '/promotions': Promotions,
    '/suppliers': Suppliers,
    '/purchases': Purchases,
    '/purchase-returns': PurchaseReturns,
    '/inventory': Inventory,
    '/product-categories': ProductCategories,
    '/units': Units,
    '/price-types': PriceTypes,
    '/warehouses': Warehouses,
    '/employees': Employees,
    '/employee-advances': EmployeeAdvances,
    '/employee-deductions': EmployeeDeductions,
    '/expenses': Expenses,
    '/expense-categories': ExpenseCategories,
    '/deposits': Deposits,
    '/deposit-sources': DepositSources,
    '/installments': Installments,
    '/credit': Credit,
    '/payment-methods': PaymentMethods,
    '/collections': Collections,
    '/bonus': Bonus,
    '/supervisor-bonus': SupervisorBonus,
    '/reports': Reports,
    '/sales-rep-report': SalesRepReport,
    // '/shifts': Shifts,
    '/whatsapp-management': WhatsAppManagement,
    '/whatsapp-campaigns': WhatsAppCampaigns,
    '/whatsapp-groups': WhatsAppGroups,
    '/settings': Settings,
    '/backup-settings': BackupSettings,
    '/roles-permissions': RolesPermissions,
    '/supervisors': Supervisors,
    '/sales-reps': SalesReps,
};

// Loading fallback
const LoadingFallback = () => (
    <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
            <p className="text-muted-foreground text-sm">جاري التحميل...</p>
        </div>
    </div>
);

export function TabContent() {
    const { tabs, activeTabId, refreshCounter } = useTabs();

    return (
        <div className="flex-1 overflow-hidden">
            {tabs.map((tab) => {
                const Component = pathToComponent[tab.path];
                const isActive = tab.id === activeTabId;
                if (!Component) {
                    return (
                        <div
                            key={tab.id}
                            className={cn(
                                "h-full",
                                tab.id === activeTabId ? "block" : "hidden"
                            )}
                        >
                            <div className="flex items-center justify-center h-full">
                                <p className="text-muted-foreground">الصفحة غير موجودة: {tab.path}</p>
                            </div>
                        </div>
                    );
                }

                return (
                    <div
                        key={`${tab.id}-${refreshCounter}`}
                        className={cn(
                            "h-full overflow-auto",
                            isActive ? "block" : "hidden"
                        )}
                    >
                        <Suspense fallback={<LoadingFallback />}>
                            <Component />
                        </Suspense>
                    </div>
                );
            })}
        </div>
    );
}

export default TabContent;
