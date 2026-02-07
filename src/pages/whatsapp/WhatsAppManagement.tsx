import { useState, useEffect } from "react";
import { POSHeader } from "@/components/POS/POSHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useSettingsContext } from "@/contexts/SettingsContext";
import { db, WhatsAppAccount } from "@/shared/lib/indexedDB";
import { whatsappService } from "@/services/whatsapp/whatsappService";
import {
  MessageSquare,
  Plus,
  Power,
  QrCode,
  Trash2,
  Wifi,
  WifiOff,
  Loader2,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  RefreshCw,
  Infinity,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { getQRColors } from "@/lib/theme.config";
import { useTheme } from "next-themes";
import QRCodeLib from "qrcode";

/**
 * رسائل المساعدة للمستخدم
 */
const HELP_MESSAGES = {
  NO_ACCOUNTS: {
    title: "👋 مرحباً بك في واتساب",
    description: "عشان تبدأ ترسل رسائل للعملاء، محتاج تضيف حساب واتساب وتربطه",
    steps: [
      "1️⃣ اضغط على زر 'إضافة حساب'",
      "2️⃣ أدخل اسم للحساب ورقم الموبايل",
      "3️⃣ اضغط 'ربط' وامسح الكود من الموبايل",
    ],
  },
  CONNECTION_HELP: {
    title: "📱 طريقة ربط الحساب",
    steps: [
      "1️⃣ افتح واتساب على الموبايل",
      "2️⃣ اضغط على النقط الثلاثة (⋮) أو الإعدادات",
      "3️⃣ اختر 'الأجهزة المرتبطة'",
      "4️⃣ اضغط 'ربط جهاز'",
      "5️⃣ امسح الكود اللي على الشاشة",
    ],
  },
  TROUBLESHOOTING: {
    title: "🔧 حل المشاكل",
    issues: [
      {
        problem: "الكود مش بيتمسح",
        solution: "تأكد إن الموبايل متصل بالنت وقريب من الشاشة",
      },
      {
        problem: "الحساب بيفصل كتير",
        solution: "تأكد إن الموبايل مفتوح فيه واتساب ومتصل بالنت",
      },
      {
        problem: "الرسائل مش بتتبعت",
        solution: "تأكد إن الحساب متصل (أخضر) ونشط",
      },
    ],
  },
};

const WhatsAppManagement = () => {
  const { toast } = useToast();
  const { can } = useAuth();
  const { theme } = useTheme();
  const { getSetting } = useSettingsContext();

  // الحد الأقصى لعدد الحسابات (0 = بلا حد)
  const maxWhatsAppAccounts = parseInt(
    getSetting("whatsappMaxAccounts") || "0"
  );
  const isUnlimited = maxWhatsAppAccounts === 0;

  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [addDialog, setAddDialog] = useState(false);
  const [qrDialog, setQrDialog] = useState(false);
  const [helpDialog, setHelpDialog] = useState(false);
  const [selectedQR, setSelectedQR] = useState<string>("");
  const [qrImage, setQrImage] = useState<string>("");
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // هل يمكن إضافة حساب جديد؟
  const canAddMoreAccounts =
    isUnlimited || accounts.length < maxWhatsAppAccounts;
  const remainingAccounts = isUnlimited
    ? Infinity
    : maxWhatsAppAccounts - accounts.length;

  // Loading states
  const [isLoading, setIsLoading] = useState(true);
  const [connectingAccount, setConnectingAccount] = useState<string | null>(
    null
  );
  const [deletingAccount, setDeletingAccount] = useState<string | null>(null);
  const [disconnectingAccount, setDisconnectingAccount] = useState<
    string | null
  >(null);
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [qrCountdown, setQrCountdown] = useState<number>(120);

  const [newAccount, setNewAccount] = useState({
    name: "",
    phone: "",
    dailyLimit: 100,
    antiSpamDelay: 3000,
  });

  useEffect(() => {
    loadAccounts();

    // Network listener with better messages
    const handleOnline = () => {
      setIsOnline(true);
      setConnectionError(null);
      toast({
        title: "🌐 تمام! الإنترنت رجع",
        description: "تقدر تبعت رسائل دلوقتي",
      });
    };

    const handleOffline = () => {
      setIsOnline(false);
      setConnectionError("مفيش إنترنت - تأكد من الاتصال وجرب تاني");
      toast({
        title: "🌐 الإنترنت فصل!",
        description: "الرسائل هتتبعت لما النت يرجع",
        variant: "destructive",
      });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Monitor WhatsApp connection states continuously
  useEffect(() => {
    if (!(window as any).electronAPI?.whatsapp) return;

    const statusChecker = setInterval(async () => {
      // Check status for all accounts
      for (const account of accounts) {
        try {
          const state = await (window as any).electronAPI.whatsapp.getState(
            account.id
          );

          // Update database if status changed
          if (state.status && state.status !== account.status) {
            account.status = state.status as any;
            await db.update("whatsappAccounts", account);

            // Reload to update UI
            await loadAccounts();

            // Show notification
            if (state.status === "connected") {
              toast({ title: `✅ ${account.name} متصل الآن` });
            } else if (state.status === "disconnected") {
              toast({
                title: `⚠️ ${account.name} غير متصل`,
                variant: "destructive",
              });
            }
          }
        } catch (error) {
          console.error(`Error checking status for ${account.id}:`, error);
        }
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(statusChecker);
  }, [accounts]);

  const loadAccounts = async () => {
    setIsLoading(true);
    try {
      await db.init();
      const data = await db.getAll<WhatsAppAccount>("whatsappAccounts");

      // Sync with electron state
      if ((window as any).electronAPI?.whatsapp) {
        for (const account of data) {
          const state = await (window as any).electronAPI.whatsapp.getState(
            account.id
          );
          if (state.status && state.status !== account.status) {
            account.status = state.status as any;
            await db.update("whatsappAccounts", account);
          }
        }
      }

      setAccounts(data);
    } catch (error: any) {
      console.error("Error loading accounts:", error);
      if (error.message?.includes("not found")) {
        toast({
          title: "خطأ في قاعدة البيانات",
          description:
            "جداول الواتساب غير موجودة. اضغط 'إعادة إنشاء قاعدة البيانات'",
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetDatabase = async () => {
    const confirmed = confirm(
      "هل أنت متأكد من إعادة إنشاء قاعدة البيانات؟\n\nسيتم حذف جميع البيانات القديمة!"
    );

    if (!confirmed) return;

    try {
      await db.resetDatabase();
      toast({
        title: "✅ تم إعادة إنشاء قاعدة البيانات",
        description: "يمكنك الآن إضافة حسابات الواتساب",
      });
      await loadAccounts();
    } catch (error) {
      toast({
        title: "خطأ",
        description: "فشل إعادة إنشاء قاعدة البيانات",
        variant: "destructive",
      });
    }
  };

  const handleAddAccount = async () => {
    if (!newAccount.name) {
      toast({ title: "اسم الحساب مطلوب", variant: "destructive" });
      return;
    }

    setIsAddingAccount(true);
    try {
      const account: WhatsAppAccount = {
        id: Date.now().toString(),
        name: newAccount.name,
        phone: "", // سيتم تحديثه تلقائياً عند الربط
        status: "disconnected",
        dailyLimit: newAccount.dailyLimit,
        dailySent: 0,
        lastResetDate: new Date().toISOString(),
        antiSpamDelay: newAccount.antiSpamDelay,
        isActive: false,
        createdAt: new Date().toISOString(),
      };

      await db.add("whatsappAccounts", account);
      await loadAccounts();
      setAddDialog(false);
      setNewAccount({
        name: "",
        phone: "",
        dailyLimit: 100,
        antiSpamDelay: 3000,
      });
      toast({ title: "✅ تم إضافة الحساب بنجاح" });
    } catch (error) {
      console.error("Error adding account:", error);
      toast({ title: "فشل إضافة الحساب", variant: "destructive" });
    } finally {
      setIsAddingAccount(false);
    }
  };

  const handleConnect = async (accountId: string) => {
    setConnectingAccount(accountId);
    setQrCountdown(120);

    try {
      await whatsappService.initAccount(accountId);

      let countdownInterval: number | null = null;
      let pollQR: number | null = null;

      // Start countdown timer (only once)
      countdownInterval = window.setInterval(() => {
        setQrCountdown((prev) => {
          if (prev <= 1) {
            if (countdownInterval) window.clearInterval(countdownInterval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // Poll for QR code from Electron main process (every 2 seconds to avoid conflicts)
      pollQR = window.setInterval(async () => {
        if ((window as any).electronAPI?.whatsapp) {
          const state = await (window as any).electronAPI.whatsapp.getState(
            accountId
          );

          if (state.status === "qr" && state.qrCode) {
            setSelectedQR(state.qrCode);
            setConnectionError(null);

            // Convert QR code text to image
            try {
              const qrColors = getQRColors(
                (theme as "light" | "dark") || "light"
              );
              const qrImageUrl = await QRCodeLib.toDataURL(state.qrCode, {
                width: 400,
                margin: 2,
                color: {
                  dark: qrColors.foreground,
                  light: qrColors.background,
                },
              });
              setQrImage(qrImageUrl);
              setQrDialog(true);
              setConnectingAccount(null);
            } catch (err) {
              console.error("Failed to generate QR image:", err);
              toast({
                title: "⚠️ مشكلة في الكود",
                description: "جرب اضغط 'ربط' تاني",
                variant: "destructive",
              });
            }

            // Don't stop polling yet - wait for connection
          } else if (state.status === "connected") {
            if (pollQR) window.clearInterval(pollQR);
            if (countdownInterval) window.clearInterval(countdownInterval);

            // Close QR dialog if open
            setQrDialog(false);
            setQrImage("");
            setSelectedQR("");
            setConnectingAccount(null);
            setConnectionError(null);

            // Update database status with real phone number from WhatsApp
            const account = await db.get<WhatsAppAccount>(
              "whatsappAccounts",
              accountId
            );
            if (account) {
              account.status = "connected";
              account.lastConnectedAt = new Date().toISOString();
              // حفظ رقم الهاتف الحقيقي من واتساب
              if (state.phone) {
                account.phone = state.phone;
              }
              await db.update("whatsappAccounts", account);
            }
            await loadAccounts();
            toast({
              title: "🎉 تمام! الحساب اتربط",
              description: `${account?.name} جاهز لإرسال الرسائل - فعّله عشان يشتغل`,
            });
          } else if (state.status === "failed") {
            if (pollQR) window.clearInterval(pollQR);
            if (countdownInterval) window.clearInterval(countdownInterval);
            setQrDialog(false);
            setConnectingAccount(null);

            const errorMsg =
              state.message || state.error || "فشل الاتصال - جرب تاني";
            setConnectionError(errorMsg);

            toast({
              title: "❌ مشكلة في الاتصال",
              description: errorMsg,
              variant: "destructive",
            });
          }
        }
      }, 2000);

      // Stop polling after 2 minutes
      setTimeout(() => {
        if (pollQR) window.clearInterval(pollQR);
        if (countdownInterval) window.clearInterval(countdownInterval);

        if (qrDialog) {
          setQrDialog(false);
          setConnectingAccount(null);
          toast({
            title: "⏱️ انتهت مهلة الاتصال",
            description: "يرجى المحاولة مرة أخرى",
            variant: "destructive",
          });
        }
      }, 120000);
    } catch (error) {
      setConnectingAccount(null);
      toast({ title: "فشل الاتصال", variant: "destructive" });
    }
  };

  const handleToggleActive = async (account: WhatsAppAccount) => {
    if (account.status !== "connected") {
      toast({ title: "يجب الاتصال أولاً", variant: "destructive" });
      return;
    }

    account.isActive = !account.isActive;
    await db.update("whatsappAccounts", account);
    await loadAccounts();
    toast({ title: account.isActive ? "تم التفعيل" : "تم التعطيل" });
  };

  const handleDelete = async (id: string) => {
    if (
      !confirm(
        "هل أنت متأكد من حذف هذا الحساب؟\nسيتم فصل الاتصال وحذف جميع البيانات المرتبطة."
      )
    )
      return;

    setDeletingAccount(id);
    try {
      // Disconnect from WhatsApp if connected
      if ((window as any).electronAPI?.whatsapp) {
        await (window as any).electronAPI.whatsapp.disconnect(id);
      }

      // Delete from database
      await db.delete("whatsappAccounts", id);

      // Delete related messages and campaigns (simple approach without filtering)
      try {
        const messages: any[] = await db.getAll("whatsappMessages");
        for (const msg of messages) {
          if (msg?.accountId === id) {
            await db.delete("whatsappMessages", msg.id);
          }
        }
      } catch (e) {
        console.log("No messages to delete");
      }

      try {
        const campaigns: any[] = await db.getAll("whatsappCampaigns");
        for (const camp of campaigns) {
          if (camp?.accountId === id) {
            await db.delete("whatsappCampaigns", camp.id);
          }
        }
      } catch (e) {
        console.log("No campaigns to delete");
      }

      await loadAccounts();
      toast({ title: "✅ تم حذف الحساب وجميع بياناته" });
    } catch (error) {
      console.error("Error deleting account:", error);
      toast({ title: "فشل حذف الحساب", variant: "destructive" });
    } finally {
      setDeletingAccount(null);
    }
  };

  const getStatusBadge = (status: WhatsAppAccount["status"]) => {
    const variants = {
      connected: "default",
      connecting: "secondary",
      qr: "outline",
      disconnected: "destructive",
      failed: "destructive",
    };

    const labels = {
      connected: "متصل",
      connecting: "يتصل...",
      qr: "انتظار QR",
      disconnected: "غير متصل",
      failed: "فشل",
    };

    return <Badge variant={variants[status] as any}>{labels[status]}</Badge>;
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <POSHeader />
      <main className="container mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <MessageSquare className="h-8 w-8" />
              إدارة حسابات WhatsApp
            </h1>
            <p className="text-muted-foreground mt-1">
              ربط وإدارة حسابات WhatsApp للنظام
            </p>
          </div>
          <div className="flex gap-3 items-center">
            {/* Help Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setHelpDialog(true)}
              title="مساعدة"
            >
              <HelpCircle className="h-5 w-5" />
            </Button>

            {/* Network Status */}
            <Badge
              variant={isOnline ? "default" : "destructive"}
              className="px-4 py-2"
            >
              {isOnline ? (
                <>
                  <Wifi className="h-4 w-4 ml-2" />
                  متصل بالنت
                </>
              ) : (
                <>
                  <WifiOff className="h-4 w-4 ml-2" />
                  مفيش نت!
                </>
              )}
            </Badge>

            {/* Reset Database Button */}
            {/* <Button variant="outline" onClick={handleResetDatabase} size="sm">
              <RefreshCw className="h-4 w-4 ml-2" />
              إعادة تعيين
            </Button> */}

            <Button
              onClick={() => setAddDialog(true)}
              disabled={!canAddMoreAccounts}
              title={
                !canAddMoreAccounts
                  ? "وصلت للحد الأقصى من الحسابات"
                  : "إضافة حساب جديد"
              }
            >
              <Plus className="h-4 w-4 ml-2" />
              إضافة حساب
            </Button>
          </div>
        </div>

        {/* Limit Reached Alert */}
        {!canAddMoreAccounts && (
          <Alert className="mb-6 border-orange-500 bg-orange-50 dark:bg-orange-950">
            <AlertCircle className="h-4 w-4 text-orange-600" />
            <AlertTitle className="text-orange-600">
              وصلت للحد الأقصى!
            </AlertTitle>
            <AlertDescription>
              الحد الأقصى المسموح به هو {maxWhatsAppAccounts} حساب. احذف حساب
              قديم لإضافة حساب جديد.
            </AlertDescription>
          </Alert>
        )}

        {/* Error Alert */}
        {connectionError && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>حصلت مشكلة</AlertTitle>
            <AlertDescription className="flex items-center justify-between">
              <span>{connectionError}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConnectionError(null)}
              >
                تمام
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Offline Alert */}
        {!isOnline && (
          <Alert variant="destructive" className="mb-6">
            <WifiOff className="h-4 w-4" />
            <AlertTitle>مفيش إنترنت!</AlertTitle>
            <AlertDescription>
              تأكد إن الجهاز متصل بالإنترنت عشان تقدر تربط الحسابات وتبعت رسائل
            </AlertDescription>
          </Alert>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card className={!canAddMoreAccounts ? "border-orange-500" : ""}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                عدد الحسابات
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold flex items-center gap-2">
                {accounts.length}
                <span className="text-muted-foreground text-lg">/</span>
                {isUnlimited ? (
                  <Infinity className="h-6 w-6 text-muted-foreground" />
                ) : (
                  <span className="text-muted-foreground">
                    {maxWhatsAppAccounts}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {isUnlimited
                  ? "بلا حد أقصى"
                  : canAddMoreAccounts
                  ? `متبقي ${remainingAccounts} حساب`
                  : "وصلت للحد الأقصى"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                حسابات متصلة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {accounts.filter((a) => a.status === "connected").length}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                حسابات نشطة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {accounts.filter((a) => a.isActive).length}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                رسائل اليوم
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">
                {accounts.reduce((sum, a) => sum + a.dailySent, 0)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Accounts Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>الحسابات ({accounts.length})</CardTitle>
            {accounts.length > 0 && (
              <Button
                onClick={() => {
                  if (!canAddMoreAccounts) {
                    toast({
                      title: "⚠️ وصلت للحد الأقصى",
                      description: `الحد الأقصى المسموح هو ${maxWhatsAppAccounts} حساب`,
                      variant: "destructive",
                    });
                    return;
                  }
                  setAddDialog(true);
                }}
                variant={canAddMoreAccounts ? "default" : "secondary"}
                size="sm"
              >
                <Plus className="h-4 w-4 ml-2" />
                إضافة حساب جديد
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground">جاري التحميل...</p>
              </div>
            ) : accounts.length === 0 ? (
              <div className="text-center py-12">
                <MessageSquare className="h-20 w-20 mx-auto mb-6 text-primary opacity-50" />
                <h3 className="text-xl font-bold mb-2">
                  {HELP_MESSAGES.NO_ACCOUNTS.title}
                </h3>
                <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                  {HELP_MESSAGES.NO_ACCOUNTS.description}
                </p>

                <div className="bg-muted rounded-lg p-6 max-w-sm mx-auto mb-6 text-right">
                  <p className="font-medium mb-3">الخطوات:</p>
                  {HELP_MESSAGES.NO_ACCOUNTS.steps.map((step, i) => (
                    <p key={i} className="text-sm text-muted-foreground mb-2">
                      {step}
                    </p>
                  ))}
                </div>

                <Button
                  onClick={() => setAddDialog(true)}
                  size="lg"
                  className="text-lg px-8"
                >
                  <Plus className="h-5 w-5 ml-2" />
                  أضف حساب واتساب
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الاسم</TableHead>
                    <TableHead>الرقم</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>الحد اليومي</TableHead>
                    <TableHead>المرسل اليوم</TableHead>
                    <TableHead>التأخير</TableHead>
                    <TableHead>نشط</TableHead>
                    <TableHead>آخر اتصال</TableHead>
                    <TableHead>إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((account) => (
                    <TableRow key={account.id}>
                      <TableCell className="font-medium">
                        {account.name}
                      </TableCell>
                      <TableCell>{account.phone}</TableCell>
                      <TableCell>{getStatusBadge(account.status)}</TableCell>
                      <TableCell>{account.dailyLimit}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {account.dailySent}/{account.dailyLimit}
                        </Badge>
                      </TableCell>
                      <TableCell>{account.antiSpamDelay / 1000}ث</TableCell>
                      <TableCell>
                        <Switch
                          dir="ltr"
                          checked={account.isActive}
                          onCheckedChange={() => handleToggleActive(account)}
                          disabled={account.status !== "connected"}
                        />
                      </TableCell>
                      <TableCell>
                        {account.lastConnectedAt
                          ? new Date(account.lastConnectedAt).toLocaleString(
                              "ar"
                            )
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {account.status === "disconnected" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleConnect(account.id)}
                              disabled={
                                !isOnline || connectingAccount === account.id
                              }
                              title="ربط الحساب"
                            >
                              {connectingAccount === account.id ? (
                                <>
                                  <Loader2 className="h-4 w-4 ml-1 animate-spin" />
                                  جاري الربط...
                                </>
                              ) : (
                                <>
                                  <Power className="h-4 w-4 ml-1" />
                                  ربط
                                </>
                              )}
                            </Button>
                          )}

                          {account.status === "qr" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedQR(account.qrCode || "");
                                setQrDialog(true);
                              }}
                              title="عرض QR Code"
                            >
                              <QrCode className="h-4 w-4 ml-1" />
                              QR
                            </Button>
                          )}

                          {account.status === "connected" && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={async () => {
                                setDisconnectingAccount(account.id);
                                try {
                                  if ((window as any).electronAPI?.whatsapp) {
                                    await (
                                      window as any
                                    ).electronAPI.whatsapp.disconnect(
                                      account.id
                                    );
                                    toast({ title: "✅ تم قطع الاتصال" });
                                    await loadAccounts();
                                  }
                                } finally {
                                  setDisconnectingAccount(null);
                                }
                              }}
                              disabled={disconnectingAccount === account.id}
                              title="قطع الاتصال"
                            >
                              {disconnectingAccount === account.id ? (
                                <>
                                  <Loader2 className="h-4 w-4 ml-1 animate-spin" />
                                  قطع...
                                </>
                              ) : (
                                <>
                                  <Power className="h-4 w-4 ml-1" />
                                  قطع
                                </>
                              )}
                            </Button>
                          )}

                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDelete(account.id)}
                            disabled={deletingAccount === account.id}
                            title="حذف الحساب"
                          >
                            {deletingAccount === account.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Add Account Dialog */}
        <Dialog open={addDialog} onOpenChange={setAddDialog}>
          <DialogContent dir="rtl">
            <DialogHeader>
              <DialogTitle>إضافة حساب WhatsApp</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label>اسم الحساب *</Label>
                <Input
                  value={newAccount.name}
                  onChange={(e) =>
                    setNewAccount({ ...newAccount, name: e.target.value })
                  }
                  placeholder="مثال: حساب المبيعات"
                />
              </div>

              <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-800 dark:text-blue-200 flex items-center gap-2">
                  <span>📱</span>
                  <span>رقم الهاتف هيتجاب تلقائي لما تمسح الـ QR Code</span>
                </p>
              </div>

              <div>
                <Label>الحد الأقصى للرسائل اليومية</Label>
                <Input
                  type="number"
                  value={newAccount.dailyLimit}
                  onChange={(e) =>
                    setNewAccount({
                      ...newAccount,
                      dailyLimit: parseInt(e.target.value) || 100,
                    })
                  }
                />
                <p className="text-xs text-muted-foreground mt-1">
                  يُنصح بـ 100-300 رسالة يومياً لتجنب الحظر
                </p>
              </div>

              <div>
                <Label>التأخير بين الرسائل (بالميلي ثانية)</Label>
                <Input
                  type="number"
                  value={newAccount.antiSpamDelay}
                  onChange={(e) =>
                    setNewAccount({
                      ...newAccount,
                      antiSpamDelay: parseInt(e.target.value) || 3000,
                    })
                  }
                />
                <p className="text-xs text-muted-foreground mt-1">
                  يُنصح بـ 3000-5000 ميلي ثانية (3-5 ثواني)
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setAddDialog(false)}
                disabled={isAddingAccount}
              >
                إلغاء
              </Button>
              <Button
                onClick={handleAddAccount}
                disabled={isAddingAccount || !newAccount.name}
              >
                {isAddingAccount ? (
                  <>
                    <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                    جاري الإضافة...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 ml-2" />
                    إضافة
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* QR Code Dialog */}
        <Dialog open={qrDialog} onOpenChange={setQrDialog}>
          <DialogContent dir="rtl" className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-center flex items-center justify-center gap-2">
                امسح رمز QR للربط
                {qrCountdown > 0 && (
                  <Badge variant="outline" className="mr-2">
                    {Math.floor(qrCountdown / 60)}:
                    {String(qrCountdown % 60).padStart(2, "0")}
                  </Badge>
                )}
              </DialogTitle>
            </DialogHeader>

            <div className="flex flex-col items-center py-6">
              {qrImage ? (
                <>
                  <div className="relative mb-6">
                    <img
                      src={qrImage}
                      alt="QR Code"
                      className="w-80 h-80 border-4 border-primary rounded-lg shadow-lg"
                    />
                  </div>

                  <div className="space-y-2 text-center w-full">
                    <p className="text-sm font-medium">خطوات الربط:</p>
                    <ol className="text-xs text-muted-foreground space-y-1 text-right bg-muted p-4 rounded-lg">
                      <li>1. افتح WhatsApp على هاتفك</li>
                      <li>
                        2. اذهب إلى{" "}
                        <strong>الإعدادات → الأجهزة المرتبطة</strong>
                      </li>
                      <li>
                        3. اضغط على <strong>ربط جهاز</strong>
                      </li>
                      <li>4. امسح الرمز أعلاه</li>
                    </ol>
                  </div>

                  {qrCountdown <= 30 && qrCountdown > 0 && (
                    <Badge variant="destructive" className="mt-4 animate-pulse">
                      ⏱️ {qrCountdown} ثانية متبقية
                    </Badge>
                  )}
                </>
              ) : (
                <div className="w-80 h-80 flex items-center justify-center bg-muted rounded-lg">
                  <div className="text-center">
                    <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
                    <p className="font-medium">جاري إنشاء الكود...</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      استنى ثواني
                    </p>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setQrDialog(false)}>
                إغلاق
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Help Dialog */}
        <Dialog open={helpDialog} onOpenChange={setHelpDialog}>
          <DialogContent dir="rtl" className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-xl flex items-center gap-2">
                <HelpCircle className="h-6 w-6 text-primary" />
                مساعدة - كيف تستخدم الواتساب؟
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {/* Connection Help */}
              <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-4">
                <h4 className="font-bold mb-3 flex items-center gap-2">
                  <QrCode className="h-5 w-5" />
                  {HELP_MESSAGES.CONNECTION_HELP.title}
                </h4>
                <div className="space-y-2">
                  {HELP_MESSAGES.CONNECTION_HELP.steps.map((step, i) => (
                    <p key={i} className="text-sm">
                      {step}
                    </p>
                  ))}
                </div>
              </div>

              {/* Troubleshooting */}
              <div className="bg-orange-50 dark:bg-orange-950 rounded-lg p-4">
                <h4 className="font-bold mb-3 flex items-center gap-2">
                  <AlertCircle className="h-5 w-5" />
                  {HELP_MESSAGES.TROUBLESHOOTING.title}
                </h4>
                <div className="space-y-3">
                  {HELP_MESSAGES.TROUBLESHOOTING.issues.map((issue, i) => (
                    <div key={i} className="text-sm">
                      <p className="font-medium text-destructive">
                        ❌ {issue.problem}
                      </p>
                      <p className="text-muted-foreground mr-4">
                        ✅ {issue.solution}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tips */}
              <div className="bg-green-50 dark:bg-green-950 rounded-lg p-4">
                <h4 className="font-bold mb-3 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5" />
                  نصائح مهمة
                </h4>
                <ul className="text-sm space-y-2">
                  <li>💡 خلي الموبايل مفتوح فيه واتساب ومتصل بالنت</li>
                  <li>💡 متبعتش رسائل كتير في وقت قصير عشان الحساب ميتحظرش</li>
                  <li>💡 استخدم الحد اليومي (100-300 رسالة) عشان تكون آمن</li>
                  <li>💡 لو الحساب فصل، امسح الكود تاني من الموبايل</li>
                </ul>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={() => setHelpDialog(false)}>فهمت، شكراً!</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

export default WhatsAppManagement;
