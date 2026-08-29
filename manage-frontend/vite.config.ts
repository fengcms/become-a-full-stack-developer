import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const srcPath = fileURLToPath(new URL('./src', import.meta.url))

/** 线上后端。开发期一律走同源代理，浏览器不直连，绕开 CORS（方案 B）。 */
const API_TARGET = 'https://api-befull.kao9.com'

// 两条代理规则，缺一不可：
//   /api/v1 → 业务接口
//   /files  → 附件下载。契约里 attachment.url = /files/{key}，挂在后端根路径而非 /api/v1 下，
//             只代理 /api/v1 会让所有图片 404（参考项目踩过的坑）。
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': srcPath },
  },
  server: {
    port: 12000,
    strictPort: true, // 端口被占用直接报错，而不是静默换端口
    proxy: {
      '/api/v1': {
        target: API_TARGET,
        changeOrigin: true,
        secure: true,
      },
      '/files': {
        target: API_TARGET,
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
