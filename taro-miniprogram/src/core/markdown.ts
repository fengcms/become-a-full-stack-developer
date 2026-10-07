import MarkdownIt from "markdown-it";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import json from "highlight.js/lib/languages/json";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";
import bash from "highlight.js/lib/languages/bash";
import python from "highlight.js/lib/languages/python";
import dart from "highlight.js/lib/languages/dart";
import sql from "highlight.js/lib/languages/sql";
for (const [name, language] of Object.entries({
  javascript,
  typescript,
  json,
  css,
  xml,
  bash,
  python,
  dart,
  sql,
}))
  hljs.registerLanguage(name, language);
const md = new MarkdownIt({ html: false, linkify: true, breaks: true });
export interface MdNode {
  type: string;
  tag: string;
  content: string;
  attrs: Record<string, string>;
  info: string;
  children: MdNode[];
  id?: string;
}
export function parseMarkdown(source: string) {
  const tokens = md.parse(source, {});
  const headings: { id: string; title: string; level: number }[] = [];
  function tree(list: typeof tokens) {
    const root: MdNode = { type: "root", tag: "", content: "", attrs: {}, info: "", children: [] },
      stack = [root];
    for (const token of list) {
      if (token.nesting === -1) {
        if (stack.length > 1) stack.pop();
        continue;
      }
      const n: MdNode = {
        type: token.type,
        tag: token.tag,
        content: token.content,
        attrs: Object.fromEntries(token.attrs || []),
        info: token.info,
        children: token.children ? tree(token.children) : [],
      };
      if (token.type === "heading_open") {
        n.id = `heading-${headings.length}`;
        headings.push({ id: n.id, title: "", level: Number(token.tag.slice(1)) });
      }
      if (token.type === "inline" && stack[stack.length - 1].type === "heading_open")
        headings[headings.length - 1].title =
          token.children?.map((t) => t.content).join("") || token.content;
      stack[stack.length - 1].children.push(n);
      if (token.nesting === 1) stack.push(n);
    }
    return root.children;
  }
  const nodes = tree(tokens);
  return { nodes, headings };
}
export function highlight(code: string, language: string) {
  const escaped = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  if (!language || !hljs.getLanguage(language)) return escaped;
  return hljs
    .highlight(code, { language, ignoreIllegals: true })
    .value.replace(/class="([^"]+)"/g, (_, classes: string) => {
      const color = /keyword|literal|built_in/.test(classes)
        ? "#b078c4"
        : /string|attr/.test(classes)
          ? "#58a281"
          : /number|symbol/.test(classes)
            ? "#cc8c55"
            : /comment/.test(classes)
              ? "#8192a4"
              : "#6095ca";
      return `style="color:${color}"`;
    });
}
