/**
 * vitest.config.ts
 * 测试运行配置。setupFiles 在测试用例前执行（注入内存库 + 测试环境）。
 * resolve.alias 把 @ 映射到 ./src，与 tsconfig paths 保持一致，使 @/ 别名在测试中可用。
 */
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts'],
  },
});
