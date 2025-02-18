import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: "resolve-y-protocols",
      resolveId(source) {
        if (source === "y-protocols") {
          return path.resolve(
            __dirname,
            "node_modules/y-protocols/dist/index.js"
          );
        }
        return null;
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["yjs", "y-protocols"],
  },
  build: {
    commonjsOptions: {
      include: [/node_modules/],
      transformMixedEsModules: true,
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: "globalThis",
      },
      platform: "browser",
    },
  },
});
