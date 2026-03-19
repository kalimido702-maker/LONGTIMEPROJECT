/**
 * Mobile Accounts Management Page
 * 
 * Allows admins to create and manage mobile app accounts for:
 * - Customers (عملاء)
 * - Sales Reps (مندوبين)
 * - Supervisors (مشرفين)
 * 
 * Username defaults to phone number, password defaults to phone number.
 * Admin can customize username/password during creation.
 */

import { useState, useEffect, useCallback } from "react";
import { POSHeader } from "@/components/POS/POSHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  Smartphone,
  Plus,
  Search,
  Users,
  UserCheck,
  Shield,
  Trash2,
  Key,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  Ban,
  Power,
  UserPlus,
  Link2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getFastifyClient } from "@/infrastructure/http/FastifyClient";
import { Checkbox } from "@/components/ui/checkbox";

interface MobileAccount {
  id: string;
  username: string;
  full_name: string;
  phone: string;
  role: string;
  is_active: boolean;
  linked_customer_id?: string;
  linked_sales_rep_id?: string;
  linked_supervisor_id?: string;
  parent_user_id?: string;
  parent_name?: string;
  account_source: string;
  created_at: string;
  last_login_at?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_balance?: number;
  sales_rep_name?: string;
  sales_rep_phone?: string;
  supervisor_name?: string;
  supervisor_phone?: string;
}

interface AvailableEntity {
  id: string;
  name: string;
  phone: string;
  balance?: number;
  credit_limit?: number;
  commission_rate?: number;
  sales_rep_name?: string;
  supervisor_name?: string;
  reps_count?: number;
}

interface AccountStats {
  customers: { total: number; withAccounts: number; withoutAccounts: number };
  salesReps: { total: number; withAccounts: number; withoutAccounts: number };
  supervisors: { total: number; withAccounts: number; withoutAccounts: number };
  activeAccounts: number;
}

type EntityType = 'customer' | 'sales_rep' | 'supervisor';

const ENTITY_LABELS: Record<EntityType, string> = {
  customer: 'عميل',
  sales_rep: 'مندوب',
  supervisor: 'مشرف',
};

const ENTITY_PLURAL_LABELS: Record<EntityType, string> = {
  customer: 'العملاء',
  sales_rep: 'المندوبين',
  supervisor: 'المشرفين',
};

const MobileAccounts = () => {
  const { toast } = useToast();

  // State
  const [accounts, setAccounts] = useState<MobileAccount[]>([]);
  const [availableEntities, setAvailableEntities] = useState<AvailableEntity[]>([]);
  const [stats, setStats] = useState<AccountStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");

  // Create dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createEntityType, setCreateEntityType] = useState<EntityType>('customer');
  const [availableSearch, setAvailableSearch] = useState("");
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<AvailableEntity | null>(null);
  const [customUsername, setCustomUsername] = useState("");
  const [customPassword, setCustomPassword] = useState("");
  const [selectedParentId, setSelectedParentId] = useState<string>("");
  const [parentAccounts, setParentAccounts] = useState<MobileAccount[]>([]);
  const [creating, setCreating] = useState(false);

  // Standalone account dialog
  const [standaloneDialogOpen, setStandaloneDialogOpen] = useState(false);
  const [standaloneFullName, setStandaloneFullName] = useState("");
  const [standalonePhone, setStandalonePhone] = useState("");
  const [standaloneUsername, setStandaloneUsername] = useState("");
  const [standalonePassword, setStandalonePassword] = useState("");
  const [standaloneRoleId, setStandaloneRoleId] = useState("");
  const [standaloneParentId, setStandaloneParentId] = useState("");
  const [availableRoles, setAvailableRoles] = useState<{id: string; name: string; name_en?: string}[]>([]);
  const [creatingStandalone, setCreatingStandalone] = useState(false);

  // Link account dialog
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkAccount, setLinkAccount] = useState<MobileAccount | null>(null);
  const [linkParentId, setLinkParentId] = useState<string>("");
  const [linkSaving, setLinkSaving] = useState(false);

  // Reset password dialog
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetAccount, setResetAccount] = useState<MobileAccount | null>(null);
  const [newPassword, setNewPassword] = useState("");

  // Bulk create dialog
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkEntityType, setBulkEntityType] = useState<EntityType>('customer');
  const [bulkCreating, setBulkCreating] = useState(false);
  const [bulkResults, setBulkResults] = useState<any>(null);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActioning, setBulkActioning] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalAccounts, setTotalAccounts] = useState(0);
  const PAGE_SIZE = 50;

  // ============================================================
  // Data Loading
  // ============================================================

  const loadAccounts = useCallback(async (page = currentPage) => {
    try {
      setLoading(true);
      const httpClient = getFastifyClient();
      const params = new URLSearchParams();
      if (filterType !== 'all') params.set('entity_type', filterType);
      if (searchQuery) params.set('search', searchQuery);
      params.set('limit', String(PAGE_SIZE));
      params.set('page', String(page));

      const response = await httpClient.get<any>(
        `/api/mobile/accounts?${params.toString()}`
      );
      setAccounts(response.data || []);
      if (response.pagination) {
        setTotalPages(response.pagination.pages || 1);
        setTotalAccounts(response.pagination.total || 0);
      }
      setSelectedIds(new Set());
    } catch (error: any) {
      console.error("Failed to load accounts:", error);
      toast({
        title: "خطأ",
        description: "فشل في تحميل حسابات الموبايل",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [filterType, searchQuery, toast, currentPage]);

  const loadStats = useCallback(async () => {
    try {
      const httpClient = getFastifyClient();
      const response = await httpClient.get<any>("/api/mobile/accounts/stats");
      setStats(response.data || null);
    } catch (error) {
      console.error("Failed to load stats:", error);
    }
  }, []);

  const loadAvailableEntities = useCallback(async (type: EntityType, search?: string) => {
    try {
      setLoadingAvailable(true);
      const httpClient = getFastifyClient();
      const params = new URLSearchParams({ entity_type: type });
      if (search) params.set('search', search);

      const response = await httpClient.get<any>(
        `/api/mobile/accounts/available?${params.toString()}`
      );
      setAvailableEntities(response.data || []);
    } catch (error) {
      console.error("Failed to load available entities:", error);
    } finally {
      setLoadingAvailable(false);
    }
  }, []);

  const loadParentAccounts = useCallback(async () => {
    try {
      const httpClient = getFastifyClient();
      const response = await httpClient.get<any>(
        `/api/mobile/accounts?limit=200`
      );
      setParentAccounts(response.data || []);
    } catch (error) {
      console.error("Failed to load parent accounts:", error);
    }
  }, []);

  const loadRoles = useCallback(async () => {
    try {
      const httpClient = getFastifyClient();
      const response = await httpClient.get<any>(`/api/mobile/accounts/roles`);
      setAvailableRoles(response.data || []);
    } catch (error) {
      console.error("Failed to load roles:", error);
    }
  }, []);

  useEffect(() => {
    setCurrentPage(1);
    loadAccounts(1);
    loadStats();
  }, [filterType, searchQuery]);

  // ============================================================
  // Create Account
  // ============================================================

  const openCreateDialog = (type: EntityType) => {
    setCreateEntityType(type);
    setSelectedEntity(null);
    setCustomUsername("");
    setCustomPassword("");
    setSelectedParentId("");
    setAvailableSearch("");
    setCreateDialogOpen(true);
    loadAvailableEntities(type);
    loadParentAccounts();
  };

  const handleSearchAvailable = (search: string) => {
    setAvailableSearch(search);
    loadAvailableEntities(createEntityType, search);
  };

  const openLinkDialog = (account: MobileAccount) => {
    setLinkAccount(account);
    setLinkParentId(account.parent_user_id || "none");
    setLinkDialogOpen(true);
    loadParentAccounts();
  };

  const handleLinkAccount = async () => {
    if (!linkAccount) return;

    try {
      setLinkSaving(true);
      const httpClient = getFastifyClient();
      await httpClient.put(`/api/mobile/accounts/${linkAccount.id}`, {
        parentUserId: linkParentId && linkParentId !== 'none' ? linkParentId : null,
      });

      toast({
        title: "تم بنجاح",
        description: linkParentId && linkParentId !== 'none'
          ? `تم ربط ${linkAccount.full_name} كحساب فرعي`
          : `تم فك ربط ${linkAccount.full_name}`,
      });

      setLinkDialogOpen(false);
      loadAccounts();
    } catch (error: any) {
      const msg = error.response?.data?.error || "فشل في تحديث الربط";
      toast({ title: "خطأ", description: msg, variant: "destructive" });
    } finally {
      setLinkSaving(false);
    }
  };

  const openStandaloneDialog = () => {
    setStandaloneFullName("");
    setStandalonePhone("");
    setStandaloneUsername("");
    setStandalonePassword("");
    setStandaloneRoleId("");
    setStandaloneParentId("");
    setStandaloneDialogOpen(true);
    loadRoles();
    loadParentAccounts();
  };

  const handleCreateStandalone = async () => {
    if (!standaloneFullName || !standaloneUsername || !standalonePassword || !standaloneRoleId) return;

    try {
      setCreatingStandalone(true);
      const httpClient = getFastifyClient();
      const body: any = {
        fullName: standaloneFullName,
        phone: standalonePhone,
        username: standaloneUsername,
        password: standalonePassword,
        roleId: standaloneRoleId,
      };
      if (standaloneParentId && standaloneParentId !== 'none') {
        body.parentUserId = standaloneParentId;
      }

      const response = await httpClient.post<any>("/api/mobile/accounts/standalone", body);

      toast({
        title: "تم بنجاح",
        description: response.message || "تم إنشاء الحساب الإداري بنجاح",
      });

      setStandaloneDialogOpen(false);
      loadAccounts();
      loadStats();
    } catch (error: any) {
      const msg = error.response?.data?.message || error.response?.data?.error || "فشل في إنشاء الحساب";
      toast({
        title: "خطأ",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setCreatingStandalone(false);
    }
  };

  const handleCreateAccount = async () => {
    if (!selectedEntity) return;

    try {
      setCreating(true);
      const httpClient = getFastifyClient();
      const body: any = {
        entityType: createEntityType,
        entityId: selectedEntity.id,
      };
      if (customUsername) body.username = customUsername;
      if (customPassword) body.password = customPassword;
      if (selectedParentId && selectedParentId !== 'none') body.parentUserId = selectedParentId;

      const response = await httpClient.post<any>("/api/mobile/accounts", body);

      toast({
        title: "تم بنجاح",
        description: response.message || `تم إنشاء حساب ${ENTITY_LABELS[createEntityType]} بنجاح`,
      });

      setCreateDialogOpen(false);
      loadAccounts();
      loadStats();
    } catch (error: any) {
      const msg = error.response?.data?.message || error.response?.data?.error || "فشل في إنشاء الحساب";
      toast({
        title: "خطأ",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  // ============================================================
  // Bulk Create
  // ============================================================

  const handleBulkCreate = async () => {
    try {
      setBulkCreating(true);
      const httpClient = getFastifyClient();

      // Get all available entity IDs
      const params = new URLSearchParams({ entity_type: bulkEntityType });
      const availableResponse = await httpClient.get<any>(
        `/api/mobile/accounts/available?${params.toString()}`
      );
      const entities = availableResponse.data || [];
      if (entities.length === 0) {
        toast({
          title: "لا يوجد",
          description: `كل ${ENTITY_PLURAL_LABELS[bulkEntityType]} لديهم حسابات بالفعل`,
        });
        setBulkCreating(false);
        return;
      }

      const entityIds = entities.map((e: any) => e.id);
      const response = await httpClient.post<any>("/api/mobile/accounts/bulk", {
        entityType: bulkEntityType,
        entityIds,
      });

      setBulkResults(response);
      toast({
        title: "تم بنجاح",
        description: response.message || `تم إنشاء ${response.summary?.created || 0} حساب`,
      });

      loadAccounts();
      loadStats();
    } catch (error: any) {
      toast({
        title: "خطأ",
        description: "فشل في إنشاء الحسابات",
        variant: "destructive",
      });
    } finally {
      setBulkCreating(false);
    }
  };

  // ============================================================
  // Reset Password
  // ============================================================

  const openResetDialog = (account: MobileAccount) => {
    setResetAccount(account);
    setNewPassword("");
    setResetDialogOpen(true);
  };

  const handleResetPassword = async () => {
    if (!resetAccount || !newPassword) return;

    try {
      const httpClient = getFastifyClient();
      await httpClient.put(`/api/mobile/accounts/${resetAccount.id}`, {
        password: newPassword,
      });

      toast({
        title: "تم بنجاح",
        description: `تم تغيير كلمة مرور ${resetAccount.full_name}`,
      });

      setResetDialogOpen(false);
    } catch (error) {
      toast({
        title: "خطأ",
        description: "فشل في تغيير كلمة المرور",
        variant: "destructive",
      });
    }
  };

  // ============================================================
  // Toggle Active / Delete
  // ============================================================

  const handleToggleActive = async (account: MobileAccount) => {
    try {
      const httpClient = getFastifyClient();
      await httpClient.put(`/api/mobile/accounts/${account.id}`, {
        isActive: !account.is_active,
      });

      toast({
        title: "تم بنجاح",
        description: account.is_active ? "تم تعطيل الحساب" : "تم تفعيل الحساب",
      });

      loadAccounts();
    } catch (error) {
      toast({
        title: "خطأ",
        description: "فشل في تحديث الحساب",
        variant: "destructive",
      });
    }
  };

  const handleDeleteAccount = async (account: MobileAccount) => {
    if (!confirm(`هل أنت متأكد من حذف حساب ${account.full_name}؟`)) return;

    try {
      const httpClient = getFastifyClient();
      await httpClient.delete(`/api/mobile/accounts/${account.id}`);

      toast({
        title: "تم بنجاح",
        description: "تم حذف الحساب",
      });

      loadAccounts();
      loadStats();
    } catch (error) {
      toast({
        title: "خطأ",
        description: "فشل في حذف الحساب",
        variant: "destructive",
      });
    }
  };

  // ============================================================
  // Selection Helpers
  // ============================================================

  const toggleSelectAll = () => {
    if (selectedIds.size === accounts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(accounts.map(a => a.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const isAllSelected = accounts.length > 0 && selectedIds.size === accounts.length;
  const isSomeSelected = selectedIds.size > 0;

  // ============================================================
  // Bulk Actions (Delete / Disable / Enable)
  // ============================================================

  const handleBulkAction = async (action: 'delete' | 'disable' | 'enable') => {
    const actionLabels: Record<string, string> = {
      delete: 'حذف',
      disable: 'تعطيل',
      enable: 'تفعيل',
    };

    if (!confirm(`هل أنت متأكد من ${actionLabels[action]} ${selectedIds.size} حساب؟`)) return;

    try {
      setBulkActioning(true);
      const httpClient = getFastifyClient();
      const response = await httpClient.post<any>("/api/mobile/accounts/bulk-action", {
        accountIds: Array.from(selectedIds),
        action,
      });

      toast({
        title: "تم بنجاح",
        description: response.message || `تم ${actionLabels[action]} ${response.affected} حساب`,
      });

      setSelectedIds(new Set());
      loadAccounts();
      loadStats();
    } catch (error: any) {
      toast({
        title: "خطأ",
        description: "فشل في تنفيذ العملية",
        variant: "destructive",
      });
    } finally {
      setBulkActioning(false);
    }
  };

  // ============================================================
  // Helpers
  // ============================================================

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'customer':
        return <Badge variant="secondary"><Users className="h-3 w-3 ml-1" />عميل</Badge>;
      case 'sales_rep':
        return <Badge className="bg-blue-100 text-blue-700"><UserCheck className="h-3 w-3 ml-1" />مندوب</Badge>;
      case 'supervisor':
        return <Badge className="bg-purple-100 text-purple-700"><Shield className="h-3 w-3 ml-1" />مشرف</Badge>;
      case 'general_manager':
      case 'مدير عام':
        return <Badge className="bg-amber-100 text-amber-700"><Shield className="h-3 w-3 ml-1" />مدير عام</Badge>;
      case 'sales_manager':
      case 'مسؤول مبيعات':
        return <Badge className="bg-teal-100 text-teal-700"><UserCheck className="h-3 w-3 ml-1" />مسؤول مبيعات</Badge>;
      case 'admin':
      case 'مدير النظام':
        return <Badge className="bg-red-100 text-red-700"><Shield className="h-3 w-3 ml-1" />مدير النظام</Badge>;
      default:
        return <Badge>{role}</Badge>;
    }
  };

  const getEntityName = (account: MobileAccount) => {
    return account.customer_name || account.sales_rep_name || account.supervisor_name || account.full_name;
  };

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="flex flex-col h-full">
      <POSHeader title="حسابات تطبيق الموبايل" icon={<Smartphone className="h-5 w-5" />} />

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  <Users className="h-4 w-4 inline ml-1" />
                  حسابات العملاء
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.customers.withAccounts}</div>
                <p className="text-xs text-muted-foreground">
                  من {stats.customers.total} عميل ({stats.customers.withoutAccounts} بدون حساب)
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  <UserCheck className="h-4 w-4 inline ml-1" />
                  حسابات المندوبين
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.salesReps.withAccounts}</div>
                <p className="text-xs text-muted-foreground">
                  من {stats.salesReps.total} مندوب ({stats.salesReps.withoutAccounts} بدون حساب)
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  <Shield className="h-4 w-4 inline ml-1" />
                  حسابات المشرفين
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.supervisors.withAccounts}</div>
                <p className="text-xs text-muted-foreground">
                  من {stats.supervisors.total} مشرف ({stats.supervisors.withoutAccounts} بدون حساب)
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  <Smartphone className="h-4 w-4 inline ml-1" />
                  إجمالي الحسابات النشطة
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{stats.activeAccounts}</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => openCreateDialog('customer')} className="gap-1">
            <Plus className="h-4 w-4" />
            إنشاء حساب عميل
          </Button>
          <Button onClick={() => openCreateDialog('sales_rep')} variant="outline" className="gap-1">
            <Plus className="h-4 w-4" />
            إنشاء حساب مندوب
          </Button>
          <Button onClick={() => openCreateDialog('supervisor')} variant="outline" className="gap-1">
            <Plus className="h-4 w-4" />
            إنشاء حساب مشرف
          </Button>
          <Button onClick={openStandaloneDialog} variant="outline" className="gap-1 border-primary text-primary hover:bg-primary/5">
            <UserPlus className="h-4 w-4" />
            إنشاء حساب إداري
          </Button>
          <div className="flex-1" />
          <Button
            variant="secondary"
            onClick={() => {
              setBulkEntityType('customer');
              setBulkResults(null);
              setBulkDialogOpen(true);
            }}
            className="gap-1"
          >
            <RefreshCw className="h-4 w-4" />
            إنشاء حسابات جماعي
          </Button>
        </div>

        {/* Search & Filter */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="بحث باسم المستخدم أو الاسم..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-9"
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="تصفية حسب النوع" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="customer">العملاء</SelectItem>
              <SelectItem value="sales_rep">المندوبين</SelectItem>
              <SelectItem value="supervisor">المشرفين</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => { loadAccounts(); loadStats(); }}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Accounts Table */}
        <Card>
          <CardContent className="p-0">
            {/* Bulk Actions Bar */}
            {isSomeSelected && (
              <div className="flex items-center gap-2 p-3 bg-muted/50 border-b">
                <span className="text-sm font-medium">
                  تم تحديد {selectedIds.size} حساب
                </span>
                <div className="flex-1" />
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-green-600 border-green-300 hover:bg-green-50"
                  onClick={() => handleBulkAction('enable')}
                  disabled={bulkActioning}
                >
                  <Power className="h-3.5 w-3.5" />
                  تفعيل
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-orange-600 border-orange-300 hover:bg-orange-50"
                  onClick={() => handleBulkAction('disable')}
                  disabled={bulkActioning}
                >
                  <Ban className="h-3.5 w-3.5" />
                  تعطيل
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-1"
                  onClick={() => handleBulkAction('delete')}
                  disabled={bulkActioning}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  حذف
                </Button>
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={isAllSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label="تحديد الكل"
                    />
                  </TableHead>
                  <TableHead>الاسم</TableHead>
                  <TableHead>اسم المستخدم</TableHead>
                  <TableHead>النوع</TableHead>
                  <TableHead>الهاتف</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>آخر دخول</TableHead>
                  <TableHead>الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      جاري التحميل...
                    </TableCell>
                  </TableRow>
                ) : accounts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      <Smartphone className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      لا توجد حسابات موبايل بعد
                    </TableCell>
                  </TableRow>
                ) : (
                  accounts.map((account) => (
                    <TableRow key={account.id} className={selectedIds.has(account.id) ? 'bg-muted/30' : ''}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(account.id)}
                          onCheckedChange={() => toggleSelect(account.id)}
                          aria-label={`تحديد ${account.full_name}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {getEntityName(account)}
                        {account.parent_name && (
                          <span className="text-xs text-muted-foreground block">فرعي من: {account.parent_name}</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{account.username}</TableCell>
                      <TableCell>{getRoleBadge(account.role)}</TableCell>
                      <TableCell dir="ltr" className="text-right">{account.phone}</TableCell>
                      <TableCell>
                        {account.is_active ? (
                          <Badge className="bg-green-100 text-green-700">
                            <CheckCircle className="h-3 w-3 ml-1" />
                            نشط
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <XCircle className="h-3 w-3 ml-1" />
                            معطل
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {account.last_login_at
                          ? new Date(account.last_login_at).toLocaleDateString('ar-EG')
                          : 'لم يسجل دخول'}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="تغيير كلمة المرور"
                            onClick={() => openResetDialog(account)}
                          >
                            <Key className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title={account.is_active ? "تعطيل" : "تفعيل"}
                            onClick={() => handleToggleActive(account)}
                          >
                            {account.is_active ? (
                              <XCircle className="h-4 w-4 text-orange-500" />
                            ) : (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="ربط كحساب فرعي"
                            onClick={() => openLinkDialog(account)}
                          >
                            <Link2 className="h-4 w-4 text-blue-500" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="حذف"
                            onClick={() => handleDeleteAccount(account)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              إجمالي {totalAccounts} حساب — صفحة {currentPage} من {totalPages}
            </p>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => {
                  const p = currentPage - 1;
                  setCurrentPage(p);
                  loadAccounts(p);
                }}
              >
                السابق
              </Button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let page: number;
                if (totalPages <= 7) {
                  page = i + 1;
                } else if (currentPage <= 4) {
                  page = i + 1;
                } else if (currentPage >= totalPages - 3) {
                  page = totalPages - 6 + i;
                } else {
                  page = currentPage - 3 + i;
                }
                return (
                  <Button
                    key={page}
                    variant={page === currentPage ? "default" : "outline"}
                    size="sm"
                    className="min-w-[36px]"
                    onClick={() => {
                      setCurrentPage(page);
                      loadAccounts(page);
                    }}
                  >
                    {page}
                  </Button>
                );
              })}
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => {
                  const p = currentPage + 1;
                  setCurrentPage(p);
                  loadAccounts(p);
                }}
              >
                التالي
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ============================================ */}
      {/* Create Account Dialog */}
      {/* ============================================ */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              إنشاء حساب موبايل - {ENTITY_LABELS[createEntityType]}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Search available entities */}
            <div>
              <Label>ابحث عن {ENTITY_LABELS[createEntityType]}</Label>
              <div className="relative mt-1">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={`بحث بالاسم أو رقم الهاتف...`}
                  value={availableSearch}
                  onChange={(e) => handleSearchAvailable(e.target.value)}
                  className="pr-9"
                />
              </div>
            </div>

            {/* Available entities list */}
            <div className="border rounded-md max-h-[250px] overflow-y-auto">
              {loadingAvailable ? (
                <div className="p-4 text-center text-muted-foreground">جاري البحث...</div>
              ) : availableEntities.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">
                  <AlertCircle className="h-6 w-6 mx-auto mb-1 opacity-40" />
                  لا يوجد {ENTITY_PLURAL_LABELS[createEntityType]} بدون حسابات
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>الاسم</TableHead>
                      <TableHead>الهاتف</TableHead>
                      {createEntityType === 'customer' && <TableHead>الرصيد</TableHead>}
                      {createEntityType === 'sales_rep' && <TableHead>المشرف</TableHead>}
                      {createEntityType === 'supervisor' && <TableHead>عدد المندوبين</TableHead>}
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {availableEntities.map((entity) => (
                      <TableRow
                        key={entity.id}
                        className={`cursor-pointer ${selectedEntity?.id === entity.id ? 'bg-primary/10' : ''}`}
                        onClick={() => {
                          setSelectedEntity(entity);
                          setCustomUsername("");
                        }}
                      >
                        <TableCell className="font-medium">{entity.name}</TableCell>
                        <TableCell dir="ltr" className="text-right">{entity.phone || '-'}</TableCell>
                        {createEntityType === 'customer' && (
                          <TableCell>{(entity.balance || 0).toLocaleString()} جنيه</TableCell>
                        )}
                        {createEntityType === 'sales_rep' && (
                          <TableCell>{entity.supervisor_name || '-'}</TableCell>
                        )}
                        {createEntityType === 'supervisor' && (
                          <TableCell>{entity.reps_count || 0} مندوب</TableCell>
                        )}
                        <TableCell>
                          {selectedEntity?.id === entity.id && (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            {/* Account details */}
            {selectedEntity && (
              <div className="space-y-3 border-t pt-3">
                <div className="bg-muted/50 p-3 rounded-md">
                  <p className="text-sm font-medium mb-1">
                    تم اختيار: <span className="text-primary">{selectedEntity.name}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    سيتم إنشاء حساب بـ اسم مستخدم تلقائي (مثل cs1, sr1) و كلمة المرور = رقم الهاتف (يمكنك تخصيصهم)
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>اسم المستخدم</Label>
                    <Input
                      value={customUsername}
                      onChange={(e) => setCustomUsername(e.target.value)}
                      placeholder={selectedEntity.phone || "أدخل اسم المستخدم"}
                      dir="ltr"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>كلمة المرور</Label>
                    <Input
                      value={customPassword}
                      onChange={(e) => setCustomPassword(e.target.value)}
                      placeholder="رقم الهاتف (افتراضي)"
                      dir="ltr"
                      className="mt-1"
                    />
                  </div>
                </div>

                {/* Parent Account (Sub-Account) Selector */}
                <div>
                  <Label>حساب فرعي تابع لـ (اختياري)</Label>
                  <Select value={selectedParentId} onValueChange={setSelectedParentId}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="بدون - حساب مستقل" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">بدون - حساب مستقل</SelectItem>
                      {parentAccounts.map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.full_name} ({acc.username}) - {acc.role === 'customer' ? 'عميل' : acc.role === 'sales_rep' ? 'مندوب' : acc.role === 'supervisor' ? 'مشرف' : acc.role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    اختر حساب رئيسي إذا أردت ربط هذا الحساب كحساب فرعي
                  </p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              إلغاء
            </Button>
            <Button
              onClick={handleCreateAccount}
              disabled={!selectedEntity || creating}
            >
              {creating ? "جاري الإنشاء..." : "إنشاء الحساب"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================ */}
      {/* Reset Password Dialog */}
      {/* ============================================ */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تغيير كلمة المرور</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              تغيير كلمة مرور <span className="font-medium text-foreground">{resetAccount?.full_name}</span>
            </p>
            <div>
              <Label>كلمة المرور الجديدة</Label>
              <Input
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="أدخل كلمة المرور الجديدة"
                dir="ltr"
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setResetDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleResetPassword} disabled={!newPassword}>
              تغيير كلمة المرور
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================ */}
      {/* Link Account Dialog */}
      {/* ============================================ */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <Link2 className="h-5 w-5 inline ml-2" />
              ربط حساب فرعي
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              ربط <span className="font-medium text-foreground">{linkAccount?.full_name}</span> كحساب فرعي تابع لحساب آخر، أو فك الربط.
            </p>

            {linkAccount?.parent_name && (
              <div className="bg-blue-50 border border-blue-200 p-3 rounded-md text-sm">
                مرتبط حالياً بـ: <span className="font-medium">{linkAccount.parent_name}</span>
              </div>
            )}

            <div>
              <Label>الحساب الرئيسي</Label>
              <Select value={linkParentId} onValueChange={setLinkParentId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="بدون - حساب مستقل" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون - حساب مستقل (فك الربط)</SelectItem>
                  {parentAccounts
                    .filter((acc) => acc.id !== linkAccount?.id)
                    .map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.full_name} ({acc.username}) - {acc.role === 'customer' ? 'عميل' : acc.role === 'sales_rep' ? 'مندوب' : acc.role === 'supervisor' ? 'مشرف' : acc.role}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleLinkAccount} disabled={linkSaving}>
              {linkSaving ? "جاري الحفظ..." : "حفظ الربط"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================ */}
      {/* Standalone Account Dialog */}
      {/* ============================================ */}
      <Dialog open={standaloneDialogOpen} onOpenChange={setStandaloneDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              <UserPlus className="h-5 w-5 inline ml-2" />
              إنشاء حساب إداري
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              أنشئ حساب موبايل مستقل غير مرتبط بعميل أو مندوب أو مشرف. مناسب لأدوار مثل مدير عام أو مسؤول مبيعات.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>الاسم الكامل <span className="text-red-500">*</span></Label>
                <Input
                  value={standaloneFullName}
                  onChange={(e) => setStandaloneFullName(e.target.value)}
                  placeholder="مثال: محمود عبود"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>رقم الهاتف</Label>
                <Input
                  value={standalonePhone}
                  onChange={(e) => setStandalonePhone(e.target.value)}
                  placeholder="01xxxxxxxxx"
                  dir="ltr"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>الدور <span className="text-red-500">*</span></Label>
                <Select value={standaloneRoleId} onValueChange={setStandaloneRoleId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="اختر الدور" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRoles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name} {r.name_en ? `(${r.name_en})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>اسم المستخدم <span className="text-red-500">*</span></Label>
                <Input
                  value={standaloneUsername}
                  onChange={(e) => setStandaloneUsername(e.target.value)}
                  placeholder="مثال: admin2"
                  dir="ltr"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>كلمة المرور <span className="text-red-500">*</span></Label>
                <Input
                  value={standalonePassword}
                  onChange={(e) => setStandalonePassword(e.target.value)}
                  placeholder="أدخل كلمة المرور"
                  dir="ltr"
                  className="mt-1"
                />
              </div>
            </div>

            {/* Parent Account Selector */}
            <div>
              <Label>حساب فرعي تابع لـ (اختياري)</Label>
              <Select value={standaloneParentId} onValueChange={setStandaloneParentId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="بدون - حساب مستقل" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون - حساب مستقل</SelectItem>
                  {parentAccounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.full_name} ({acc.username}) - {acc.role === 'customer' ? 'عميل' : acc.role === 'sales_rep' ? 'مندوب' : acc.role === 'supervisor' ? 'مشرف' : acc.role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                اختر حساب رئيسي إذا أردت ربط هذا الحساب كحساب فرعي
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setStandaloneDialogOpen(false)}>
              إلغاء
            </Button>
            <Button
              onClick={handleCreateStandalone}
              disabled={!standaloneFullName || !standaloneUsername || !standalonePassword || !standaloneRoleId || creatingStandalone}
            >
              {creatingStandalone ? "جاري الإنشاء..." : "إنشاء الحساب"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================ */}
      {/* Bulk Create Dialog */}
      {/* ============================================ */}
      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إنشاء حسابات جماعي</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              سيتم إنشاء حسابات لجميع {ENTITY_PLURAL_LABELS[bulkEntityType]} الذين ليس لديهم حسابات.
              <br />
              اسم المستخدم = تلقائي (مثال: cs1, cs2 للعملاء)، كلمة المرور = رقم الهاتف.
            </p>

            <div>
              <Label>نوع الحساب</Label>
              <Select value={bulkEntityType} onValueChange={(v) => setBulkEntityType(v as EntityType)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">العملاء</SelectItem>
                  <SelectItem value="sales_rep">المندوبين</SelectItem>
                  <SelectItem value="supervisor">المشرفين</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {stats && (
              <div className="bg-muted/50 p-3 rounded-md text-sm">
                <p>
                  {bulkEntityType === 'customer' && `${stats.customers.withoutAccounts} عميل بدون حساب من ${stats.customers.total}`}
                  {bulkEntityType === 'sales_rep' && `${stats.salesReps.withoutAccounts} مندوب بدون حساب من ${stats.salesReps.total}`}
                  {bulkEntityType === 'supervisor' && `${stats.supervisors.withoutAccounts} مشرف بدون حساب من ${stats.supervisors.total}`}
                </p>
              </div>
            )}

            {bulkResults && (
              <div className="bg-green-50 border border-green-200 p-3 rounded-md text-sm">
                <p className="font-medium text-green-700">نتيجة الإنشاء الجماعي:</p>
                <ul className="mt-1 text-green-600 space-y-1">
                  <li>✅ تم إنشاء: {bulkResults.summary?.created || 0}</li>
                  <li>⏭️ تم تخطي: {bulkResults.summary?.skipped || 0}</li>
                  {(bulkResults.summary?.errors || 0) > 0 && (
                    <li>❌ أخطاء: {bulkResults.summary?.errors || 0}</li>
                  )}
                </ul>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDialogOpen(false)}>
              إغلاق
            </Button>
            {!bulkResults && (
              <Button onClick={handleBulkCreate} disabled={bulkCreating}>
                {bulkCreating ? "جاري الإنشاء..." : "إنشاء الحسابات"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MobileAccounts;
