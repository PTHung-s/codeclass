import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // loadEnv đọc .env / .env.production — process.env KHÔNG tự chứa biến từ file .env
  const env = loadEnv(mode, process.cwd(), '')
  // Serve app trong subfolder /meet của codeclass.vnotemate.com khi deploy production
  const base = process.env.VITE_APP_BASE || env.VITE_APP_BASE || '/'
  return {
    base,
    define: {
      // Đổi theo mỗi lần deploy để hash asset đổi → vượt Cloudflare cache
      __BUILD_TAG__: JSON.stringify(process.env.BUILD_TAG || env.BUILD_TAG || 'r1'),
    },
    plugins: [
      react({
        babel: {
          plugins: [['babel-plugin-react-compiler']],
        },
      }),
    ],
    // Bỏ console.log/debug ở mọi build (giữ console.warn/error để debug prod)
    esbuild: {
      pure: ['console.log', 'console.debug'],
    },
    build: {
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          // Tách các thư viện nặng thành chunk riêng → cache tốt + tải song song
          manualChunks: {
            monaco: ['@monaco-editor/react'],
            charts: ['recharts'],
            markdown: ['react-markdown', 'remark-gfm', 'remark-math', 'rehype-katex', 'katex'],
            syntax: ['react-syntax-highlighter'],
            layout: ['flexlayout-react'],
            webrtc: ['mediasoup-client'],
            vendor: ['react', 'react-dom', 'zustand', 'socket.io-client', 'axios', 'lucide-react'],
          },
        },
      },
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:5000',
          changeOrigin: true,
        },
        '/socket.io': {
          target: 'http://localhost:5000',
          changeOrigin: true,
          ws: true,
        },
        '/music': {
          target: 'http://localhost:5000',
          changeOrigin: true,
        },
        '/uploads': {
          target: 'http://localhost:5000',
          changeOrigin: true,
        },
      },
    },
  }
})
