import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true
  },
  preview: {
    host: "127.0.0.1"
  },
  // The production build is served by FastAPI (backend/static), so a host needs
  // Python only. Rebuild and commit it after frontend changes: npm run build.
  build: {
    outDir: "../backend/static",
    emptyOutDir: true
  }
});