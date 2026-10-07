import { defineConfig } from '@tarojs/cli'
export default defineConfig({ projectName: 'befull-miniprogram', date: '2026-10-07', designWidth: 750, deviceRatio: {750: 1}, sourceRoot: 'src', outputRoot: 'dist', framework: 'react', compiler: 'webpack5', plugins: ['@tarojs/plugin-platform-weapp'], mini: { postcss: { pxtransform: { enable: true }, cssModules: { enable: false } } } })
