export interface AuditLog {
  id: string;
  action: string;
  entity: string;
  refId: string;
  userId: string;
  userName: string;
  shiftId?: string;
  oldValue?: any;
  newValue?: any;
  changes?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}
