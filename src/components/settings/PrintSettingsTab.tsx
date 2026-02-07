/**
 * Advanced Print Settings Tab Component
 * مكون إعدادات الطباعة المتقدمة
 */

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Printer, CheckCircle, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    getAdvancedPrintSettings,
    saveAdvancedPrintSettings,
    resetPrintSettings,
    DEFAULT_PRINT_SETTINGS,
    type PrintSettings,
    type ReceiptSize,
} from '@/lib/printing/printSettings';

// Helper component for number input
function NumberField({
    label,
    value,
    onChange,
    min = 0,
    max = 100,
    step = 1,
    suffix = ''
}: {
    label: string;
    value: number;
    onChange: (val: number) => void;
    min?: number;
    max?: number;
    step?: number;
    suffix?: string;
}) {
    return (
        <div className="flex items-center gap-2">
            <Label className="flex-1 text-sm">{label}</Label>
            <div className="flex items-center gap-1">
                <Input
                    type="number"
                    value={value}
                    min={min}
                    max={max}
                    step={step}
                    onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
                    className="w-20 text-center"
                />
                {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
            </div>
        </div>
    );
}

// Collapsible section component
function CollapsibleSection({
    title,
    children,
    defaultOpen = false
}: {
    title: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
}) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className="border rounded-lg">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
            >
                <span className="font-semibold">{title}</span>
                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {isOpen && (
                <div className="p-3 pt-0 border-t space-y-3">
                    {children}
                </div>
            )}
        </div>
    );
}

export function PrintSettingsTab() {
    const { toast } = useToast();
    const [settings, setSettings] = useState<PrintSettings>(DEFAULT_PRINT_SETTINGS);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        setSettings(getAdvancedPrintSettings());
    }, []);

    const handleSave = () => {
        saveAdvancedPrintSettings(settings);
        setSaved(true);
        toast({
            title: '✅ تم الحفظ',
            description: 'تم حفظ إعدادات الطباعة بنجاح',
        });
        setTimeout(() => setSaved(false), 2000);
    };

    const handleReset = () => {
        if (window.confirm('هل تريد استعادة الإعدادات الافتراضية؟')) {
            resetPrintSettings();
            setSettings(DEFAULT_PRINT_SETTINGS);
            toast({
                title: '🔄 تم الاستعادة',
                description: 'تم استعادة الإعدادات الافتراضية',
            });
        }
    };

    // Update helper functions
    const updateReceipt80mm = (path: string, value: number) => {
        const [category, field] = path.split('.');
        setSettings(prev => ({
            ...prev,
            receipt80mm: {
                ...prev.receipt80mm,
                [category]: {
                    ...prev.receipt80mm[category as 'fonts' | 'layout'],
                    [field]: value,
                },
            },
        }));
    };

    const updateReceipt58mm = (path: string, value: number) => {
        const [category, field] = path.split('.');
        setSettings(prev => ({
            ...prev,
            receipt58mm: {
                ...prev.receipt58mm,
                [category]: {
                    ...prev.receipt58mm[category as 'fonts' | 'layout'],
                    [field]: value,
                },
            },
        }));
    };

    const updateLabel = (path: string, value: number) => {
        const [category, field] = path.split('.');
        setSettings(prev => ({
            ...prev,
            label: {
                ...prev.label,
                [category]: {
                    ...prev.label[category as 'fonts' | 'layout'],
                    [field]: value,
                },
            },
        }));
    };

    return (
        <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold flex items-center gap-2">
                    <Printer className="h-5 w-5" />
                    إعدادات الطباعة المتقدمة
                </h2>
                <Button variant="outline" size="sm" onClick={handleReset} className="gap-1">
                    <RotateCcw className="h-4 w-4" />
                    استعادة الافتراضي
                </Button>
            </div>

            <div className="space-y-4">
                {/* حجم الفاتورة المختار */}
                <div className="bg-primary/10 p-4 rounded-lg">
                    <Label className="font-semibold mb-2 block">حجم الفاتورة الافتراضي:</Label>
                    <Select
                        value={settings.selectedSize}
                        onValueChange={(value: ReceiptSize) => setSettings(prev => ({ ...prev, selectedSize: value }))}
                    >
                        <SelectTrigger className="w-full max-w-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="80mm">80 ملم</SelectItem>
                            <SelectItem value="58mm">58 ملم</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* إعدادات فاتورة 80mm */}
                <CollapsibleSection title="📄 إعدادات فاتورة 80mm" defaultOpen>
                    <div className="space-y-4">
                        <div className="bg-muted/50 p-3 rounded-lg space-y-2">
                            <h4 className="font-semibold text-sm mb-2">📐 المقاسات والهوامش</h4>
                            <NumberField label="عرض الفاتورة" value={settings.receipt80mm.layout.width} onChange={(v) => updateReceipt80mm('layout.width', v)} suffix="mm" min={40} max={80} />
                            <NumberField label="الهوامش الداخلية" value={settings.receipt80mm.layout.padding} onChange={(v) => updateReceipt80mm('layout.padding', v)} suffix="mm" step={0.5} />
                            <NumberField label="هامش الهيدر" value={settings.receipt80mm.layout.headerMargin} onChange={(v) => updateReceipt80mm('layout.headerMargin', v)} suffix="mm" step={0.5} />
                            <NumberField label="هامش الفاصل" value={settings.receipt80mm.layout.dividerMargin} onChange={(v) => updateReceipt80mm('layout.dividerMargin', v)} suffix="mm" step={0.5} />
                            <NumberField label="هامش صفوف المعلومات" value={settings.receipt80mm.layout.infoRowMargin} onChange={(v) => updateReceipt80mm('layout.infoRowMargin', v)} suffix="mm" step={0.5} />
                            <NumberField label="هوامش خلايا الجدول" value={settings.receipt80mm.layout.tableCellPadding} onChange={(v) => updateReceipt80mm('layout.tableCellPadding', v)} suffix="mm" step={0.5} />
                            <NumberField label="هامش صف المجموع" value={settings.receipt80mm.layout.totalRowMargin} onChange={(v) => updateReceipt80mm('layout.totalRowMargin', v)} suffix="mm" step={0.5} />
                            <NumberField label="هامش الفوتر" value={settings.receipt80mm.layout.footerMargin} onChange={(v) => updateReceipt80mm('layout.footerMargin', v)} suffix="mm" step={0.5} />
                        </div>

                        <div className="bg-muted/50 p-3 rounded-lg space-y-2">
                            <h4 className="font-semibold text-sm mb-2">🔤 أحجام الخطوط</h4>
                            <NumberField label="الخط الأساسي" value={settings.receipt80mm.fonts.bodySize} onChange={(v) => updateReceipt80mm('fonts.bodySize', v)} suffix="px" min={8} max={20} />
                            <NumberField label="اسم المتجر" value={settings.receipt80mm.fonts.headerSize} onChange={(v) => updateReceipt80mm('fonts.headerSize', v)} suffix="px" min={10} max={24} />
                            <NumberField label="معلومات المتجر" value={settings.receipt80mm.fonts.storeInfoSize} onChange={(v) => updateReceipt80mm('fonts.storeInfoSize', v)} suffix="px" min={6} max={16} />
                            <NumberField label="صفوف المعلومات" value={settings.receipt80mm.fonts.infoRowSize} onChange={(v) => updateReceipt80mm('fonts.infoRowSize', v)} suffix="px" min={8} max={18} />
                            <NumberField label="الجدول" value={settings.receipt80mm.fonts.tableSize} onChange={(v) => updateReceipt80mm('fonts.tableSize', v)} suffix="px" min={6} max={16} />
                            <NumberField label="صف المجموع" value={settings.receipt80mm.fonts.totalRowSize} onChange={(v) => updateReceipt80mm('fonts.totalRowSize', v)} suffix="px" min={8} max={18} />
                            <NumberField label="الإجمالي النهائي" value={settings.receipt80mm.fonts.finalTotalSize} onChange={(v) => updateReceipt80mm('fonts.finalTotalSize', v)} suffix="px" min={10} max={20} />
                            <NumberField label="الفوتر" value={settings.receipt80mm.fonts.footerSize} onChange={(v) => updateReceipt80mm('fonts.footerSize', v)} suffix="px" min={6} max={16} />
                        </div>

                        <div className="bg-muted/50 p-3 rounded-lg space-y-2">
                            <h4 className="font-semibold text-sm mb-2">⚖️ وزن الخطوط</h4>
                            <NumberField label="الخط الأساسي" value={settings.receipt80mm.fonts.bodyWeight} onChange={(v) => updateReceipt80mm('fonts.bodyWeight', v)} min={300} max={900} step={100} />
                            <NumberField label="اسم المتجر" value={settings.receipt80mm.fonts.headerWeight} onChange={(v) => updateReceipt80mm('fonts.headerWeight', v)} min={300} max={900} step={100} />
                            <NumberField label="معلومات المتجر" value={settings.receipt80mm.fonts.storeInfoWeight} onChange={(v) => updateReceipt80mm('fonts.storeInfoWeight', v)} min={300} max={900} step={100} />
                            <NumberField label="الجدول" value={settings.receipt80mm.fonts.tableWeight} onChange={(v) => updateReceipt80mm('fonts.tableWeight', v)} min={300} max={900} step={100} />
                            <NumberField label="صف المجموع" value={settings.receipt80mm.fonts.totalRowWeight} onChange={(v) => updateReceipt80mm('fonts.totalRowWeight', v)} min={300} max={900} step={100} />
                            <NumberField label="الإجمالي" value={settings.receipt80mm.fonts.finalTotalWeight} onChange={(v) => updateReceipt80mm('fonts.finalTotalWeight', v)} min={300} max={900} step={100} />
                            <NumberField label="الفوتر" value={settings.receipt80mm.fonts.footerWeight} onChange={(v) => updateReceipt80mm('fonts.footerWeight', v)} min={300} max={900} step={100} />
                        </div>
                    </div>
                </CollapsibleSection>

                {/* إعدادات فاتورة 58mm */}
                <CollapsibleSection title="📄 إعدادات فاتورة 58mm">
                    <div className="space-y-4">
                        <div className="bg-muted/50 p-3 rounded-lg space-y-2">
                            <h4 className="font-semibold text-sm mb-2">📐 المقاسات والهوامش</h4>
                            <NumberField label="عرض الفاتورة" value={settings.receipt58mm.layout.width} onChange={(v) => updateReceipt58mm('layout.width', v)} suffix="mm" min={30} max={60} />
                            <NumberField label="الهوامش الداخلية" value={settings.receipt58mm.layout.padding} onChange={(v) => updateReceipt58mm('layout.padding', v)} suffix="mm" step={0.5} />
                            <NumberField label="هامش الهيدر" value={settings.receipt58mm.layout.headerMargin} onChange={(v) => updateReceipt58mm('layout.headerMargin', v)} suffix="mm" step={0.5} />
                            <NumberField label="هامش الفاصل" value={settings.receipt58mm.layout.dividerMargin} onChange={(v) => updateReceipt58mm('layout.dividerMargin', v)} suffix="mm" step={0.5} />
                            <NumberField label="هامش صفوف المعلومات" value={settings.receipt58mm.layout.infoRowMargin} onChange={(v) => updateReceipt58mm('layout.infoRowMargin', v)} suffix="mm" step={0.5} />
                            <NumberField label="هوامش خلايا الجدول" value={settings.receipt58mm.layout.tableCellPadding} onChange={(v) => updateReceipt58mm('layout.tableCellPadding', v)} suffix="mm" step={0.5} />
                            <NumberField label="هامش صف المجموع" value={settings.receipt58mm.layout.totalRowMargin} onChange={(v) => updateReceipt58mm('layout.totalRowMargin', v)} suffix="mm" step={0.5} />
                            <NumberField label="هامش الفوتر" value={settings.receipt58mm.layout.footerMargin} onChange={(v) => updateReceipt58mm('layout.footerMargin', v)} suffix="mm" step={0.5} />
                        </div>

                        <div className="bg-muted/50 p-3 rounded-lg space-y-2">
                            <h4 className="font-semibold text-sm mb-2">🔤 أحجام الخطوط</h4>
                            <NumberField label="الخط الأساسي" value={settings.receipt58mm.fonts.bodySize} onChange={(v) => updateReceipt58mm('fonts.bodySize', v)} suffix="px" min={6} max={16} />
                            <NumberField label="اسم المتجر" value={settings.receipt58mm.fonts.headerSize} onChange={(v) => updateReceipt58mm('fonts.headerSize', v)} suffix="px" min={8} max={20} />
                            <NumberField label="معلومات المتجر" value={settings.receipt58mm.fonts.storeInfoSize} onChange={(v) => updateReceipt58mm('fonts.storeInfoSize', v)} suffix="px" min={6} max={14} />
                            <NumberField label="صفوف المعلومات" value={settings.receipt58mm.fonts.infoRowSize} onChange={(v) => updateReceipt58mm('fonts.infoRowSize', v)} suffix="px" min={6} max={14} />
                            <NumberField label="الجدول" value={settings.receipt58mm.fonts.tableSize} onChange={(v) => updateReceipt58mm('fonts.tableSize', v)} suffix="px" min={6} max={14} />
                            <NumberField label="صف المجموع" value={settings.receipt58mm.fonts.totalRowSize} onChange={(v) => updateReceipt58mm('fonts.totalRowSize', v)} suffix="px" min={6} max={16} />
                            <NumberField label="الإجمالي النهائي" value={settings.receipt58mm.fonts.finalTotalSize} onChange={(v) => updateReceipt58mm('fonts.finalTotalSize', v)} suffix="px" min={8} max={18} />
                            <NumberField label="الفوتر" value={settings.receipt58mm.fonts.footerSize} onChange={(v) => updateReceipt58mm('fonts.footerSize', v)} suffix="px" min={6} max={14} />
                        </div>

                        <div className="bg-muted/50 p-3 rounded-lg space-y-2">
                            <h4 className="font-semibold text-sm mb-2">⚖️ وزن الخطوط</h4>
                            <NumberField label="الخط الأساسي" value={settings.receipt58mm.fonts.bodyWeight} onChange={(v) => updateReceipt58mm('fonts.bodyWeight', v)} min={300} max={900} step={100} />
                            <NumberField label="اسم المتجر" value={settings.receipt58mm.fonts.headerWeight} onChange={(v) => updateReceipt58mm('fonts.headerWeight', v)} min={300} max={900} step={100} />
                            <NumberField label="الجدول" value={settings.receipt58mm.fonts.tableWeight} onChange={(v) => updateReceipt58mm('fonts.tableWeight', v)} min={300} max={900} step={100} />
                            <NumberField label="صف المجموع" value={settings.receipt58mm.fonts.totalRowWeight} onChange={(v) => updateReceipt58mm('fonts.totalRowWeight', v)} min={300} max={900} step={100} />
                            <NumberField label="الإجمالي" value={settings.receipt58mm.fonts.finalTotalWeight} onChange={(v) => updateReceipt58mm('fonts.finalTotalWeight', v)} min={300} max={900} step={100} />
                            <NumberField label="الفوتر" value={settings.receipt58mm.fonts.footerWeight} onChange={(v) => updateReceipt58mm('fonts.footerWeight', v)} min={300} max={900} step={100} />
                        </div>
                    </div>
                </CollapsibleSection>

                {/* إعدادات الباركود */}
                <CollapsibleSection title="🏷️ إعدادات ملصق الباركود">
                    <div className="space-y-4">
                        <div className="bg-muted/50 p-3 rounded-lg space-y-2">
                            <h4 className="font-semibold text-sm mb-2">📐 المقاسات</h4>
                            <NumberField label="العرض" value={settings.label.layout.widthInch} onChange={(v) => updateLabel('layout.widthInch', v)} suffix="in" step={0.01} min={0.5} max={3} />
                            <NumberField label="الارتفاع" value={settings.label.layout.heightInch} onChange={(v) => updateLabel('layout.heightInch', v)} suffix="in" step={0.01} min={0.5} max={3} />
                            <NumberField label="الهوامش" value={settings.label.layout.padding} onChange={(v) => updateLabel('layout.padding', v)} suffix="mm" step={0.5} />
                            <NumberField label="ارتفاع الباركود" value={settings.label.layout.barcodeHeight} onChange={(v) => updateLabel('layout.barcodeHeight', v)} suffix="px" min={10} max={50} />
                        </div>

                        <div className="bg-muted/50 p-3 rounded-lg space-y-2">
                            <h4 className="font-semibold text-sm mb-2">🔤 الخطوط</h4>
                            <NumberField label="اسم المنتج (حجم)" value={settings.label.fonts.productNameSize} onChange={(v) => updateLabel('fonts.productNameSize', v)} suffix="px" min={6} max={16} />
                            <NumberField label="اسم المنتج (وزن)" value={settings.label.fonts.productNameWeight} onChange={(v) => updateLabel('fonts.productNameWeight', v)} min={300} max={900} step={100} />
                            <NumberField label="رقم الباركود (حجم)" value={settings.label.fonts.barcodeNumberSize} onChange={(v) => updateLabel('fonts.barcodeNumberSize', v)} suffix="px" min={4} max={12} />
                            <NumberField label="رقم الباركود (وزن)" value={settings.label.fonts.barcodeNumberWeight} onChange={(v) => updateLabel('fonts.barcodeNumberWeight', v)} min={300} max={900} step={100} />
                            <NumberField label="السعر (حجم)" value={settings.label.fonts.priceSize} onChange={(v) => updateLabel('fonts.priceSize', v)} suffix="px" min={6} max={16} />
                            <NumberField label="السعر (وزن)" value={settings.label.fonts.priceWeight} onChange={(v) => updateLabel('fonts.priceWeight', v)} min={300} max={900} step={100} />
                        </div>
                    </div>
                </CollapsibleSection>

                {/* ملاحظة */}
                <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <h3 className="font-semibold mb-2">ℹ️ ملاحظة</h3>
                    <p className="text-sm text-muted-foreground">
                        التغييرات ستُطبق فوراً على الفواتير والباركود بعد الحفظ. لا تحتاج لإعادة تشغيل التطبيق.
                    </p>
                </div>

                {/* زر الحفظ */}
                <Button onClick={handleSave} className="w-full gap-2" size="lg">
                    {saved ? (
                        <>
                            <CheckCircle className="h-5 w-5" />
                            تم الحفظ!
                        </>
                    ) : (
                        <>
                            <Printer className="h-5 w-5" />
                            حفظ الإعدادات
                        </>
                    )}
                </Button>
            </div>
        </Card>
    );
}

export default PrintSettingsTab;
