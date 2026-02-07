// Hook لاستخدام Electron APIs في مكونات React

import { useEffect, useState } from "react";

export function useElectronAPI() {
  const [isElectron, setIsElectron] = useState(false);
  const [appVersion, setAppVersion] = useState<string>("");
  const [userDataPath, setUserDataPath] = useState<string>("");

  useEffect(() => {
    // تحقق من وجود Electron API
    if (window.electronAPI) {
      setIsElectron(true);

      // احصل على نسخة التطبيق
      window.electronAPI.getAppVersion().then((version) => {
        setAppVersion(version);
      });

      // احصل على مسار بيانات المستخدم
      window.electronAPI.getUserDataPath().then((path) => {
        setUserDataPath(path);
      });
    }
  }, []);

  return {
    isElectron,
    appVersion,
    userDataPath,
    api: window.electronAPI,
  };
}

// مكون لعرض معلومات التطبيق
export function ElectronInfo() {
  const { isElectron, appVersion, userDataPath } = useElectronAPI();

  if (!isElectron) {
    return (
      <div className="p-4 bg-yellow-100 rounded border border-yellow-300">
        <p className="text-sm">⚠️ التطبيق يعمل في المتصفح</p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-green-100 rounded border border-green-300">
      <h3 className="font-bold text-green-800 mb-2">✓ معلومات التطبيق</h3>
      <div className="text-sm text-green-700 space-y-1">
        <p>النسخة: {appVersion}</p>
        <p className="text-xs break-all">مسار البيانات: {userDataPath}</p>
        <p className="text-xs">يقدم نظام متكامل لإدارة نقاط البيع</p>
      </div>
    </div>
  );
}
