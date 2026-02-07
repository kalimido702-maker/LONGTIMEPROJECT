import { POSHeader } from "@/components/POS/POSHeader";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useNavigate } from "react-router-dom";
import {
  Settings as SettingsIcon,
  Store,
  MessageCircle,
  Infinity,
  Users,
  Shield,
  Key,
  Monitor,
  Calendar,
  Copy,
  CheckCircle,
  XCircle,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/hooks/use-settings";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";
import { db } from "@/shared/lib/indexedDB";
import { useThemeContext } from "@/contexts/ThemeContext";
import { AVAILABLE_THEMES } from "@/lib/theme.config";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Palette, Moon, Sun, Printer } from "lucide-react";
import { PrintSettingsTab } from "@/components/settings/PrintSettingsTab";

const Settings = () => {
  const { can } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const {
    settings,
    getSetting,
    updateSetting,
    updateMultipleSettings,
    loading,
  } = useSettings();
  const [formData, setFormData] = useState<{ [key: string]: string }>({});
  const { mode, colorScheme, setMode, setColorScheme, toggleMode } =
    useThemeContext();

  // License state
  const [licenseLoading, setLicenseLoading] = useState(true);
  const [licenseData, setLicenseData] = useState<{
    valid: boolean;
    message: string;
    data?: {
      licenseKey: string;
      deviceId: string;
      activationDate: string;
      expiryDate?: string;
      customerName?: string;
    };
  } | null>(null);
  const [deviceId, setDeviceId] = useState<string>("");
  const isElectron =
    typeof window !== "undefined" && window.electronAPI?.license;

  useEffect(() => {
    // تحميل جميع الإعدادات في formData
    const data: { [key: string]: string } = {};
    settings.forEach((setting) => {
      data[setting.key] = setting.value;
    });
    setFormData(data);
  }, [settings]);

  // Load license info
  useEffect(() => {
    const loadLicense = async () => {
      if (isElectron) {
        try {
          const id = await window.electronAPI.license.getDeviceId();
          setDeviceId(id);
          const result = await window.electronAPI.license.verify();
          setLicenseData(result);
        } catch (error) {
          console.error("Error loading license:", error);
        }
      }
      setLicenseLoading(false);
    };
    loadLicense();
  }, []);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "✅ تم النسخ",
      description: `تم نسخ ${label} إلى الحافظة`,
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("ar-EG", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const handleSave = async () => {
    if (!can("settings", "edit")) {
      toast({
        title: "غير مصرح",
        description: "ليس لديك صلاحية لتعديل الإعدادات",
        variant: "destructive",
      });
      return;
    }

    try {
      // حفظ كل الإعدادات المعدلة
      const updates = Object.entries(formData).map(([key, value]) => ({
        key,
        value,
      }));
      await updateMultipleSettings(updates);
      toast({
        title: "تم حفظ الإعدادات بنجاح",
        description: "تم تحديث جميع الإعدادات في قاعدة البيانات",
      });
    } catch (error) {
      toast({
        title: "خطأ في حفظ الإعدادات",
        description: "حدث خطأ أثناء حفظ الإعدادات",
        variant: "destructive",
      });
    }
  };

  const handleChange = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const getValue = (key: string, defaultValue: string = "") => {
    return formData[key] !== undefined
      ? formData[key]
      : getSetting(key) || defaultValue;
  };

  const getBoolValue = (key: string) => {
    const value = getValue(key);
    return value === "true" || value === "1";
  };



  if (!can("settings", "view")) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <POSHeader />
        <div className="container mx-auto p-6">
          <Card className="p-8 text-center">
            <h2 className="text-2xl font-bold mb-4">غير مصرح</h2>
            <p>ليس لديك صلاحية لعرض الإعدادات</p>
          </Card>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <POSHeader />
        <div className="container mx-auto p-6 text-center">
          <p>جاري تحميل الإعدادات...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <POSHeader />
      <div className="container mx-auto p-6">
        <div className="flex items-center gap-3 mb-6">
          <SettingsIcon className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">الإعدادات</h1>
        </div>

        <Tabs defaultValue="general" className="space-y-4">
          <TabsList>
            <TabsTrigger value="general">عام</TabsTrigger>
            <TabsTrigger value="print">الطباعة</TabsTrigger>
            <TabsTrigger value="theme">الثيمات والألوان</TabsTrigger>
            <TabsTrigger value="store">بيانات المتجر</TabsTrigger>
            <TabsTrigger value="whatsapp">واتساب</TabsTrigger>
            <TabsTrigger value="license">الترخيص</TabsTrigger>
            <TabsTrigger value="license">الترخيص</TabsTrigger>
          </TabsList>

          <TabsContent value="general">
            <Card className="p-6">
              <h2 className="text-xl font-bold mb-4">الإعدادات العامة</h2>
              <div className="space-y-4">
                <div>
                  <Label>اسم النظام</Label>
                  <Input
                    value={getValue("storeName", "نظام نقاط البيع")}
                    onChange={(e) => handleChange("storeName", e.target.value)}
                  />
                </div>
                <div>
                  <Label>نسبة الضريبة (%)</Label>
                  <Input
                    type="number"
                    value={getValue("taxRate", "14")}
                    step="0.01"
                    onChange={(e) => handleChange("taxRate", e.target.value)}
                  />
                </div>
                <div>
                  <Label>العملة</Label>
                  <Input
                    value={getValue("currency", "EGP")}
                    onChange={(e) => handleChange("currency", e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="auto-print"
                    checked={getBoolValue("printReceipt")}
                    onCheckedChange={(checked) =>
                      handleChange("printReceipt", checked ? "true" : "false")
                    }
                  />
                  <Label htmlFor="auto-print">طباعة تلقائية للفواتير</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="sound"
                    checked={getBoolValue("soundEnabled")}
                    onCheckedChange={(checked) =>
                      handleChange("soundEnabled", checked ? "true" : "false")
                    }
                  />
                  <Label htmlFor="sound">تفعيل الأصوات</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="kitchen-print"
                    checked={getBoolValue("printKitchen")}
                    onCheckedChange={(checked) =>
                      handleChange("printKitchen", checked ? "true" : "false")
                    }
                  />
                  <Label htmlFor="kitchen-print">طباعة أوردرات المطبخ</Label>
                </div>
                <Button onClick={handleSave} disabled={loading}>
                  {loading ? "جاري الحفظ..." : "حفظ الإعدادات"}
                </Button>
              </div>
            </Card>
          </TabsContent>

          {/* Print Settings Tab */}
          <TabsContent value="print">
            <PrintSettingsTab />
          </TabsContent>

          <TabsContent value="theme">
            <Card className="p-6">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Palette className="h-5 w-5" />
                الثيمات والألوان
              </h2>
              <div className="space-y-6">
                <div>
                  <Label className="text-base font-semibold mb-3 block">
                    🎨 اختر نظام الألوان المفضل
                  </Label>
                  <Select
                    value={colorScheme}
                    onValueChange={(value: any) => setColorScheme(value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AVAILABLE_THEMES.map((theme) => (
                        <SelectItem key={theme.id} value={theme.id}>
                          <span className="flex items-center gap-2">
                            <span>{theme.icon}</span>
                            <span>{theme.name}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground mt-2">
                    سيتم تطبيق نظام الألوان على جميع الرسوم البيانية والواجهات
                  </p>
                </div>

                <div>
                  <Label className="text-base font-semibold mb-3 block">
                    🌗 الوضع الضوئي
                  </Label>
                  <div className="grid grid-cols-2 gap-4">
                    <Card
                      className={`p- 4 cursor - pointer transition - all border - 2 ${mode === "light"
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                        }`}
                      onClick={() => setMode("light")}
                    >
                      <div className="flex flex-col items-center gap-2">
                        <Sun
                          className={`h - 8 w - 8 ${mode === "light"
                            ? "text-primary"
                            : "text-muted-foreground"
                            } `}
                        />
                        <span className="font-semibold">الوضع النهاري</span>
                      </div>
                    </Card>

                    <Card
                      className={`p - 4 cursor - pointer transition - all border - 2 ${mode === "dark"
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                        } `}
                      onClick={() => setMode("dark")}
                    >
                      <div className="flex flex-col items-center gap-2">
                        <Moon
                          className={`h - 8 w - 8 ${mode === "dark"
                            ? "text-primary"
                            : "text-muted-foreground"
                            } `}
                        />
                        <span className="font-semibold">الوضع الليلي</span>
                      </div>
                    </Card>
                  </div>
                </div>

                <div>
                  <Label className="text-base font-semibold mb-3 block">
                    👁️ معاينة الألوان
                  </Label>
                  <div className="grid grid-cols-4 gap-3">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 rounded-full bg-primary shadow-md"></div>
                      <span className="text-xs">رئيسي</span>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 rounded-full bg-secondary shadow-md"></div>
                      <span className="text-xs">ثانوي</span>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 rounded-full bg-accent shadow-md"></div>
                      <span className="text-xs">تكميلي</span>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 rounded-full bg-success shadow-md"></div>
                      <span className="text-xs">نجاح</span>
                    </div>
                  </div>
                </div>

                <div className="bg-muted p-4 rounded-lg">
                  <h3 className="font-semibold mb-2">ℹ️ ملاحظة</h3>
                  <p className="text-sm text-muted-foreground">
                    التغييرات تُطبق فوراً وتُحفظ تلقائياً! جميع الألوان في
                    التطبيق ستتغير حسب اختيارك.
                  </p>
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="store">
            <Card className="p-6">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Store className="h-5 w-5" />
                بيانات المتجر
              </h2>
              <div className="space-y-4">
                <div>
                  <Label>اسم المتجر</Label>
                  <Input
                    value={getValue("storeName", "متجري")}
                    onChange={(e) => handleChange("storeName", e.target.value)}
                    placeholder="مثال: سوبر ماركت الأمل"
                  />
                </div>
                <div>
                  <Label>العنوان</Label>
                  <Input
                    value={getValue("storeAddress", "")}
                    onChange={(e) =>
                      handleChange("storeAddress", e.target.value)
                    }
                    placeholder="مثال: 123 شارع الجمهورية، القاهرة"
                  />
                </div>
                <div>
                  <Label>رقم الهاتف</Label>
                  <Input
                    value={getValue("storePhone", "")}
                    onChange={(e) => handleChange("storePhone", e.target.value)}
                    placeholder="مثال: 0123456789"
                  />
                </div>
                <div>
                  <Label>الرقم الضريبي</Label>
                  <Input
                    value={getValue("taxNumber", "")}
                    onChange={(e) => handleChange("taxNumber", e.target.value)}
                    placeholder="مثال: 123-456-789"
                  />
                </div>
                <div>
                  <Label>السجل التجاري</Label>
                  <Input
                    value={getValue("commercialRegister", "")}
                    onChange={(e) =>
                      handleChange("commercialRegister", e.target.value)
                    }
                    placeholder="مثال: 987654"
                  />
                </div>
                <div>
                  <Label>رقم بداية الفواتير</Label>
                  <Input
                    value={getValue("invoicePrefix", "INV")}
                    onChange={(e) =>
                      handleChange("invoicePrefix", e.target.value)
                    }
                    placeholder="مثال: INV"
                  />
                </div>
                <Button onClick={handleSave} disabled={loading}>
                  {loading ? "جاري الحفظ..." : "حفظ البيانات"}
                </Button>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="whatsapp">
            <Card className="p-6">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-green-500" />
                إعدادات واتساب
              </h2>
              <div className="space-y-6">
                {/* Max Accounts Setting */}
                <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="h-5 w-5 text-green-600 dark:text-green-400" />
                    <Label className="text-base font-semibold">
                      الحد الأقصى لحسابات واتساب
                    </Label>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Input
                        type="number"
                        min="0"
                        value={getValue("whatsappMaxAccounts", "0")}
                        onChange={(e) =>
                          handleChange("whatsappMaxAccounts", e.target.value)
                        }
                        className="w-32"
                        placeholder="0"
                      />
                      <div className="flex items-center gap-1 text-muted-foreground">
                        {getValue("whatsappMaxAccounts", "0") === "0" ? (
                          <>
                            <Infinity className="h-4 w-4" />
                            <span className="text-sm">غير محدود</span>
                          </>
                        ) : (
                          <span className="text-sm">حساب كحد أقصى</span>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      💡 أدخل <strong>0</strong> للسماح بعدد غير محدود من
                      الحسابات، أو أدخل رقماً محدداً لتحديد الحد الأقصى
                    </p>
                  </div>
                </div>

                {/* Info Box */}
                <div className="bg-muted p-4 rounded-lg">
                  <h3 className="font-semibold mb-2">ℹ️ ملاحظة</h3>
                  <p className="text-sm text-muted-foreground">
                    هذا الإعداد يحدد عدد حسابات واتساب التي يمكن إضافتها للنظام.
                    يمكنك إدارة الحسابات من صفحة "واتساب" في القائمة الرئيسية.
                  </p>
                </div>

                <Button onClick={handleSave} disabled={loading}>
                  {loading ? "جاري الحفظ..." : "حفظ الإعدادات"}
                </Button>
              </div>
            </Card>
          </TabsContent>

          {/* License Tab */}
          <TabsContent value="license">
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-6">
                <Shield className="h-6 w-6 text-primary" />
                <h2 className="text-xl font-bold">معلومات الترخيص</h2>
              </div>

              {licenseLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="mr-2">جاري التحميل...</span>
                </div>
              ) : !isElectron ? (
                <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                  <p className="text-amber-800 dark:text-amber-200">
                    ⚠️ معلومات الترخيص متاحة فقط في تطبيق سطح المكتب
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* License Status */}
                  <div
                    className={`p-4 rounded-lg border ${licenseData?.valid
                      ? "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800"
                      : "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800"
                      }`}
                  >
                    <div className="flex items-center gap-2">
                      {licenseData?.valid ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500" />
                      )}
                      <span
                        className={`font-bold ${licenseData?.valid
                          ? "text-green-700 dark:text-green-300"
                          : "text-red-700 dark:text-red-300"
                          }`}
                      >
                        {licenseData?.valid
                          ? "✅ الترخيص مُفعّل"
                          : "❌ الترخيص غير مُفعّل"}
                      </span>
                    </div>
                    <p
                      className={`text-sm mt-1 ${licenseData?.valid
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-600 dark:text-red-400"
                        }`}
                    >
                      {licenseData?.message}
                    </p>
                  </div>

                  {/* License Details */}
                  {licenseData?.valid && licenseData.data && (
                    <div className="grid gap-4 md:grid-cols-2">
                      {/* License Key */}
                      <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                        <Key className="h-5 w-5 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-muted-foreground">
                            مفتاح الترخيص
                          </p>
                          <p className="font-mono text-sm truncate">
                            {licenseData.data.licenseKey}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            copyToClipboard(
                              licenseData.data!.licenseKey,
                              "مفتاح الترخيص"
                            )
                          }
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>

                      {/* Device ID */}
                      <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                        <Monitor className="h-5 w-5 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-muted-foreground">
                            معرّف الجهاز
                          </p>
                          <p className="font-mono text-sm truncate">
                            {licenseData.data.deviceId}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            copyToClipboard(
                              licenseData.data!.deviceId,
                              "معرّف الجهاز"
                            )
                          }
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>

                      {/* Activation Date */}
                      <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                        <Calendar className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="text-sm text-muted-foreground">
                            تاريخ التفعيل
                          </p>
                          <p className="font-medium">
                            {formatDate(licenseData.data.activationDate)}
                          </p>
                        </div>
                      </div>

                      {/* Expiry Date */}
                      {licenseData.data.expiryDate && (
                        <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                          <Calendar className="h-5 w-5 text-orange-500" />
                          <div>
                            <p className="text-sm text-muted-foreground">
                              تاريخ الانتهاء
                            </p>
                            <p className="font-medium">
                              {formatDate(licenseData.data.expiryDate)}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Customer Name */}
                      {licenseData.data.customerName && (
                        <div className="flex items-center gap-3 p-3 bg-muted rounded-lg md:col-span-2">
                          <Users className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="text-sm text-muted-foreground">
                              اسم العميل
                            </p>
                            <p className="font-medium">
                              {licenseData.data.customerName}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Device ID (when not licensed) */}
                  {!licenseData?.valid && deviceId && (
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-sm text-muted-foreground mb-2">
                        معرّف الجهاز الخاص بك:
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 bg-background px-3 py-2 rounded font-mono text-sm">
                          {deviceId}
                        </code>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() =>
                            copyToClipboard(deviceId, "معرّف الجهاز")
                          }
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        أرسل هذا المعرّف للدعم الفني للحصول على مفتاح الترخيص
                      </p>
                    </div>
                  )}

                  {/* Help Text */}
                  <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <h3 className="font-bold text-blue-800 dark:text-blue-200 mb-2">
                      ℹ️ ملاحظات هامة
                    </h3>
                    <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                      <li>• الترخيص مرتبط بجهاز واحد فقط</li>
                      <li>• لنقل الترخيص لجهاز آخر، تواصل مع الدعم الفني</li>
                      <li>• احتفظ بمفتاح الترخيص في مكان آمن</li>
                    </ul>
                  </div>

                  {/* Activate Button */}
                  {!licenseData?.valid && (
                    <Button
                      className="w-full"
                      onClick={() => navigate("/license")}
                    >
                      <Key className="h-4 w-4 ml-2" />
                      تفعيل الترخيص
                    </Button>
                  )}
                </div>
              )}
            </Card>
          </TabsContent>


        </Tabs>
      </div>
    </div >
  );
};

export default Settings;
