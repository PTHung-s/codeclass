import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return;
          if (id.includes("framer-motion")) return "vendor-motion";
          if (id.includes("lucide-react")) return "vendor-icons";
          if (id.includes("@monaco-editor") || id.includes("monaco-editor")) return "vendor-monaco";
          if (id.includes("katex")) return "vendor-katex";
          if (
            id.includes("react-markdown") ||
            id.includes("react-syntax-highlighter") ||
            id.includes("refractor") ||
            id.includes("prismjs") ||
            id.includes("remark-") ||
            id.includes("rehype-") ||
            id.includes("unified") ||
            id.includes("micromark") ||
            id.includes("mdast") ||
            id.includes("hast")
          ) {
            return "vendor-markdown";
          }
          if (id.includes("@tanstack") || id.includes("axios") || id.includes("centrifuge")) {
            return "vendor-data";
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/ws": {
        target: "http://localhost:3001",
        ws: true,
        changeOrigin: true,
      },
      "/meet": {
        target: "http://localhost:5000",
        ws: true,
        changeOrigin: true,
      },
      "/connection/websocket": {
        target: "http://localhost:8000",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
