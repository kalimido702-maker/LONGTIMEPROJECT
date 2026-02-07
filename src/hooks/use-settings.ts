import { useState, useEffect } from "react";
import { db, Setting } from "@/shared/lib/indexedDB";

export function useSettings() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSettings = async () => {
    try {
      // تهيئة قاعدة البيانات أولاً
      await db.init();
      const allSettings = await db.getAll<Setting>("settings");
      setSettings(allSettings);
    } catch (error) {
      console.error("Error loading settings:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const getSetting = (key: string): string => {
    const setting = settings.find((s) => s.key === key);
    return setting?.value || "";
  };

  const getSettingObject = (key: string): Setting | undefined => {
    return settings.find((s) => s.key === key);
  };

  const updateSetting = async (key: string, value: string) => {
    try {
      // تأكد من تهيئة قاعدة البيانات
      await db.init();
      const existing = await db.get<Setting>("settings", key);
      if (existing) {
        const updated: Setting = {
          ...existing,
          value,
          updatedAt: new Date().toISOString(),
        };
        await db.update("settings", updated);
      } else {
        const newSetting: Setting = {
          key,
          value,
          category: "system",
          updatedAt: new Date().toISOString(),
        };
        await db.add("settings", newSetting);
      }
      await loadSettings();
    } catch (error) {
      console.error("Error updating setting:", error);
      throw error;
    }
  };

  const updateMultipleSettings = async (
    updates: { key: string; value: string }[]
  ) => {
    try {
      // تأكد من تهيئة قاعدة البيانات
      await db.init();
      for (const { key, value } of updates) {
        const existing = await db.get<Setting>("settings", key);
        if (existing) {
          const updated: Setting = {
            ...existing,
            value,
            updatedAt: new Date().toISOString(),
          };
          await db.update("settings", updated);
        } else {
          const newSetting: Setting = {
            key,
            value,
            category: "system",
            updatedAt: new Date().toISOString(),
          };
          await db.add("settings", newSetting);
        }
      }
      await loadSettings();
    } catch (error) {
      console.error("Error updating settings:", error);
      throw error;
    }
  };

  const getSettingsByCategory = (
    category: "company" | "tax" | "receipt" | "system"
  ) => {
    return settings.filter((s) => s.category === category);
  };

  return {
    settings,
    loading,
    getSetting,
    getSettingObject,
    updateSetting,
    updateMultipleSettings,
    getSettingsByCategory,
    reload: loadSettings,
  };
}

// Hook للحصول على قيمة إعداد واحد فقط
export function useSetting(key: string) {
  const [value, setValue] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSetting = async () => {
      try {
        // تهيئة قاعدة البيانات أولاً
        await db.init();
        const setting = await db.get<Setting>("settings", key);
        setValue(setting?.value || "");
      } catch (error) {
        console.error(`Error loading setting ${key}:`, error);
      } finally {
        setLoading(false);
      }
    };

    loadSetting();
  }, [key]);

  const updateValue = async (newValue: string) => {
    try {
      // تأكد من تهيئة قاعدة البيانات
      await db.init();
      const existing = await db.get<Setting>("settings", key);
      if (existing) {
        const updated: Setting = {
          ...existing,
          value: newValue,
          updatedAt: new Date().toISOString(),
        };
        await db.update("settings", updated);
      } else {
        const newSetting: Setting = {
          key,
          value: newValue,
          category: "system",
          updatedAt: new Date().toISOString(),
        };
        await db.add("settings", newSetting);
      }
      setValue(newValue);
    } catch (error) {
      console.error(`Error updating setting ${key}:`, error);
      throw error;
    }
  };

  return {
    value,
    loading,
    updateValue,
  };
}
