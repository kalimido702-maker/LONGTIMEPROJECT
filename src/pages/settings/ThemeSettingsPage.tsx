import { POSHeader } from "@/components/POS/POSHeader";
import { useThemeContext } from "@/contexts/ThemeContext";
import { AVAILABLE_THEMES } from "@/lib/theme.config";
import type { ThemeMode, ColorScheme } from "@/lib/theme.config";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Sun, Moon } from "lucide-react";

const ThemeSettingsPage = () => {
  const { mode, colorScheme, setMode, setColorScheme } = useThemeContext();

  return (
    <div className="h-full flex flex-col bg-background" dir="rtl">
      <POSHeader />
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <h2 className="text-2xl font-bold">الثيمات والألوان</h2>

          {/* Dark/Light Mode */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <Label className="text-base font-semibold">الوضع</Label>
              <div className="flex gap-3">
                <Button
                  variant={mode === "light" ? "default" : "outline"}
                  onClick={() => setMode("light")}
                  className="flex-1 gap-2"
                >
                  <Sun className="h-4 w-4" />
                  فاتح
                </Button>
                <Button
                  variant={mode === "dark" ? "default" : "outline"}
                  onClick={() => setMode("dark")}
                  className="flex-1 gap-2"
                >
                  <Moon className="h-4 w-4" />
                  داكن
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Color Scheme */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <Label className="text-base font-semibold">نظام الألوان</Label>
              <div className="grid grid-cols-3 gap-3">
                {(["green", "blue", "purple", "orange", "red"] as ColorScheme[]).map((scheme) => (
                  <Button
                    key={scheme}
                    variant={colorScheme === scheme ? "default" : "outline"}
                    onClick={() => setColorScheme(scheme)}
                    className="capitalize"
                  >
                    {scheme === "green" ? "أخضر" :
                     scheme === "blue" ? "أزرق" :
                     scheme === "purple" ? "بنفسجي" :
                     scheme === "orange" ? "برتقالي" : "أحمر"}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ThemeSettingsPage;
