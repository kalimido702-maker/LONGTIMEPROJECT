import React, { createContext, useContext, ReactNode } from "react";
import { useSettings as useSettingsHook } from "@/hooks/use-settings";

interface SettingsContextType {
  getSetting: (key: string) => string;
  updateSetting: (key: string, value: string) => Promise<void>;
  loading: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(
  undefined
);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const settingsHook = useSettingsHook();

  return (
    <SettingsContext.Provider
      value={{
        getSetting: settingsHook.getSetting,
        updateSetting: settingsHook.updateSetting,
        loading: settingsHook.loading,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettingsContext() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error(
      "useSettingsContext must be used within a SettingsProvider"
    );
  }
  return context;
}
