import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'
import { defineConfig } from 'vite'

const srcPath = fileURLToPath(new URL('./src', import.meta.url))

/** 精简版 Prism 语言集入口，见 build/refractor-languages.ts 头注释。 */
const refractorLanguagesPath = fileURLToPath(
  new URL('./build/refractor-languages.ts', import.meta.url),
)

/**
 * 开发期后端目标（方案 B：同源代理，浏览器不直连，绕开 CORS）。
 * 默认指向本地后端 localhost:11000，走快链路做页面调优；
 * 要联调线上时 `API_TARGET=https://api-befull.kao9.com pnpm dev` 即可，无需改代码。
 */
const API_TARGET = process.env.API_TARGET ?? 'http://localhost:11000'

/**
 * 产物体积分析开关。仅 `ANALYZE=1 pnpm build` 时挂 `rollup-plugin-visualizer`，
 * 在正常构建 / CI 里完全不参与，避免每次都落一个 stats.html 噪点文件。
 * 产物落到 `dist/stats.html`（treemap，含 gzip/brotli 双口径），供 M2-13 复盘体积。
 */
const enableBundleAnalyzer = process.env.ANALYZE === '1'

/**
 * Markdown 编辑器生态的包名特征。命中即归入独立 chunk（审阅 P3-2）。
 *
 * 为什么要拆：编辑器内部拖进 CodeMirror + Prism 高亮 + remark/rehype 整条 markdown
 * 渲染链，未拆分时整包并入 ArticleFormPage，产出 1.06MB 的单 chunk。
 * 拆出后它仍随 /articles/new、/articles/:id/edit 两个懒加载路由按需下载，
 * 文章列表、仪表盘等页面不再被迫携带编辑器重量。
 */
const MD_EDITOR_PKGS = [
  '@uiw/',
  '@codemirror/',
  '@lezer/',
  'refractor',
  'rehype-prism-plus',
  'node_modules/remark',
  'node_modules/rehype',
  'node_modules/micromark',
  'node_modules/unified',
  'node_modules/vfile',
  'node_modules/unist',
  'node_modules/mdast',
  'node_modules/hast',
  'node_modules/parse-entities',
  'node_modules/character-entities',
  'node_modules/property-information',
]

// 两条代理规则，缺一不可：
//   /api/v1 → 业务接口
//   /files  → 附件下载。契约里 attachment.url = /files/{key}，挂在后端根路径而非 /api/v1 下，
//             只代理 /api/v1 会让所有图片 404（参考项目踩过的坑）。
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // 仅 ANALYZE=1 时挂体积分析器（M2-13 复盘用），平时零开销。
    ...(enableBundleAnalyzer
      ? [
          visualizer({
            filename: 'dist/stats.html',
            template: 'treemap',
            gzipSize: true,
            brotliSize: true,
          }),
        ]
      : []),
  ],
  resolve: {
    alias: [
      /**
       * 把 refractor 的两种入口都顶替成精简语言集（审阅 P3-2 瘦身）。
       *
       * rehype-prism-plus 的默认入口会 import `refractor/all`，一次性注册 297 种语言；
       * 其 default 导出正是基于这个全量实例。这里把 `refractor` 与 `refractor/all`
       * 同时指向我们自己的 41 种语言集（common 36 + jsx/tsx/nginx/docker/http），
       * 冷门语言一律不进产物。
       *
       * 只顶替 `/all`：rehype-prism-plus 的 default 导出的正是基于 `refractor/all`
       * 构建的全量实例，替换它就够了。
       *
       * ⚠️ 不要连裸 `refractor` 一起替换：build/refractor-languages.ts 自身就
       * `import { refractor } from 'refractor'`，会形成别名指向自己的死循环。
       * ⚠️ 必须精确匹配整串：写成前缀别名会把 `refractor/jsx` 之类子路径一并改写。
       */
      { find: /^refractor\/all$/, replacement: refractorLanguagesPath },
      { find: '@', replacement: srcPath },
    ],
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
  build: {
    rollupOptions: {
      output: {
        /** 编辑器生态整体独立成 chunk，与业务代码物理隔离。 */
        manualChunks: (id) => (MD_EDITOR_PKGS.some((pkg) => id.includes(pkg)) ? 'md-editor' : null),
      },
    },
  },
})
