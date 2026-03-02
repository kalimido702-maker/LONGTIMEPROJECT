import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../config/theme.dart';

/// A compact date-range filter that defaults to the current year.
/// Tapping it opens a bottom sheet where the user can pick a year
/// or choose a custom date range.
class DateFilterWidget extends StatelessWidget {
  final DateTime fromDate;
  final DateTime toDate;
  final ValueChanged<DateRange> onChanged;

  /// Optional: whether to show "الكل" (all-time) option
  final bool showAllOption;

  const DateFilterWidget({
    super.key,
    required this.fromDate,
    required this.toDate,
    required this.onChanged,
    this.showAllOption = true,
  });

  String get _label {
    final now = DateTime.now();
    // Check if it's a full year range
    if (fromDate.month == 1 &&
        fromDate.day == 1 &&
        toDate.month == 12 &&
        toDate.day == 31 &&
        fromDate.year == toDate.year) {
      if (fromDate.year == now.year) {
        return 'العام الحالي ${fromDate.year}';
      }
      return '${fromDate.year}';
    }
    // Check "all time"  (year < 2000 hack)
    if (fromDate.year <= 2000) {
      return 'الكل';
    }
    // Custom range
    return '${_fmt(fromDate)} - ${_fmt(toDate)}';
  }

  String _fmt(DateTime d) =>
      '${d.year}/${d.month.toString().padLeft(2, '0')}/${d.day.toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => _showFilterSheet(context),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: AppColors.primary.withOpacity(0.08),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppColors.primary.withOpacity(0.2)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(LucideIcons.calendar, size: 16, color: AppColors.primary),
            const SizedBox(width: 6),
            Text(
              _label,
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppColors.primary,
              ),
            ),
            const SizedBox(width: 4),
            Icon(LucideIcons.chevronDown, size: 14, color: AppColors.primary),
          ],
        ),
      ),
    );
  }

  void _showFilterSheet(BuildContext context) {
    final now = DateTime.now();
    // Build year options: current year down to 5 years back
    final years = List.generate(6, (i) => now.year - i);

    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Handle
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: Colors.grey[300],
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                const Text(
                  'اختر الفترة الزمنية',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 16),

                // Year chips
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  alignment: WrapAlignment.center,
                  children: [
                    for (final year in years)
                      _YearChip(
                        label: '$year',
                        isSelected: fromDate.year == year &&
                            fromDate.month == 1 &&
                            fromDate.day == 1 &&
                            toDate.year == year &&
                            toDate.month == 12 &&
                            toDate.day == 31,
                        onTap: () {
                          Navigator.pop(ctx);
                          onChanged(DateRange(
                            from: DateTime(year, 1, 1),
                            to: DateTime(year, 12, 31),
                          ));
                        },
                      ),
                  ],
                ),
                const SizedBox(height: 12),

                // Divider
                const Divider(),
                const SizedBox(height: 8),

                // "All time" option
                if (showAllOption)
                  _OptionTile(
                    icon: LucideIcons.infinity,
                    label: 'الكل (بدون تحديد فترة)',
                    isSelected: fromDate.year <= 2000,
                    onTap: () {
                      Navigator.pop(ctx);
                      onChanged(DateRange(
                        from: DateTime(2000, 1, 1),
                        to: DateTime(2099, 12, 31),
                      ));
                    },
                  ),

                _OptionTile(
                  icon: LucideIcons.calendarRange,
                  label: 'فترة مخصصة...',
                  isSelected: false,
                  onTap: () async {
                    Navigator.pop(ctx);
                    final range = await showDateRangePicker(
                      context: context,
                      firstDate: DateTime(2020),
                      lastDate: DateTime(now.year, 12, 31),
                      initialDateRange: DateTimeRange(
                        start: fromDate.year <= 2000 ? DateTime(now.year, 1, 1) : fromDate,
                        end: toDate.year >= 2099 ? DateTime(now.year, 12, 31) : toDate,
                      ),
                      locale: const Locale('ar'),
                      builder: (context, child) {
                        return Theme(
                          data: Theme.of(context).copyWith(
                            colorScheme: ColorScheme.light(
                              primary: AppColors.primary,
                              onPrimary: Colors.white,
                              surface: Colors.white,
                              onSurface: AppColors.textPrimary,
                            ),
                          ),
                          child: child!,
                        );
                      },
                    );
                    if (range != null) {
                      onChanged(DateRange(
                        from: range.start,
                        to: range.end,
                      ));
                    }
                  },
                ),

                const SizedBox(height: 8),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _YearChip extends StatelessWidget {
  final String label;
  final bool isSelected;
  final VoidCallback onTap;

  const _YearChip({
    required this.label,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.primary : Colors.grey[100],
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isSelected ? AppColors.primary : Colors.grey[300]!,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: isSelected ? Colors.white : AppColors.textPrimary,
            fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
            fontSize: 15,
          ),
        ),
      ),
    );
  }
}

class _OptionTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool isSelected;
  final VoidCallback onTap;

  const _OptionTile({
    required this.icon,
    required this.label,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon, color: isSelected ? AppColors.primary : AppColors.textSecondary),
      title: Text(
        label,
        style: TextStyle(
          fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
          color: isSelected ? AppColors.primary : AppColors.textPrimary,
        ),
      ),
      trailing: isSelected
          ? const Icon(LucideIcons.check, color: AppColors.primary, size: 20)
          : null,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      onTap: onTap,
    );
  }
}

/// Simple date range model
class DateRange {
  final DateTime from;
  final DateTime to;

  const DateRange({required this.from, required this.to});

  /// Format as yyyy-MM-dd string for API params
  String get fromStr =>
      '${from.year}-${from.month.toString().padLeft(2, '0')}-${from.day.toString().padLeft(2, '0')}';
  String get toStr =>
      '${to.year}-${to.month.toString().padLeft(2, '0')}-${to.day.toString().padLeft(2, '0')}';

  /// Returns null if "all time" (year <= 2000), otherwise the formatted string
  String? get fromParam => from.year <= 2000 ? null : fromStr;
  String? get toParam => to.year >= 2099 ? null : toStr;
}
