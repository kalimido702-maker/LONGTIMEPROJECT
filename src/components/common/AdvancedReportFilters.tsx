/**
 * AdvancedReportFilters - فلاتر التقارير المتقدمة
 * فلترة حسب: التاريخ، المندوب، الفئة
 */

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Filter, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { db } from "@/shared/lib/indexedDB";

interface Supervisor {
    id: string;
    name: string;
}

interface SalesRep {
    id: string;
    name: string;
    supervisorId: string;
}

interface ProductCategory {
    id: string;
    name?: string;
    nameAr?: string;
}

export interface FilterValues {
    dateFrom: Date | null;
    dateTo: Date | null;
    supervisorId: string;
    salesRepId: string;
    categoryId: string;
}

export interface AdvancedReportFiltersProps {
    onFilterChange: (filters: FilterValues) => void;
    showSupervisor?: boolean;
    showSalesRep?: boolean;
    showCategory?: boolean;
    className?: string;
}

export function AdvancedReportFilters({
    onFilterChange,
    showSupervisor = true,
    showSalesRep = true,
    showCategory = true,
    className = "",
}: AdvancedReportFiltersProps) {
    const [dateFrom, setDateFrom] = useState<Date | null>(null);
    const [dateTo, setDateTo] = useState<Date | null>(null);
    const [supervisorId, setSupervisorId] = useState<string>("all");
    const [salesRepId, setSalesRepId] = useState<string>("all");
    const [categoryId, setCategoryId] = useState<string>("all");

    const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
    const [salesReps, setSalesReps] = useState<SalesRep[]>([]);
    const [filteredSalesReps, setFilteredSalesReps] = useState<SalesRep[]>([]);
    const [categories, setCategories] = useState<ProductCategory[]>([]);

    // Load filter options
    useEffect(() => {
        const loadFilterData = async () => {
            const [supervisorsData, salesRepsData, categoriesData] = await Promise.all([
                db.getAll<Supervisor>("supervisors"),
                db.getAll<SalesRep>("salesReps"),
                db.getAll<ProductCategory>("productCategories"),
            ]);

            setSupervisors(supervisorsData.filter((s: any) => s.isActive !== false));
            setSalesReps(salesRepsData.filter((r: any) => r.isActive !== false));
            setFilteredSalesReps(salesRepsData.filter((r: any) => r.isActive !== false));
            setCategories(categoriesData.filter((c: any) => c.active !== false));
        };

        loadFilterData();
    }, []);

    // Filter sales reps when supervisor changes
    useEffect(() => {
        if (supervisorId === "all") {
            setFilteredSalesReps(salesReps);
        } else {
            setFilteredSalesReps(salesReps.filter((r) => r.supervisorId === supervisorId));
        }
        // Reset sales rep selection when supervisor changes
        if (supervisorId !== "all" && salesRepId !== "all") {
            const rep = salesReps.find((r) => r.id === salesRepId);
            if (rep && rep.supervisorId !== supervisorId) {
                setSalesRepId("all");
            }
        }
    }, [supervisorId, salesReps]);

    // Notify parent of filter changes
    useEffect(() => {
        onFilterChange({
            dateFrom,
            dateTo,
            supervisorId: supervisorId === "all" ? "" : supervisorId,
            salesRepId: salesRepId === "all" ? "" : salesRepId,
            categoryId: categoryId === "all" ? "" : categoryId,
        });
    }, [dateFrom, dateTo, supervisorId, salesRepId, categoryId]);

    const clearFilters = () => {
        setDateFrom(null);
        setDateTo(null);
        setSupervisorId("all");
        setSalesRepId("all");
        setCategoryId("all");
    };

    const hasActiveFilters =
        dateFrom !== null ||
        dateTo !== null ||
        supervisorId !== "all" ||
        salesRepId !== "all" ||
        categoryId !== "all";

    return (
        <div className={cn("bg-muted/50 p-4 rounded-lg space-y-4", className)} dir="rtl">
            <div className="flex items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2">
                    <Filter className="h-4 w-4" />
                    فلاتر البحث
                </h3>
                {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={clearFilters}>
                        <X className="h-4 w-4 ml-1" />
                        مسح الفلاتر
                    </Button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* Date From */}
                <div className="space-y-2">
                    <Label>من تاريخ</Label>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                className={cn(
                                    "w-full justify-start text-right font-normal",
                                    !dateFrom && "text-muted-foreground"
                                )}
                            >
                                <CalendarIcon className="ml-2 h-4 w-4" />
                                {dateFrom ? format(dateFrom, "dd/MM/yyyy", { locale: ar }) : "اختر تاريخ"}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                                mode="single"
                                selected={dateFrom || undefined}
                                onSelect={(date) => setDateFrom(date || null)}
                                initialFocus
                            />
                        </PopoverContent>
                    </Popover>
                </div>

                {/* Date To */}
                <div className="space-y-2">
                    <Label>إلى تاريخ</Label>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                className={cn(
                                    "w-full justify-start text-right font-normal",
                                    !dateTo && "text-muted-foreground"
                                )}
                            >
                                <CalendarIcon className="ml-2 h-4 w-4" />
                                {dateTo ? format(dateTo, "dd/MM/yyyy", { locale: ar }) : "اختر تاريخ"}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                                mode="single"
                                selected={dateTo || undefined}
                                onSelect={(date) => setDateTo(date || null)}
                                initialFocus
                            />
                        </PopoverContent>
                    </Popover>
                </div>

                {/* Supervisor */}
                {showSupervisor && (
                    <div className="space-y-2">
                        <Label>المشرف (Supervisor)</Label>
                        <Select value={supervisorId} onValueChange={setSupervisorId}>
                            <SelectTrigger>
                                <SelectValue placeholder="كل المشرفين" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">كل المشرفين</SelectItem>
                                {supervisors.map((sup) => (
                                    <SelectItem key={sup.id} value={sup.id}>
                                        {sup.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                {/* Sales Rep */}
                {showSalesRep && (
                    <div className="space-y-2">
                        <Label>المندوب</Label>
                        <Select value={salesRepId} onValueChange={setSalesRepId}>
                            <SelectTrigger>
                                <SelectValue placeholder="كل المندوبين" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">كل المندوبين</SelectItem>
                                {filteredSalesReps.map((rep) => (
                                    <SelectItem key={rep.id} value={rep.id}>
                                        {rep.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                {/* Category */}
                {showCategory && (
                    <div className="space-y-2">
                        <Label>الفئة (الجروب)</Label>
                        <Select value={categoryId} onValueChange={setCategoryId}>
                            <SelectTrigger>
                                <SelectValue placeholder="كل الفئات" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">كل الفئات</SelectItem>
                                {categories.map((cat) => (
                                    <SelectItem key={cat.id} value={cat.id}>
                                        {cat.nameAr || cat.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}
            </div>
        </div>
    );
}

export default AdvancedReportFilters;
