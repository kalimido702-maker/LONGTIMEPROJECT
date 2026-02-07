export interface Supervisor {
    id: string;
    name: string;
    phone: string;
    email?: string;
    isActive: boolean;
    createdAt: string;
    notes?: string;
}
