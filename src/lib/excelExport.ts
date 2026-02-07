/**
 * دالة مساعدة لحفظ ملفات Excel مع حوار الحفظ في Electron
 */
export async function saveExcelFile(
  htmlContent: string,
  defaultFilename: string
): Promise<{
  success: boolean;
  filePath?: string;
  error?: string;
  canceled?: boolean;
}> {
  try {
    // إضافة BOM للدعم الصحيح للعربية
    const BOM = "\uFEFF";
    const finalContent = BOM + htmlContent;

    // التحقق من وجود Electron API
    // @ts-ignore - سيتم تحديث types في التشغيل القادم
    if (window.electronAPI && window.electronAPI.file) {
      // استخدام حوار الحفظ في Electron
      // @ts-ignore
      const result = await window.electronAPI.file.saveDialog({
        defaultPath: defaultFilename,
        filters: [
          { name: "Excel Files", extensions: ["xlsx"] },
          { name: "All Files", extensions: ["*"] },
        ],
        content: finalContent,
      });

      return result;
    } else {
      // Fallback للمتصفح العادي (التنزيل المباشر)
      const blob = new Blob([finalContent], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=utf-8;",
      });

      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);

      link.setAttribute("href", url);
      link.setAttribute("download", defaultFilename);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      return {
        success: true,
        filePath: defaultFilename,
      };
    }
  } catch (error: any) {
    console.error("Excel save error:", error);
    return {
      success: false,
      error: error.message || "حدث خطأ أثناء حفظ الملف",
    };
  }
}
