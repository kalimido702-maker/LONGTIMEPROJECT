import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Key,
  Shield,
  CheckCircle,
  XCircle,
  Loader2,
  Copy,
  Monitor,
  Calendar,
  User,
  AlertTriangle,
  RefreshCw,
  Info,
  Home,
  ArrowRight,
} from "lucide-react";

interface LicenseData {
  licenseKey: string;
  deviceId: string;
  activationDate: string;
  expiryDate?: string;
  customerName?: string;
}

interface LicenseStatus {
  valid: boolean;
  message: string;
  data?: LicenseData;
}

const LicenseActivation: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(
    null
  );
  const [deviceId, setDeviceId] = useState<string>("");
  const [licenseKey, setLicenseKey] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [deactivateCode, setDeactivateCode] = useState("");
  const [deactivating, setDeactivating] = useState(false);

  // Check if running in Electron
  const isElectron = typeof window !== "undefined" && window.electronAPI;

  useEffect(() => {
    checkLicense();
  }, []);

  const checkLicense = async () => {
    setLoading(true);
    try {
      if (isElectron) {
        // Get device ID
        const id = await window.electronAPI.license.getDeviceId();
        setDeviceId(id);

        // Verify license
        const status = await window.electronAPI.license.verify();
        setLicenseStatus(status);
      } else {
        // For development in browser
        setDeviceId("DEV-MODE-XXXX-XXXX");
        setLicenseStatus({
          valid: true,
          message: "وضع التطوير - الترخيص غير مطلوب",
        });
      }
    } catch (error) {
      console.error("Error checking license:", error);
      setLicenseStatus({
        valid: false,
        message: "حدث خطأ أثناء التحقق من الترخيص",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatLicenseKey = (value: string) => {
    // Remove all non-alphanumeric characters
    const cleaned = value.replace(/[^A-Z0-9]/gi, "").toUpperCase();
    // Add dashes every 4 characters
    const formatted = cleaned.match(/.{1,4}/g)?.join("-") || cleaned;
    return formatted.substring(0, 19); // Max: XXXX-XXXX-XXXX-XXXX
  };

  const handleLicenseKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatLicenseKey(e.target.value);
    setLicenseKey(formatted);
  };

  const handleActivate = async () => {
    if (!licenseKey || licenseKey.replace(/-/g, "").length !== 16) {
      toast({
        title: "❌ خطأ",
        description: "يرجى إدخال مفتاح ترخيص صحيح (16 حرف)",
        variant: "destructive",
      });
      return;
    }

    setActivating(true);
    try {
      if (isElectron) {
        const result = await window.electronAPI.license.activate(
          licenseKey,
          customerName || undefined
        );

        if (result.success) {
          toast({
            title: "✅ تم التفعيل بنجاح!",
            description: result.message,
          });
          await checkLicense();
        } else {
          toast({
            title: "❌ فشل التفعيل",
            description: result.message,
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "⚠️ وضع التطوير",
          description: "التفعيل متاح فقط في تطبيق Electron",
        });
      }
    } catch (error: any) {
      toast({
        title: "❌ خطأ",
        description: error.message || "حدث خطأ أثناء التفعيل",
        variant: "destructive",
      });
    } finally {
      setActivating(false);
    }
  };

  const handleDeactivate = async () => {
    if (!deactivateCode) {
      toast({
        title: "❌ خطأ",
        description: "يرجى إدخال كود التأكيد",
        variant: "destructive",
      });
      return;
    }

    setDeactivating(true);
    try {
      if (isElectron) {
        const result = await window.electronAPI.license.deactivate(
          deactivateCode
        );

        if (result.success) {
          toast({
            title: "✅ تم إلغاء التفعيل",
            description: result.message,
          });
          setShowDeactivateDialog(false);
          setDeactivateCode("");
          await checkLicense();
        } else {
          toast({
            title: "❌ فشل",
            description: result.message,
            variant: "destructive",
          });
        }
      }
    } catch (error: any) {
      toast({
        title: "❌ خطأ",
        description: error.message || "حدث خطأ",
        variant: "destructive",
      });
    } finally {
      setDeactivating(false);
    }
  };

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
          <p className="mt-4 text-muted-foreground">
            جاري التحقق من الترخيص...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl" dir="rtl">
      {/* Header */}
      <div className="mb-8">
        {/* زر واحد فقط للاستمرار - يظهر بعد التفعيل */}
        {licenseStatus?.valid && (
          <div className="flex justify-end mb-6">
            <Button
              variant="default"
              size="lg"
              onClick={() => window.location.reload()}
              className="gap-2"
            >
              <Home className="h-4 w-4" />
              الدخول للتطبيق
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold">تفعيل التطبيق</h1>
          <p className="text-muted-foreground mt-2">
            قم بتفعيل نسختك للاستمتاع بجميع المميزات
          </p>
        </div>
      </div>

      {/* License Status Card */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {licenseStatus?.valid ? (
                <CheckCircle className="h-6 w-6 text-green-500" />
              ) : (
                <XCircle className="h-6 w-6 text-red-500" />
              )}
              <div>
                <CardTitle>حالة الترخيص</CardTitle>
                <CardDescription>{licenseStatus?.message}</CardDescription>
              </div>
            </div>
            <Badge variant={licenseStatus?.valid ? "default" : "destructive"}>
              {licenseStatus?.valid ? "مُفعّل ✓" : "غير مُفعّل"}
            </Badge>
          </div>
        </CardHeader>

        {licenseStatus?.valid && licenseStatus.data && (
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {/* License Key */}
              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                <Key className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground">مفتاح الترخيص</p>
                  <p className="font-mono text-sm truncate">
                    {licenseStatus.data.licenseKey}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    copyToClipboard(
                      licenseStatus.data!.licenseKey,
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
                  <p className="text-sm text-muted-foreground">معرّف الجهاز</p>
                  <p className="font-mono text-sm truncate">
                    {licenseStatus.data.deviceId}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    copyToClipboard(
                      licenseStatus.data!.deviceId,
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
                  <p className="text-sm text-muted-foreground">تاريخ التفعيل</p>
                  <p className="font-medium">
                    {formatDate(licenseStatus.data.activationDate)}
                  </p>
                </div>
              </div>

              {/* Expiry Date */}
              {licenseStatus.data.expiryDate && (
                <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <Calendar className="h-5 w-5 text-orange-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">
                      تاريخ الانتهاء
                    </p>
                    <p className="font-medium">
                      {formatDate(licenseStatus.data.expiryDate)}
                    </p>
                  </div>
                </div>
              )}

              {/* Customer Name */}
              {licenseStatus.data.customerName && (
                <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <User className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">اسم العميل</p>
                    <p className="font-medium">
                      {licenseStatus.data.customerName}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <Separator className="my-4" />

            <div className="flex justify-end items-center">
              <Button
                variant="outline"
                className="text-red-500 hover:text-red-600"
                onClick={() => setShowDeactivateDialog(true)}
              >
                <RefreshCw className="h-4 w-4 ml-2" />
                نقل الترخيص لجهاز آخر
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Activation Form (only if not activated) */}
      {!licenseStatus?.valid && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              تفعيل الترخيص
            </CardTitle>
            <CardDescription>
              أدخل مفتاح الترخيص الذي حصلت عليه عند الشراء
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Device ID Info */}
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>معرّف الجهاز الخاص بك</AlertTitle>
              <AlertDescription className="flex items-center gap-2 mt-2">
                <code className="bg-muted px-2 py-1 rounded font-mono text-sm">
                  {deviceId}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => copyToClipboard(deviceId, "معرّف الجهاز")}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </AlertDescription>
            </Alert>

            {/* License Key Input */}
            <div className="space-y-2">
              <Label htmlFor="licenseKey">مفتاح الترخيص *</Label>
              <Input
                id="licenseKey"
                placeholder="XXXX-XXXX-XXXX-XXXX"
                value={licenseKey}
                onChange={handleLicenseKeyChange}
                className="font-mono text-center text-lg tracking-widest"
                dir="ltr"
                maxLength={19}
              />
              <p className="text-xs text-muted-foreground">
                المفتاح يتكون من 16 حرف ورقم
              </p>
            </div>

            {/* Customer Name Input */}
            <div className="space-y-2">
              <Label htmlFor="customerName">اسم العميل (اختياري)</Label>
              <Input
                id="customerName"
                placeholder="أدخل اسمك أو اسم الشركة"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>

            {/* Activate Button */}
            <Button
              className="w-full"
              size="lg"
              onClick={handleActivate}
              disabled={
                activating || licenseKey.replace(/-/g, "").length !== 16
              }
            >
              {activating ? (
                <>
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                  جاري التفعيل...
                </>
              ) : (
                <>
                  <Shield className="h-4 w-4 ml-2" />
                  تفعيل الترخيص
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Help Section */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            ملاحظات هامة
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              الترخيص مرتبط بجهاز واحد فقط ولا يمكن استخدامه على أجهزة متعددة
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              في حالة تغيير الجهاز، تواصل معنا للحصول على كود نقل الترخيص
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              احتفظ بمفتاح الترخيص في مكان آمن
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary">•</span>
              للدعم الفني: تواصل معنا عبر الواتساب أو البريد الإلكتروني
            </li>
          </ul>
        </CardContent>
      </Card>

      {/* Deactivate Dialog */}
      <Dialog
        open={showDeactivateDialog}
        onOpenChange={setShowDeactivateDialog}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-500">
              <AlertTriangle className="h-5 w-5" />
              نقل الترخيص لجهاز آخر
            </DialogTitle>
            <DialogDescription>
              هذه العملية ستلغي تفعيل التطبيق على هذا الجهاز. ستحتاج كود تأكيد
              من الدعم الفني.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>تحذير!</AlertTitle>
              <AlertDescription>
                بعد إلغاء التفعيل، لن يعمل التطبيق على هذا الجهاز حتى تقوم
                بتفعيله مرة أخرى.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="deactivateCode">كود التأكيد</Label>
              <Input
                id="deactivateCode"
                placeholder="أدخل كود التأكيد من الدعم الفني"
                value={deactivateCode}
                onChange={(e) => setDeactivateCode(e.target.value)}
                className="font-mono"
                dir="ltr"
              />
              <p className="text-xs text-muted-foreground">
                تواصل مع الدعم الفني للحصول على كود التأكيد
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDeactivateDialog(false);
                setDeactivateCode("");
              }}
            >
              إلغاء
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeactivate}
              disabled={deactivating || !deactivateCode}
            >
              {deactivating ? (
                <>
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                  جاري الإلغاء...
                </>
              ) : (
                "تأكيد إلغاء التفعيل"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LicenseActivation;
