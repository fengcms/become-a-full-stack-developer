/**
 * src/lib/toc.ts
 * 目录解析（B7）：由文章 Markdown 正文解析标题层级，生成锚点目录。
 * 纯函数、无 DB 依赖，便于单测。
 */
/** 目录项（TocItem）。 */
export interface TocItem {
  level: number;
  text: string;
  anchor: string;
}

/** 目录锚点 slug 化（保留字母/数字/中文，其余替换连字符，截断 100）。 */
const slugify = (text: string): string => {
  const s = text
    .trim()
    .toLowerCase()
    .replace(/[^\w一-龥]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s.slice(0, 100) || 'heading';
};

/** 由 Markdown 正文解析目录（跳过代码围栏内的 # 行；重复锚点追加 -n 去重）。 */
export const parseToc = (content: string): TocItem[] => {
  const items: TocItem[] = [];
  const seen = new Map<string, number>();
  let inFence = false;
  for (const line of content.split('\n')) {
    if (line.trimStart().startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const level = m[1]?.length ?? 0;
    const text = m[2]?.trim() ?? '';
    if (!text) continue;
    let anchor = slugify(text) || 'heading';
    const count = seen.get(anchor) ?? 0;
    seen.set(anchor, count + 1);
    if (count > 0) anchor = `${anchor}-${count}`;
    items.push({ level, text: text.slice(0, 200), anchor });
  }
  return items;
};
