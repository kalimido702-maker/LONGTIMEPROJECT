export interface SalesRep {
    id: string;
    name: string;
    phone: string;
    supervisorId: string; // مرتبط بالمشرف
    email?: string;
    isActive: boolean;
    commissionRate?: number; // نسبة العمولة
    whatsappGroupId?: string; // جروب الواتساب للإرسال
    createdAt: string;
    notes?: string;
}
