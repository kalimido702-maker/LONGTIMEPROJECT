import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import electron from "vite-plugin-electron/simple";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // تحقق من وجود متغير البيئة ELECTRON لتفعيل electron plugin
  const isElectron = process.env.ELECTRON === "true";

  const plugins: any[] = [react(), mode === "development" && componentTagger()];

  // أضف electron plugin فقط عند الحاجة
  if (isElectron) {
    plugins.push(
      electron({
        main: {
          entry: "electron/main.ts",
          vite: {
            build: {
              rollupOptions: {
                external: [
                  "better-sqlite3",
                  "bufferutil",
                  "utf-8-validate",
                  "supports-color",
                  "sharp", // Image processing library (optional for Baileys)
                  /^pino/, // Exclude all pino packages
                  /^diagnostics_channel/,
                  /^sonic-boom/,
                  /^thread-stream/,
                ],
              },
            },
            resolve: {
              // Don't bundle node built-ins
              conditions: ["node"],
            },
          },
        },
        preload: {
          input: "electron/preload.ts",
          vite: {
            build: {
              outDir: "dist-electron",
              rollupOptions: {
                output: {
                  format: "es",
                },
              },
            },
          },
        },
        renderer: {},
      })
    );
  }

  return {
    server: {
      host: "::",
      port: 8080,
    },
    base: isElectron && mode === "production" ? "./" : "/",
    plugins: plugins.filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        // Polyfills for Node.js built-in modules
        events: "events",
        buffer: "buffer",
        stream: "stream-browserify",
        util: "util",
      },
    },
    optimizeDeps: {
      esbuildOptions: {
        define: {
          global: "globalThis",
        },
      },
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
      rollupOptions: {
        external: isElectron ? [] : undefined,
      },
    },
  };
});
