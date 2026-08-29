import { defineConfig, mergeConfig } from 'vitest/config'
// 必须带 .ts 扩展名：Vite 未来的 configLoader: 'native' 不再支持无扩展名导入，
// 现在写上可避免升级后配置加载直接失败。
import viteConfig from './vite.config.ts'

/**
 * 测试配置。复用 vite.config.ts 的解析规则（尤其是 `@` 别名），
 * 只覆盖 test 相关项，避免两套解析逻辑漂移。
 *
 * 环境刻意选 node 而非 jsdom：当前冒烟测试覆盖的是请求层、权限判定这类
 * 与 DOM 无关的逻辑，node 环境更快也更贴近真实运行条件（fetch / Headers 均为 Node 原生实现）。
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
      /** 每个测试文件独立环境，避免模块级状态（如刷新锁）跨文件串味。 */
      isolate: true,
    },
  }),
)
