/**
 * @file build/refractor-languages.ts
 * @description 精简的 Prism 语言集，供 vite alias 顶替 `refractor` 与 `refractor/all`。
 *
 * 背景（审阅 P3-2）：@uiw/react-md-editor 的预览经 rehype-prism-plus 走 refractor，
 * 而 rehype-prism-plus 的默认入口会 import `refractor/all` —— 一次性注册 297 种语言，
 * 其中绝大多数（abap、agda、apl…）在中文技术博客里永远用不到，却实打实占了产物体积。
 * 实测把全量换成「常用集 + 补齐集」后，编辑器 chunk 从 1.06MB 降到 0.56MB。
 *
 * 为什么不是直接用 refractor 官方的 common 集（36 种）：
 * common 里**没有 jsx / tsx**，而本项目是 React 技术栈的后台，文章里 jsx/tsx 代码块
 * 出现频率极高，缺了它们高亮会静默失效。nginx / docker / http 则是运维类文章常客。
 * 所以这里在 common 之上补齐这几门，其余冷门语言一律不引入。
 *
 * 注意：`html` 无需单独注册 —— markup 语法自带 html 别名
 * （refractor 内部 `Prism.languages.html = Prism.languages.markup`），故 ```html 可正常高亮。
 *
 * @module manage-frontend/build
 * @date 2026-08-29
 */

// 走官方 exports 路径：'.' → lib/common.js，'./*' → lang/*.js。
// ⚠️ 不要写成 'refractor/lib/common.js'：该子路径不在包 exports 里，会解析失败。
// ⚠️ 也不要 alias 裸 'refractor'：本文件自己就 import 它，会造成别名自我循环。
import { refractor } from 'refractor'

/* ---- 在 common 之上补齐的语言。common 已注册基础语法，故依赖顺序天然满足 ---- */
import docker from 'refractor/docker'
import http from 'refractor/http'
import jsx from 'refractor/jsx'
import nginx from 'refractor/nginx'
import tsx from 'refractor/tsx'

/** 补齐集：React 技术栈的 jsx/tsx 是刚需，nginx/docker/http 覆盖运维类文章。 */
const EXTRA_SYNTAXES = [jsx, tsx, nginx, docker, http]

for (const syntax of EXTRA_SYNTAXES) {
  refractor.register(syntax)
}

export { refractor }
