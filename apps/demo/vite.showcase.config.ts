import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: resolve(import.meta.dirname, "showcase"),
  publicDir: resolve(import.meta.dirname, "public"),
  base: process.env.VENTUS_SHOWCASE_BASE_PATH || "/",
  plugins: [react()],
  define: {
    "import.meta.env.VITE_VENTUS_FEEDBACK_ENDPOINT": JSON.stringify(""),
    "import.meta.env.VITE_VENTUS_FEEDBACK_PROJECT_KEY": JSON.stringify(""),
    "import.meta.env.VITE_VENTUS_SHOWCASE": JSON.stringify("true"),
  },
  build: {
    outDir: resolve(import.meta.dirname, "dist-showcase"),
    emptyOutDir: true,
  },
});
