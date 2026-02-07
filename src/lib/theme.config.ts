/**
 * نظام إدارة الثيمات الديناميكي
 * يوفر ألوان ديناميكية قابلة للتخصيص لكل جزء من التطبيق
 */

// ================== تعريف أنواع الثيمات ==================
export type ThemeMode = 'light' | 'dark';
export type ColorScheme = 'green' | 'blue' | 'purple' | 'orange' | 'red';

// ================== ألوان الثيمات الأساسية ==================
export const THEME_COLORS = {
    green: {
        light: {
            primary: '152 65% 25%',
            primaryForeground: '0 0% 100%',
            primaryGlow: '152 70% 35%',
            secondary: '215 85% 55%',
            accent: '152 65% 25%',
        },
        dark: {
            primary: '152 70% 45%',
            primaryForeground: '222.2 47% 11%',
            primaryGlow: '152 70% 55%',
            secondary: '215 85% 60%',
            accent: '152 70% 45%',
        },
    },
    blue: {
        light: {
            primary: '215 85% 45%',
            primaryForeground: '0 0% 100%',
            primaryGlow: '215 85% 55%',
            secondary: '152 65% 35%',
            accent: '215 85% 45%',
        },
        dark: {
            primary: '215 85% 60%',
            primaryForeground: '222.2 47% 11%',
            primaryGlow: '215 85% 70%',
            secondary: '152 70% 45%',
            accent: '215 85% 60%',
        },
    },
    purple: {
        light: {
            primary: '270 60% 45%',
            primaryForeground: '0 0% 100%',
            primaryGlow: '270 65% 55%',
            secondary: '340 75% 55%',
            accent: '270 60% 45%',
        },
        dark: {
            primary: '270 65% 60%',
            primaryForeground: '222.2 47% 11%',
            primaryGlow: '270 70% 70%',
            secondary: '340 80% 65%',
            accent: '270 65% 60%',
        },
    },
    orange: {
        light: {
            primary: '25 85% 50%',
            primaryForeground: '0 0% 100%',
            primaryGlow: '25 90% 60%',
            secondary: '200 85% 50%',
            accent: '25 85% 50%',
        },
        dark: {
            primary: '25 90% 60%',
            primaryForeground: '222.2 47% 11%',
            primaryGlow: '25 95% 70%',
            secondary: '200 85% 60%',
            accent: '25 90% 60%',
        },
    },
    red: {
        light: {
            primary: '0 75% 45%',
            primaryForeground: '0 0% 100%',
            primaryGlow: '0 80% 55%',
            secondary: '195 85% 50%',
            accent: '0 75% 45%',
        },
        dark: {
            primary: '0 80% 60%',
            primaryForeground: '222.2 47% 11%',
            primaryGlow: '0 85% 70%',
            secondary: '195 85% 60%',
            accent: '0 80% 60%',
        },
    },
} as const;

// ================== ألوان الرسوم البيانية ==================
export const CHART_COLORS = {
    green: {
        light: [
            'hsl(152, 65%, 35%)',   // أخضر رئيسي
            'hsl(215, 85%, 55%)',   // أزرق ثانوي
            'hsl(38, 92%, 50%)',    // برتقالي تحذير
            'hsl(0, 84%, 60%)',     // أحمر خطر
            'hsl(152, 65%, 50%)',   // أخضر فاتح
            'hsl(215, 85%, 70%)',   // أزرق فاتح
            'hsl(38, 92%, 65%)',    // برتقالي فاتح
            'hsl(0, 84%, 75%)',     // أحمر فاتح
        ],
        dark: [
            'hsl(152, 70%, 45%)',   // أخضر رئيسي
            'hsl(215, 85%, 60%)',   // أزرق ثانوي
            'hsl(38, 92%, 50%)',    // برتقالي تحذير
            'hsl(0, 84%, 60%)',     // أحمر خطر
            'hsl(152, 70%, 60%)',   // أخضر فاتح
            'hsl(215, 85%, 75%)',   // أزرق فاتح
            'hsl(38, 92%, 65%)',    // برتقالي فاتح
            'hsl(0, 84%, 75%)',     // أحمر فاتح
        ],
    },
    blue: {
        light: [
            'hsl(215, 85%, 45%)',
            'hsl(152, 65%, 35%)',
            'hsl(38, 92%, 50%)',
            'hsl(0, 84%, 60%)',
            'hsl(215, 85%, 60%)',
            'hsl(152, 65%, 50%)',
            'hsl(38, 92%, 65%)',
            'hsl(0, 84%, 75%)',
        ],
        dark: [
            'hsl(215, 85%, 60%)',
            'hsl(152, 70%, 45%)',
            'hsl(38, 92%, 50%)',
            'hsl(0, 84%, 60%)',
            'hsl(215, 85%, 75%)',
            'hsl(152, 70%, 60%)',
            'hsl(38, 92%, 65%)',
            'hsl(0, 84%, 75%)',
        ],
    },
    purple: {
        light: [
            'hsl(270, 60%, 45%)',
            'hsl(340, 75%, 55%)',
            'hsl(38, 92%, 50%)',
            'hsl(195, 85%, 50%)',
            'hsl(270, 65%, 60%)',
            'hsl(340, 80%, 70%)',
            'hsl(38, 92%, 65%)',
            'hsl(195, 85%, 65%)',
        ],
        dark: [
            'hsl(270, 65%, 60%)',
            'hsl(340, 80%, 65%)',
            'hsl(38, 92%, 50%)',
            'hsl(195, 85%, 60%)',
            'hsl(270, 70%, 75%)',
            'hsl(340, 85%, 80%)',
            'hsl(38, 92%, 65%)',
            'hsl(195, 85%, 75%)',
        ],
    },
    orange: {
        light: [
            'hsl(25, 85%, 50%)',
            'hsl(200, 85%, 50%)',
            'hsl(152, 65%, 35%)',
            'hsl(270, 60%, 45%)',
            'hsl(25, 90%, 65%)',
            'hsl(200, 85%, 65%)',
            'hsl(152, 65%, 50%)',
            'hsl(270, 65%, 60%)',
        ],
        dark: [
            'hsl(25, 90%, 60%)',
            'hsl(200, 85%, 60%)',
            'hsl(152, 70%, 45%)',
            'hsl(270, 65%, 60%)',
            'hsl(25, 95%, 75%)',
            'hsl(200, 85%, 75%)',
            'hsl(152, 70%, 60%)',
            'hsl(270, 70%, 75%)',
        ],
    },
    red: {
        light: [
            'hsl(0, 75%, 45%)',
            'hsl(195, 85%, 50%)',
            'hsl(38, 92%, 50%)',
            'hsl(152, 65%, 35%)',
            'hsl(0, 80%, 60%)',
            'hsl(195, 85%, 65%)',
            'hsl(38, 92%, 65%)',
            'hsl(152, 65%, 50%)',
        ],
        dark: [
            'hsl(0, 80%, 60%)',
            'hsl(195, 85%, 60%)',
            'hsl(38, 92%, 50%)',
            'hsl(152, 70%, 45%)',
            'hsl(0, 85%, 75%)',
            'hsl(195, 85%, 75%)',
            'hsl(38, 92%, 65%)',
            'hsl(152, 70%, 60%)',
        ],
    },
} as const;

// ================== ألوان الطباعة ==================
export const PRINT_COLORS = {
    green: {
        header: '#1a6644',        // أخضر غامق
        subheader: '#daa520',     // ذهبي
        border: '#000000',        // أسود
        background: '#f8f9fa',    // رمادي فاتح جداً
        alternateRow: '#f2f2f2',  // رمادي فاتح
        text: '#1a1a1a',          // أسود تقريباً
        textLight: '#666666',     // رمادي
        textLighter: '#888888',   // رمادي فاتح
    },
    blue: {
        header: '#2563eb',
        subheader: '#daa520',
        border: '#000000',
        background: '#f8f9fa',
        alternateRow: '#f2f2f2',
        text: '#1a1a1a',
        textLight: '#666666',
        textLighter: '#888888',
    },
    purple: {
        header: '#7c3aed',
        subheader: '#daa520',
        border: '#000000',
        background: '#f8f9fa',
        alternateRow: '#f2f2f2',
        text: '#1a1a1a',
        textLight: '#666666',
        textLighter: '#888888',
    },
    orange: {
        header: '#ea580c',
        subheader: '#daa520',
        border: '#000000',
        background: '#f8f9fa',
        alternateRow: '#f2f2f2',
        text: '#1a1a1a',
        textLight: '#666666',
        textLighter: '#888888',
    },
    red: {
        header: '#dc2626',
        subheader: '#daa520',
        border: '#000000',
        background: '#f8f9fa',
        alternateRow: '#f2f2f2',
        text: '#1a1a1a',
        textLight: '#666666',
        textLighter: '#888888',
    },
} as const;

// ================== ألوان QR Code ==================
export const QR_COLORS = {
    light: {
        foreground: '#000000',
        background: '#FFFFFF',
    },
    dark: {
        foreground: '#FFFFFF',
        background: '#1a1a1a',
    },
} as const;

// ================== Gradients ==================
export const GRADIENTS = {
    green: {
        light: {
            primary: 'linear-gradient(135deg, hsl(152 65% 25%), hsl(152 70% 35%))',
            secondary: 'linear-gradient(135deg, hsl(215 85% 55%), hsl(215 85% 65%))',
            success: 'linear-gradient(135deg, hsl(152 65% 35%), hsl(152 70% 45%))',
        },
        dark: {
            primary: 'linear-gradient(135deg, hsl(152 70% 45%), hsl(152 70% 55%))',
            secondary: 'linear-gradient(135deg, hsl(215 85% 60%), hsl(215 85% 70%))',
            success: 'linear-gradient(135deg, hsl(152 70% 45%), hsl(152 70% 55%))',
        },
    },
    blue: {
        light: {
            primary: 'linear-gradient(135deg, hsl(215 85% 45%), hsl(215 85% 55%))',
            secondary: 'linear-gradient(135deg, hsl(152 65% 35%), hsl(152 70% 45%))',
            success: 'linear-gradient(135deg, hsl(215 85% 45%), hsl(215 85% 55%))',
        },
        dark: {
            primary: 'linear-gradient(135deg, hsl(215 85% 60%), hsl(215 85% 70%))',
            secondary: 'linear-gradient(135deg, hsl(152 70% 45%), hsl(152 70% 55%))',
            success: 'linear-gradient(135deg, hsl(215 85% 60%), hsl(215 85% 70%))',
        },
    },
    purple: {
        light: {
            primary: 'linear-gradient(135deg, hsl(270 60% 45%), hsl(270 65% 55%))',
            secondary: 'linear-gradient(135deg, hsl(340 75% 55%), hsl(340 80% 65%))',
            success: 'linear-gradient(135deg, hsl(270 60% 45%), hsl(270 65% 55%))',
        },
        dark: {
            primary: 'linear-gradient(135deg, hsl(270 65% 60%), hsl(270 70% 70%))',
            secondary: 'linear-gradient(135deg, hsl(340 80% 65%), hsl(340 85% 75%))',
            success: 'linear-gradient(135deg, hsl(270 65% 60%), hsl(270 70% 70%))',
        },
    },
    orange: {
        light: {
            primary: 'linear-gradient(135deg, hsl(25 85% 50%), hsl(25 90% 60%))',
            secondary: 'linear-gradient(135deg, hsl(200 85% 50%), hsl(200 85% 60%))',
            success: 'linear-gradient(135deg, hsl(25 85% 50%), hsl(25 90% 60%))',
        },
        dark: {
            primary: 'linear-gradient(135deg, hsl(25 90% 60%), hsl(25 95% 70%))',
            secondary: 'linear-gradient(135deg, hsl(200 85% 60%), hsl(200 85% 70%))',
            success: 'linear-gradient(135deg, hsl(25 90% 60%), hsl(25 95% 70%))',
        },
    },
    red: {
        light: {
            primary: 'linear-gradient(135deg, hsl(0 75% 45%), hsl(0 80% 55%))',
            secondary: 'linear-gradient(135deg, hsl(195 85% 50%), hsl(195 85% 60%))',
            success: 'linear-gradient(135deg, hsl(0 75% 45%), hsl(0 80% 55%))',
        },
        dark: {
            primary: 'linear-gradient(135deg, hsl(0 80% 60%), hsl(0 85% 70%))',
            secondary: 'linear-gradient(135deg, hsl(195 85% 60%), hsl(195 85% 70%))',
            success: 'linear-gradient(135deg, hsl(0 80% 60%), hsl(0 85% 70%))',
        },
    },
} as const;

// ================== Shadows ==================
export const SHADOWS = {
    sm: '0 2px 4px -1px hsl(0 0% 0% / 0.06)',
    md: '0 4px 6px -1px hsl(0 0% 0% / 0.1)',
    lg: '0 10px 15px -3px hsl(0 0% 0% / 0.1)',
    // Dynamic shadows based on theme color
    primary: (colorScheme: ColorScheme, mode: ThemeMode) => {
        if (mode === 'light') {
            return `0 8px 24px -6px ${THEME_COLORS[colorScheme][mode].primary.replace(' ', 'l(').replace('%', '% /')} 0.3)`;
        }
        return `0 8px 24px -6px ${THEME_COLORS[colorScheme][mode].primary.replace(' ', 'l(').replace('%', '% /')} 0.4)`;
    },
} as const;

// ================== Helper Functions ==================

/**
 * الحصول على ألوان الثيم الحالي
 */
export function getThemeColors(colorScheme: ColorScheme, mode: ThemeMode) {
    return THEME_COLORS[colorScheme][mode];
}

/**
 * الحصول على ألوان الرسوم البيانية
 */
export function getChartColors(colorScheme: ColorScheme, mode: ThemeMode) {
    return CHART_COLORS[colorScheme][mode];
}

/**
 * الحصول على ألوان الطباعة
 */
export function getPrintColors(colorScheme: ColorScheme) {
    return PRINT_COLORS[colorScheme];
}

/**
 * الحصول على ألوان QR
 */
export function getQRColors(mode: ThemeMode) {
    return QR_COLORS[mode];
}

/**
 * الحصول على التدرجات
 */
export function getGradients(colorScheme: ColorScheme, mode: ThemeMode) {
    return GRADIENTS[colorScheme][mode];
}

/**
 * تطبيق الثيم على CSS Variables
 */
export function applyTheme(colorScheme: ColorScheme, mode: ThemeMode) {
    const colors = getThemeColors(colorScheme, mode);
    const gradients = getGradients(colorScheme, mode);
    const root = document.documentElement;

    // تطبيق الألوان الأساسية
    Object.entries(colors).forEach(([key, value]) => {
        const cssVarName = `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
        root.style.setProperty(cssVarName, value);
    });

    // تطبيق التدرجات
    Object.entries(gradients).forEach(([key, value]) => {
        root.style.setProperty(`--gradient-${key}`, value);
    });

    // تطبيق dark mode class
    if (mode === 'dark') {
        root.classList.add('dark');
    } else {
        root.classList.remove('dark');
    }
}

/**
 * الحصول على لون من الرسم البياني حسب الفهرس
 */
export function getChartColorByIndex(
    colorScheme: ColorScheme,
    mode: ThemeMode,
    index: number
) {
    const colors = getChartColors(colorScheme, mode);
    return colors[index % colors.length];
}

/**
 * تحويل HSL إلى Hex (للاستخدام في الطباعة والتصدير)
 */
export function hslToHex(hsl: string): string {
    // Parse HSL string like "hsl(152, 65%, 35%)"
    const matches = hsl.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
    if (!matches) return '#000000';

    const h = parseInt(matches[1]);
    const s = parseInt(matches[2]) / 100;
    const l = parseInt(matches[3]) / 100;

    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;

    let r = 0,
        g = 0,
        b = 0;

    if (h >= 0 && h < 60) {
        r = c;
        g = x;
        b = 0;
    } else if (h >= 60 && h < 120) {
        r = x;
        g = c;
        b = 0;
    } else if (h >= 120 && h < 180) {
        r = 0;
        g = c;
        b = x;
    } else if (h >= 180 && h < 240) {
        r = 0;
        g = x;
        b = c;
    } else if (h >= 240 && h < 300) {
        r = x;
        g = 0;
        b = c;
    } else if (h >= 300 && h < 360) {
        r = c;
        g = 0;
        b = x;
    }

    const toHex = (n: number) => {
        const hex = Math.round((n + m) * 255).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    };

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// ================== الثيمات الافتراضية ==================
export const DEFAULT_THEME: {
    colorScheme: ColorScheme;
    mode: ThemeMode;
} = {
    colorScheme: 'green',
    mode: 'light',
} as const;

// ================== قائمة الثيمات المتاحة ==================
export const AVAILABLE_THEMES = [
    { id: 'green', name: 'أخضر تقليدي', icon: '🟢' },
    { id: 'blue', name: 'أزرق احترافي', icon: '🔵' },
    { id: 'purple', name: 'بنفسجي راقي', icon: '🟣' },
    { id: 'orange', name: 'برتقالي نابض', icon: '🟠' },
    { id: 'red', name: 'أحمر قوي', icon: '🔴' },
] as const;
