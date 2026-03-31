import { useState, useEffect, useCallback } from "react";
import { POSHeader } from "@/components/POS/POSHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Bell,
  Send,
  Users,
  UserCheck,
  Shield,
  Smartphone,
  RefreshCw,
  History,
  Info,
  Clock,
  Tag,
  Eye,
  EyeOff,
  Upload,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getFastifyClient } from "@/infrastructure/http/FastifyClient";

type NotificationType = "invoice" | "payment" | "return" | "info" | "promo" | "reminder";
type TargetType = "all" | "customers" | "sales_reps" | "supervisors" | "user";

interface NotificationTarget {
  id: string;
  username: string;
  full_name: string;
  role: string;
  customer_name?: string;
  sales_rep_name?: string;
  supervisor_name?: string;
  token_count: number;
}

interface NotificationHistory {
  id: string;
  title: string;
  body: string;
  type: string;
  image_url?: string;
  user_id?: string;
  customer_id?: string;
  full_name?: string;
  created_at: string;
}

interface NotificationRead {
  user_id: string;
  full_name: string;
  username: string;
  role: string;
  read_at: string;
}

interface NotificationStats {
  sent_to: number;
  read_count: number;
  unread_count: number;
  reads: NotificationRead[];
}

const TYPE_LABELS: Record<NotificationType, string> = {
  invoice: "فاتورة",
  payment: "دفعة",
  return: "مرتجع",
  info: "معلومة",
  promo: "عرض",
  reminder: "تذكير",
};

const TYPE_COLORS: Record<string, string> = {
  invoice: "bg-blue-100 text-blue-800",
  payment: "bg-green-100 text-green-800",
  return: "bg-orange-100 text-orange-800",
  info: "bg-gray-100 text-gray-800",
  promo: "bg-purple-100 text-purple-800",
  reminder: "bg-yellow-100 text-yellow-800",
};

const TARGET_ICONS: Record<string, React.ReactNode> = {
  all: <Smartphone className="h-4 w-4" />,
  customers: <Users className="h-4 w-4" />,
  sales_reps: <UserCheck className="h-4 w-4" />,
  supervisors: <Shield className="h-4 w-4" />,
  user: <Smartphone className="h-4 w-4" />,
};

export default function MobileNotifications() {
  const { toast } = useToast();
  const [isSending, setIsSending] = useState(false);
  const [isLoadingTargets, setIsLoadingTargets] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState<NotificationType>("info");
  const [target, setTarget] = useState<TargetType>("all");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Data
  const [targets, setTargets] = useState<NotificationTarget[]>([]);
  const [history, setHistory] = useState<NotificationHistory[]>([]);
  const [activeTab, setActiveTab] = useState<"send" | "history">("send");
  const [expandedNotifId, setExpandedNotifId] = useState<string | null>(null);
  const [notifStats, setNotifStats] = useState<Record<string, NotificationStats>>({});
  const [loadingStats, setLoadingStats] = useState<Record<string, boolean>>({});

  const loadTargets = useCallback(async () => {
    setIsLoadingTargets(true);
    try {
      const client = getFastifyClient();
      const res = await client.get<{ data: NotificationTarget[] }>("/api/notifications/targets");
      setTargets(res.data ?? []);
    } catch (err) {
      console.error("[MobileNotifications] Failed to load targets:", err);
      toast({ title: "تنبيه", description: "فشل تحميل قائمة المستخدمين" });
    } finally {
      setIsLoadingTargets(false);
    }
  }, [toast]);

  const loadHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const client = getFastifyClient();
      const res = await client.get<{ data: NotificationHistory[] }>("/api/notifications/history?limit=50");
      setHistory(res.data);
    } catch {
      toast({ title: "خطأ", description: "فشل تحميل السجل", variant: "destructive" });
    } finally {
      setIsLoadingHistory(false);
    }
  }, [toast]);

  useEffect(() => {
    loadTargets();
  }, [loadTargets]);

  useEffect(() => {
    if (activeTab === "history") loadHistory();
  }, [activeTab, loadHistory]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setImageUrl("");
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview("");
    setImageUrl("");
  };

  const uploadImage = async (): Promise<string | null> => {
    if (!imageFile) return imageUrl || null;
    setIsUploadingImage(true);
    try {
      const client = getFastifyClient();
      const formData = new FormData();
      formData.append("file", imageFile);
      const res = await client.post<{ imageUrl?: string; url?: string }>("/api/notifications/upload-image", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return res.imageUrl || res.url || null;
    } catch {
      toast({ title: "خطأ", description: "فشل رفع الصورة", variant: "destructive" });
      return null;
    } finally {
      setIsUploadingImage(false);
    }
  };

  const loadNotifStats = async (notifId: string) => {
    if (notifStats[notifId] || loadingStats[notifId]) return;
    setLoadingStats(prev => ({ ...prev, [notifId]: true }));
    try {
      const client = getFastifyClient();
      const res = await client.get<NotificationStats>(`/api/notifications/${notifId}/reads`);
      setNotifStats(prev => ({ ...prev, [notifId]: res }));
    } catch {
      // silently fail
    } finally {
      setLoadingStats(prev => ({ ...prev, [notifId]: false }));
    }
  };

  const toggleExpand = (notifId: string) => {
    if (expandedNotifId === notifId) {
      setExpandedNotifId(null);
    } else {
      setExpandedNotifId(notifId);
      loadNotifStats(notifId);
    }
  };

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) {
      toast({ title: "تنبيه", description: "يرجى إدخال العنوان والمحتوى", variant: "destructive" });
      return;
    }
    if (target === "user" && !selectedUserId) {
      toast({ title: "تنبيه", description: "يرجى اختيار المستخدم", variant: "destructive" });
      return;
    }

    setIsSending(true);
    try {
      const uploadedUrl = await uploadImage();
      const client = getFastifyClient();
      const payload: any = { title, body, type, target };
      if (target === "user") payload.userId = selectedUserId;
      if (uploadedUrl) payload.imageUrl = uploadedUrl;

      const res = await client.post<{ success: boolean; sent: number; message?: string }>(
        "/api/notifications/send",
        payload
      );

      toast({
        title: "تم الإرسال",
        description: res.message || `تم إرسال الإشعار لـ ${res.sent} جهاز`,
      });

      // Reset form
      setTitle("");
      setBody("");
      setType("info");
      setSelectedUserId("");
      setImageUrl("");
      setImageFile(null);
      setImagePreview("");
    } catch (err: any) {
      const msg = err?.response?.data?.error || "فشل إرسال الإشعار";
      toast({ title: "خطأ", description: msg, variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  const getUserDisplayName = (t: NotificationTarget) => {
    return t.customer_name || t.sales_rep_name || t.supervisor_name || t.full_name || t.username;
  };

  const getRoleBadge = (role: string) => {
    const map: Record<string, { label: string; className: string }> = {
      customer: { label: "عميل", className: "bg-blue-100 text-blue-800" },
      sales_rep: { label: "مندوب", className: "bg-green-100 text-green-800" },
      supervisor: { label: "مشرف", className: "bg-purple-100 text-purple-800" },
    };
    const info = map[role] || { label: role, className: "bg-gray-100 text-gray-800" };
    return <span className={`px-2 py-0.5 rounded text-xs font-medium ${info.className}`}>{info.label}</span>;
  };

  const connectedCount = targets.length;
  const customerCount = targets.filter(t => t.role === "customer").length;
  const repCount = targets.filter(t => t.role === "sales_rep").length;
  const supervisorCount = targets.filter(t => t.role === "supervisor").length;

  return (
    <div className="flex flex-col h-full" dir="rtl">
      <POSHeader title="إشعارات الموبايل" />

      <div className="flex-1 overflow-auto p-4 space-y-4">

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "إجمالي المتصلين", value: connectedCount, icon: <Smartphone className="h-5 w-5" />, color: "text-blue-600" },
            { label: "العملاء", value: customerCount, icon: <Users className="h-5 w-5" />, color: "text-green-600" },
            { label: "المندوبين", value: repCount, icon: <UserCheck className="h-5 w-5" />, color: "text-orange-600" },
            { label: "المشرفين", value: supervisorCount, icon: <Shield className="h-5 w-5" />, color: "text-purple-600" },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-4 flex items-center gap-3">
                <span className={stat.color}>{stat.icon}</span>
                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b">
          <button
            className={`pb-2 px-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "send" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
            }`}
            onClick={() => setActiveTab("send")}
          >
            <span className="flex items-center gap-2"><Send className="h-4 w-4" /> إرسال إشعار</span>
          </button>
          <button
            className={`pb-2 px-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "history" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
            }`}
            onClick={() => setActiveTab("history")}
          >
            <span className="flex items-center gap-2"><History className="h-4 w-4" /> السجل</span>
          </button>
        </div>

        {activeTab === "send" && (
          <div className="grid grid-cols-3 gap-4">
            {/* Send Form */}
            <Card className="col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Bell className="h-4 w-4" /> إرسال إشعار جديد
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>نوع الإشعار</Label>
                    <Select value={type} onValueChange={(v) => setType(v as NotificationType)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(TYPE_LABELS).map(([val, label]) => (
                          <SelectItem key={val} value={val}>
                            <span className="flex items-center gap-2">
                              <Tag className="h-3 w-3" /> {label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label>الجهة المستهدفة</Label>
                    <Select value={target} onValueChange={(v) => { setTarget(v as TargetType); setSelectedUserId(""); }}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all"><span className="flex items-center gap-2"><Smartphone className="h-3 w-3" /> الكل</span></SelectItem>
                        <SelectItem value="customers"><span className="flex items-center gap-2"><Users className="h-3 w-3" /> العملاء فقط</span></SelectItem>
                        <SelectItem value="sales_reps"><span className="flex items-center gap-2"><UserCheck className="h-3 w-3" /> المندوبين فقط</span></SelectItem>
                        <SelectItem value="supervisors"><span className="flex items-center gap-2"><Shield className="h-3 w-3" /> المشرفين فقط</span></SelectItem>
                        <SelectItem value="user"><span className="flex items-center gap-2"><Smartphone className="h-3 w-3" /> مستخدم محدد</span></SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {target === "user" && (
                  <div className="space-y-1">
                    <Label>اختر المستخدم</Label>
                    <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                      <SelectTrigger>
                        <SelectValue placeholder="اختر مستخدم..." />
                      </SelectTrigger>
                      <SelectContent>
                        {targets.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            <span className="flex items-center gap-2">
                              {getRoleBadge(t.role)}
                              <span>{getUserDisplayName(t)}</span>
                              <span className="text-muted-foreground text-xs">({t.username})</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-1">
                  <Label>عنوان الإشعار</Label>
                  <Input
                    placeholder="مثال: عرض خاص اليوم فقط"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={100}
                  />
                  <p className="text-xs text-muted-foreground text-left">{title.length}/100</p>
                </div>

                <div className="space-y-1">
                  <Label>محتوى الإشعار</Label>
                  <Textarea
                    placeholder="اكتب محتوى الإشعار هنا..."
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={4}
                    maxLength={500}
                  />
                  <p className="text-xs text-muted-foreground text-left">{body.length}/500</p>
                </div>

                <div className="space-y-1">
                  <Label className="flex items-center gap-1">
                    <Upload className="h-3 w-3" />
                    صورة (اختياري)
                  </Label>
                  {!imagePreview ? (
                    <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-md cursor-pointer hover:bg-muted/50 transition-colors">
                      <Upload className="h-6 w-6 text-muted-foreground mb-1" />
                      <span className="text-xs text-muted-foreground">اضغط لاختيار صورة</span>
                      <span className="text-xs text-muted-foreground">(JPEG, PNG, GIF, WEBP)</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
                    </label>
                  ) : (
                    <div className="relative">
                      <img src={imagePreview} alt="preview" className="rounded-md max-h-40 object-cover w-full" />
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute top-1 left-1 h-6 w-6"
                        onClick={handleRemoveImage}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>

                <Button
                  className="w-full"
                  onClick={handleSend}
                  disabled={isSending || !title.trim() || !body.trim()}
                >
                  {isSending ? (
                    <><RefreshCw className="h-4 w-4 ml-2 animate-spin" /> جاري الإرسال...</>
                  ) : (
                    <><Send className="h-4 w-4 ml-2" /> إرسال الإشعار</>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Connected Users */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="flex items-center gap-2"><Smartphone className="h-4 w-4" /> المتصلون الآن</span>
                  <Button variant="ghost" size="sm" onClick={loadTargets} disabled={isLoadingTargets}>
                    <RefreshCw className={`h-3 w-3 ${isLoadingTargets ? "animate-spin" : ""}`} />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-96 overflow-y-auto">
                  {targets.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground text-sm">
                      <Info className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      لا يوجد مستخدمين متصلين
                    </div>
                  ) : (
                    <div className="divide-y">
                      {targets.map((t) => (
                        <div key={t.id} className="p-3 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">{getUserDisplayName(t)}</p>
                            <p className="text-xs text-muted-foreground">{t.username}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {getRoleBadge(t.role)}
                            <span className="text-xs text-muted-foreground">{t.token_count} جهاز</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "history" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2"><History className="h-4 w-4" /> سجل الإشعارات المرسلة</span>
                <Button variant="ghost" size="sm" onClick={loadHistory} disabled={isLoadingHistory}>
                  <RefreshCw className={`h-3 w-3 ${isLoadingHistory ? "animate-spin" : ""}`} />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right w-8"></TableHead>
                    <TableHead className="text-right">العنوان</TableHead>
                    <TableHead className="text-right">المحتوى</TableHead>
                    <TableHead className="text-right">النوع</TableHead>
                    <TableHead className="text-right">المستخدم</TableHead>
                    <TableHead className="text-right">الوقت</TableHead>
                    <TableHead className="text-right">القراءة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingHistory ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        <RefreshCw className="h-5 w-5 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : history.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        لا يوجد إشعارات مرسلة
                      </TableCell>
                    </TableRow>
                  ) : (
                    history.map((n) => (
                      <>
                        <TableRow key={n.id} className="cursor-pointer hover:bg-muted/30" onClick={() => toggleExpand(n.id)}>
                          <TableCell>
                            {expandedNotifId === n.id
                              ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                              : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                          </TableCell>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {n.image_url && <img src={n.image_url} alt="" className="h-8 w-8 rounded object-cover" />}
                              {n.title}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-xs truncate text-muted-foreground">{n.body}</TableCell>
                          <TableCell>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[n.type] || "bg-gray-100 text-gray-800"}`}>
                              {TYPE_LABELS[n.type as NotificationType] || n.type}
                            </span>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">{n.full_name || "-"}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(n.created_at).toLocaleString("ar-EG")}
                            </span>
                          </TableCell>
                          <TableCell>
                            {notifStats[n.id] ? (
                              <span className="flex items-center gap-2 text-xs">
                                <span className="flex items-center gap-1 text-green-600"><Eye className="h-3 w-3" />{notifStats[n.id].read_count}</span>
                                <span className="flex items-center gap-1 text-muted-foreground"><EyeOff className="h-3 w-3" />{notifStats[n.id].unread_count}</span>
                              </span>
                            ) : loadingStats[n.id] ? (
                              <RefreshCw className="h-3 w-3 animate-spin" />
                            ) : (
                              <span className="text-xs text-muted-foreground">اضغط للتفاصيل</span>
                            )}
                          </TableCell>
                        </TableRow>
                        {expandedNotifId === n.id && (
                          <TableRow key={`${n.id}-reads`}>
                            <TableCell colSpan={7} className="bg-muted/20 p-4">
                              {loadingStats[n.id] ? (
                                <div className="flex justify-center py-2"><RefreshCw className="h-4 w-4 animate-spin" /></div>
                              ) : notifStats[n.id] ? (
                                <div className="space-y-2">
                                  <div className="flex gap-4 text-sm font-medium mb-3">
                                    <span className="text-green-600 flex items-center gap-1"><Eye className="h-4 w-4" /> شاف: {notifStats[n.id].read_count}</span>
                                    <span className="text-red-500 flex items-center gap-1"><EyeOff className="h-4 w-4" /> ماشافش: {notifStats[n.id].unread_count}</span>
                                    <span className="text-muted-foreground flex items-center gap-1">الإجمالي: {notifStats[n.id].sent_to}</span>
                                  </div>
                                  {notifStats[n.id].reads.length > 0 && (
                                    <div className="space-y-1">
                                      <p className="text-xs text-muted-foreground font-medium">اللي شافوا الإشعار:</p>
                                      <div className="grid grid-cols-2 gap-1">
                                        {notifStats[n.id].reads.map(r => (
                                          <div key={r.user_id} className="flex items-center gap-2 text-xs bg-green-50 rounded px-2 py-1">
                                            <Eye className="h-3 w-3 text-green-600" />
                                            <span className="font-medium">{r.full_name}</span>
                                            <span className="text-muted-foreground">{new Date(r.read_at).toLocaleString("ar-EG")}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ) : null}
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
