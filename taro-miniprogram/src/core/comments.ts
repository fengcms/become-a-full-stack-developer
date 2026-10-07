import type { Comment } from "./models";
// 跨页缺失的父楼只显示提示；循环引用有保护，不伪造作者或丢弃回复。
export function groupComments(items: Comment[]) {
  const index = new Map(items.map((c) => [c.id, c])),
    groups = new Map<number, Comment[]>();
  for (const comment of items) {
    let root = comment.id,
      at = comment;
    const seen = new Set([root]);
    while (at.parentId && !seen.has(at.parentId)) {
      root = at.parentId;
      seen.add(root);
      const parent = index.get(root);
      if (!parent) break;
      at = parent;
    }
    const group = groups.get(root) || [];
    group.push(comment);
    groups.set(root, group);
  }
  return [...groups.entries()].map(([id, list]) => ({
    id,
    root: index.get(id),
    replies: list.filter((c) => c.id !== id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  }));
}
