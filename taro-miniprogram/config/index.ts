import { defineConfig } from "@tarojs/cli";
export default defineConfig({
  projectName: "befull-miniprogram",
  date: "2026-10-07",
  defineConstants: {
    __API_BASE__: JSON.stringify(
      process.env.TARO_APP_API_BASE || "https://api-befull.kao9.com/api/v1",
    ),
  },
  designWidth: 750,
  deviceRatio: { 750: 1 },
  sourceRoot: "src",
  outputRoot: "dist",
  framework: "react",
  compiler: "webpack5",
  plugins: ["@tarojs/plugin-platform-weapp"],
  copy: { patterns: [{ from: "src/assets", to: "dist/assets" }] },
  mini: { postcss: { pxtransform: { enable: true }, cssModules: { enable: false } } },
});
