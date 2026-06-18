import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Load VITE_* vars from the monorepo-root .env.
  envDir: fileURLToPath(new URL("../../", import.meta.url)),
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  optimizeDeps: {
    // Pre-bundle the 3D stack at startup. Otherwise Vite discovers these the
    // first time the demo tool lazy-loads its R3F loader and force-reloads the
    // page ("optimized dependencies changed. reloading") — which would remount
    // the tool mid-render. Dev-only concern; production bundles once.
    include: ["three", "@react-three/fiber", "@react-three/drei"],
  },
  server: {
    port: 5173,
  },
});
