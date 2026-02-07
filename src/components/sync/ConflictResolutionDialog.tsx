import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getSyncEngine } from "@/infrastructure";

export interface ConflictData {
  id: string;
  table: string;
  localData: any;
  serverData: any;
  localUpdatedAt: string;
  serverUpdatedAt: string;
}

interface ConflictResolutionDialogProps {
  conflict: ConflictData | null;
  open: boolean;
  onClose: () => void;
  onResolve: (resolution: "local" | "server" | "skip") => void;
}

export function ConflictResolutionDialog({
  conflict,
  open,
  onClose,
  onResolve,
}: ConflictResolutionDialogProps) {
  const [selectedResolution, setSelectedResolution] = useState<
    "local" | "server" | "skip"
  >("server");

  useEffect(() => {
    // Reset selection when conflict changes
    if (conflict) {
      setSelectedResolution("server");
    }
  }, [conflict]);

  if (!conflict) return null;

  const handleResolve = () => {
    onResolve(selectedResolution);
    onClose();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("ar-EG", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const renderDataComparison = (local: any, server: any) => {
    const keys = new Set([
      ...Object.keys(local || {}),
      ...Object.keys(server || {}),
    ]);

    return (
      <div className="space-y-2">
        {Array.from(keys).map((key) => {
          const localValue = local?.[key];
          const serverValue = server?.[key];
          const isDifferent =
            JSON.stringify(localValue) !== JSON.stringify(serverValue);

          if (
            key === "id" ||
            key === "created_at" ||
            key === "local_updated_at" ||
            key === "server_updated_at"
          ) {
            return null; // Skip these fields
          }

          return (
            <div
              key={key}
              className={`grid grid-cols-3 gap-2 p-2 rounded ${
                isDifferent ? "bg-yellow-50" : "bg-gray-50"
              }`}
            >
              <div className="font-medium text-sm">{key}</div>
              <div className="text-sm">
                {typeof localValue === "object"
                  ? JSON.stringify(localValue)
                  : String(localValue)}
              </div>
              <div className="text-sm">
                {typeof serverValue === "object"
                  ? JSON.stringify(serverValue)
                  : String(serverValue)}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>تعارض في البيانات</span>
            <Badge variant="destructive">يتطلب حل</Badge>
          </DialogTitle>
          <DialogDescription>
            تم العثور على تعارض في الجدول: <strong>{conflict.table}</strong> -
            السجل: <strong>{conflict.id}</strong>
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[50vh]">
          <div className="space-y-4 p-4">
            {/* Timestamps */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-blue-50 rounded">
                <div className="text-sm text-gray-600">التحديث المحلي</div>
                <div className="font-medium">
                  {formatDate(conflict.localUpdatedAt)}
                </div>
              </div>
              <div className="p-3 bg-green-50 rounded">
                <div className="text-sm text-gray-600">تحديث الخادم</div>
                <div className="font-medium">
                  {formatDate(conflict.serverUpdatedAt)}
                </div>
              </div>
            </div>

            {/* Data comparison header */}
            <div className="grid grid-cols-3 gap-2 font-bold text-sm border-b pb-2">
              <div>الحقل</div>
              <div>القيمة المحلية</div>
              <div>قيمة الخادم</div>
            </div>

            {/* Data comparison */}
            {renderDataComparison(conflict.localData, conflict.serverData)}
          </div>
        </ScrollArea>

        <div className="space-y-4">
          <RadioGroup
            value={selectedResolution}
            onValueChange={(value) =>
              setSelectedResolution(value as "local" | "server" | "skip")
            }
          >
            <div className="flex items-center space-x-2 space-x-reverse p-3 border rounded hover:bg-gray-50">
              <RadioGroupItem value="server" id="server" />
              <Label htmlFor="server" className="flex-1 cursor-pointer">
                <div className="font-medium">استخدام بيانات الخادم</div>
                <div className="text-sm text-gray-600">
                  سيتم استبدال البيانات المحلية ببيانات الخادم (مستحسن)
                </div>
              </Label>
            </div>

            <div className="flex items-center space-x-2 space-x-reverse p-3 border rounded hover:bg-gray-50">
              <RadioGroupItem value="local" id="local" />
              <Label htmlFor="local" className="flex-1 cursor-pointer">
                <div className="font-medium">الاحتفاظ بالبيانات المحلية</div>
                <div className="text-sm text-gray-600">
                  سيتم إرسال البيانات المحلية للخادم والكتابة فوق بياناته
                </div>
              </Label>
            </div>

            <div className="flex items-center space-x-2 space-x-reverse p-3 border rounded hover:bg-gray-50">
              <RadioGroupItem value="skip" id="skip" />
              <Label htmlFor="skip" className="flex-1 cursor-pointer">
                <div className="font-medium">تخطي هذا التعارض</div>
                <div className="text-sm text-gray-600">
                  لن يتم حل التعارض الآن، سيظهر مجدداً في المزامنة القادمة
                </div>
              </Label>
            </div>
          </RadioGroup>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={handleResolve}>تطبيق الحل</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
