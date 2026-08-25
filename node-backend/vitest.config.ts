/**
 * vitest.config.ts
 * 测试运行配置。setupFiles 在测试用例前执行（注入内存库 + 测试环境）。
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts'],
  },
});
