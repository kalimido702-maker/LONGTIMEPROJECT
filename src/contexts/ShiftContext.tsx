import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { db, Shift, Employee } from "@/shared/lib/indexedDB";
import { useAuth } from "./AuthContext";
import { hasPermission, Role } from "@/lib/permissions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle } from "lucide-react";

interface ShiftContextType {
  currentShift: Shift | null;
  loading: boolean;
  requireShift: boolean;
  refreshShift: () => Promise<void>;
}

const ShiftContext = createContext<ShiftContextType | undefined>(undefined);

export function ShiftProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(true);
  const [requireShift, setRequireShift] = useState(false);
  const [showShiftDialog, setShowShiftDialog] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [startingCash, setStartingCash] = useState("");

  const loadShift = async () => {
    try {
      await db.init();
      const allShifts = await db.getAll<Shift>("shifts");
      const activeShift = allShifts.find((s) => s.status === "active");
      setCurrentShift(activeShift || null);

      // إذا لم يكن هناك وردية نشطة والمستخدم لا يملك صلاحية العمل بدون وردية
      if (!activeShift && user) {
        const canBypassShift = hasPermission(
          user.role as Role,
          "shifts.bypass"
        );

        if (!canBypassShift) {
          setRequireShift(true);
          setShowShiftDialog(true);

          // تحديد الموظف المسجل دخول تلقائياً
          // نستخدم ID المستخدم لأن Employee و User لهم نفس ID
          setSelectedEmployeeId(user.id);

          // تحميل الموظفين
          const allEmployees = await db.getAll<Employee>("employees");
          const activeEmployees = allEmployees.filter((e) => e.active);
          setEmployees(activeEmployees);
        }
      }
    } catch (error) {
      console.error("Error loading shift:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadShift();
    }
  }, [user]);

  const handleStartShift = async () => {
    if (!selectedEmployeeId || !startingCash) {
      alert("يرجى إدخال المبلغ الافتتاحي");
      return;
    }

    const employee = employees.find((e) => e.id === selectedEmployeeId);
    if (!employee) {
      alert("الموظف غير موجود");
      return;
    }

    const newShift: Shift = {
      id: `shift_${Date.now()}`,
      employeeId: employee.id,
      employeeName: employee.name,
      startTime: new Date().toISOString(),
      startingCash: parseFloat(startingCash),
      status: "active",
      sales: {
        totalInvoices: 0,
        totalAmount: 0,
        cashSales: 0,
        cardSales: 0,
        walletSales: 0,
        returns: 0,
      },
      expenses: 0,
      purchaseReturns: 0,
    };

    try {
      await db.add("shifts", newShift);
      setCurrentShift(newShift);
      setShowShiftDialog(false);
      setRequireShift(false);
      setStartingCash("");
      setSelectedEmployeeId("");
    } catch (error) {
      console.error("Error starting shift:", error);
      alert("حدث خطأ أثناء بدء الوردية");
    }
  };

  const refreshShift = async () => {
    await loadShift();
  };

  return (
    <ShiftContext.Provider
      value={{
        currentShift,
        loading,
        requireShift,
        refreshShift,
      }}
    >
      {children}

      {/* Dialog إجباري لبدء الوردية */}
      <Dialog
        open={showShiftDialog}
        onOpenChange={setShowShiftDialog}
        modal={true}
      >
        <DialogContent
          dir="rtl"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              يجب بدء وردية جديدة
            </DialogTitle>
            <DialogDescription>
              لا يمكن استخدام النظام بدون وردية نشطة. يرجى بدء وردية جديدة
              للمتابعة.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>الموظف المسؤول عن الوردية</Label>
              <select
                className="w-full mt-2 p-2 border rounded-md bg-muted cursor-not-allowed"
                value={selectedEmployeeId}
                disabled={true}
              >
                <option value="">اختر الموظف</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} - {emp.position}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-2">
                💡 يتم فتح الوردية تلقائياً على حسابك المسجل دخول
              </p>
            </div>
            <div>
              <Label>المبلغ في الدرج (الرصيد الافتتاحي)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={startingCash}
                onChange={(e) => setStartingCash(e.target.value)}
                className="mt-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleStartShift} className="w-full">
              بدء الوردية
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ShiftContext.Provider>
  );
}

export function useShift() {
  const context = useContext(ShiftContext);
  if (context === undefined) {
    throw new Error("useShift must be used within a ShiftProvider");
  }
  return context;
}
