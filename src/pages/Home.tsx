import { useTabs } from "@/contexts/TabContext";
import {
    ShoppingCart,
    Package,
    FileText,
    Users,
    TrendingUp,
    Settings,
    Wallet,
    Printer,
    Shield,
    LogOut,
    LayoutGrid,
    Plus
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useSettingsContext } from "@/contexts/SettingsContext";

const Home = () => {
    const { addTab } = useTabs();
    const { logout, user, can } = useAuth();
    const { getSetting } = useSettingsContext();
    const storeName = getSetting("storeName") || "نظام إدارة المبيعات";

    const menuItems = [
        {
            title: "نقطة البيع",
            icon: ShoppingCart,
            path: "/pos",
            color: "text-blue-600",
            bgColor: "bg-blue-100",
            description: "إنشاء فواتير مبيعات ومرتجعات"
        },
        {
            title: "التصنيفات والمخزون",
            icon: Package,
            path: "/inventory",
            color: "text-orange-600",
            bgColor: "bg-orange-100",
            description: "إدارة المنتجات والمخزون والجرد"
        },
        {
            title: "العملاء",
            icon: Users,
            path: "/customers",
            color: "text-green-600",
            bgColor: "bg-green-100",
            description: "إدارة بيانات العملاء والديون"
        },
        {
            title: "الفواتير",
            icon: FileText,
            path: "/invoices",
            color: "text-purple-600",
            bgColor: "bg-purple-100",
            description: "سجل الفواتير والمبيعات السابقة"
        },
        {
            title: "القبض السريع",
            icon: Wallet,
            path: "/collections",
            color: "text-teal-600",
            bgColor: "bg-teal-100",
            description: "تسجيل دفعات العملاء (سندات قبض)"
        },
        {
            title: "التقارير",
            icon: TrendingUp,
            path: "/reports",
            color: "text-indigo-600",
            bgColor: "bg-indigo-100",
            description: "تقارير المبيعات والأرباح والديون"
        },
        {
            title: "الإعدادات",
            icon: Settings,
            path: "/settings",
            color: "text-gray-600",
            bgColor: "bg-gray-100",
            description: "إعدادات النظام والطباعة"
        }
    ];

    return (
        <div className="h-full p-6 overflow-auto bg-background" dir="rtl">
            <div className="max-w-6xl mx-auto space-y-8">
                {/* Header */}
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 mb-2 dark:text-gray-200">
                            مرحباً، {user?.username || "المستخدم"} 👋
                        </h1>
                        <p className="text-gray-500">
                            {storeName} - لوحة التحكم الرئيسية
                        </p>
                    </div>
                    <div className="flex gap-2">
                        {(can("invoices", "create") || can("invoices", "view")) && (
                            <Button onClick={() => addTab("/pos")} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                                <Plus className="h-4 w-4" />
                                فاتورة جديدة
                            </Button>
                        )}
                        {can("collections", "create") && (
                            <Button onClick={() => addTab("/collections")} className="gap-2 bg-green-600 hover:bg-green-700 text-white">
                                <Wallet className="h-4 w-4" />
                                إضافة قبض
                            </Button>
                        )}
                    </div>
                </div>

                {/* Quick Stats / Info Cards could go here */}

                {/* Menu Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {menuItems.map((item, index) => (
                        <Card
                            key={index}
                            className="hover:shadow-lg transition-all cursor-pointer border-none shadow-sm group"
                            onClick={() => addTab(item.path)}
                        >
                            <CardContent className="p-6 flex flex-col items-center text-center space-y-4">
                                <div
                                    className={`p-4 rounded-2xl ${item.bgColor} ${item.color} group-hover:scale-110 transition-transform duration-300`}
                                >
                                    <item.icon className="h-8 w-8" />
                                </div>
                                <div className="space-y-1">
                                    <h3 className="font-bold text-lg text-gray-800 dark:text-gray-200">
                                        {item.title}
                                    </h3>
                                    <p className="text-sm text-gray-500 font-normal">
                                        {item.description}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* Footer actions or info */}
                <div className="pt-8 border-t flex justify-between items-center text-sm text-gray-400">
                    <p>الإصدار 2.0.0</p>
                    <p>جميع الحقوق محفوظة &copy; {new Date().getFullYear()}</p>
                </div>
            </div>
        </div>
    );
};

export default Home;
