import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        timeout: 30 * 60 * 1000, // 30 minutes
        proxyTimeout: 30 * 60 * 1000, // 30 minutes
      }
    }
  }
});
