#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""SOP-C 全量链接审计（「成为全栈」系列发布维护标准动作）。

一次运行覆盖三类缺陷：

  A. 幽灵链       正文链接的 CSDN ID 在索引中不存在（多为手工录入的编造 URL）
  B. 真错链       正文链接的 ID 在索引中，但文案指向的其实是另一篇（严格口径判定）
  C. 占位残留     正文仍留有 {{LINK:Mx-yy}}，而其目标篇已发布（应已回填）

用法：
    python3 check_links.py                     # 默认路径，人类可读报告
    python3 check_links.py --json              # 机器可读
    python3 check_links.py --no-placeholder    # 只跑 A/B（跳过 C）

退出码：0 = 全绿；1 = 存在缺陷；2 = 输入文件缺失。

依赖：仅标准库（无第三方包）。

设计说明
--------
* 索引是「什么已发布」的真相源（`materials/csdn-已发布链接.md`，由 blog AI 生成）。
* `ARTICLES.md` 是「本地源已发布范围」的真相源（🟢 已发布 行）。
  由于写作线会在发布后继续改本地源，两者的滞后方向不同，故分别用于 B 与 C。
* 「真错链」用严格口径：正文链接文案常是**改写式**（例：「阅读量：时间桶去重与原子计数」
  指向《阅读量防刷：去重、冷却与计数写分离》），字面不等 ≠ 错链。
  判定法 = 文案与「目标标题」相似度 vs 与「全索引其余标题」的最高分，
  仅当别的标题明显更吻合（差值 > 0.28 且绝对值 > 0.55）才算错链。
  实测字面口径会误报 12 条，严格口径为 0。
"""

from __future__ import annotations

import argparse
import difflib
import json
import os
import re
import sys

# ---------------------------------------------------------------- 默认路径

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))

DEFAULT_INDEX = '/Users/fungleo/Documents/Blogs/materials/csdn-已发布链接.md'
DEFAULT_ARTICLES = os.path.join(REPO, 'articles')
DEFAULT_ARTICLES_MD = os.path.join(REPO, 'ARTICLES.md')

# 严格口径阈值（见模块 docstring）
WRONG_GAP = 0.28
WRONG_ABS = 0.55

# 正文中的 Markdown 链接：[文案](https://blog.csdn.net/<user>/article/details/<id>)
LINK_RE = re.compile(
    r'\[([^\]]+)\]\(https?://blog\.csdn\.net/[^/]+/article/details/(\d+)\)'
)
# 索引条目：[标题](https://blog.csdn.net/<user>/article/details/<id>)
INDEX_RE = re.compile(
    r'\[([^\]]+)\]\(https?://blog\.csdn\.net/[^/]+/article/details/(\d+)\)'
)
# 占位 token：{{LINK:M3-06}} / {{LINK:B-01}}
PLACEHOLDER_RE = re.compile(r'\{\{LINK:([A-Za-z]\d*-\d+)\}\}')
# ARTICLES.md 行内草稿路径：articles/M3-06-xxx.md
ARTICLE_PATH_RE = re.compile(r'articles/([A-Za-z]\d*-\d+)-')


def norm_title(s: str) -> str:
    """标题归一化：剥离系列前缀与所有非字母数字/汉字字符。"""
    s = re.sub(r'^成为全栈[·・]', '', s or '')
    s = re.sub(r'^[^·]*篇[·・]', '', s)
    return re.sub(r'[^\u4e00-\u9fffA-Za-z0-9]', '', s)


def read_text(path: str) -> str:
    with open(path, encoding='utf-8', errors='ignore') as fh:
        return fh.read()


def load_index(path: str) -> dict[str, str]:
    """返回 {csdn_id: 标题}。"""
    titles: dict[str, str] = {}
    for line in read_text(path).splitlines():
        for m in INDEX_RE.finditer(line):
            titles[m.group(2)] = m.group(1)
    return titles


def load_published_keys(articles_md: str) -> set[str]:
    """从 ARTICLES.md 提取状态为 🟢（或状态列为「已发布」）的行所属篇号。

    只判定表格行的**状态单元格**（最后一列），不做整行子串匹配。
    否则标题里的字面「已发布」会造成假阳性——
    例：《投稿状态机：草稿、待审核与已发布》（M4-19）曾被误判为已发布。
    """
    keys: set[str] = set()
    for line in read_text(articles_md).splitlines():
        if '|' not in line:
            continue
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        if not cells:
            continue
        status = cells[-1]
        if '🟢' not in status and not ('已发布' in status and '🟡' not in status):
            continue
        m = ARTICLE_PATH_RE.search(line)
        if m:
            keys.add(m.group(1))
    return keys


def iter_markdown(articles_dir: str):
    """按文件名排序产出 (文件名, 行号, 行内容)。"""
    for name in sorted(os.listdir(articles_dir)):
        if not name.endswith('.md'):
            continue
        path = os.path.join(articles_dir, name)
        for i, line in enumerate(read_text(path).splitlines(), 1):
            yield name, i, line


# ---------------------------------------------------------------- 检测


def check_ghost_and_wrong(articles_dir: str, titles: dict[str, str]):
    """A 幽灵链 + B 真错链。返回 (ghosts, wrongs, used_ids)。"""
    ghosts: list[dict] = []
    wrongs: list[dict] = []
    used: set[str] = set()

    for name, lineno, line in iter_markdown(articles_dir):
        for m in LINK_RE.finditer(line):
            text, cid = m.group(1), m.group(2)
            used.add(cid)
            if cid not in titles:
                ghosts.append({'file': name, 'line': lineno, 'id': cid, 'text': text})
                continue
            nt = norm_title(text)
            self_score = difflib.SequenceMatcher(None, nt, norm_title(titles[cid])).ratio()
            best, best_id, best_title = 0.0, None, None
            for oid, otitle in titles.items():
                if oid == cid:
                    continue
                score = difflib.SequenceMatcher(None, nt, norm_title(otitle)).ratio()
                if score > best:
                    best, best_id, best_title = score, oid, otitle
            if best > self_score + WRONG_GAP and best > WRONG_ABS:
                wrongs.append({
                    'file': name,
                    'line': lineno,
                    'text': text,
                    'points_to': {'id': cid, 'title': titles[cid], 'score': round(self_score, 2)},
                    'looks_like': {'id': best_id, 'title': best_title, 'score': round(best, 2)},
                })
    return ghosts, wrongs, used


def check_placeholder_residue(articles_dir: str, published_keys: set[str]):
    """C 占位残留：目标篇已发布，却仍留 {{LINK}}。返回 (residues, pending)。"""
    residues: list[dict] = []
    pending: dict[str, int] = {}

    for name, lineno, line in iter_markdown(articles_dir):
        for m in PLACEHOLDER_RE.finditer(line):
            key = m.group(1)
            if key in published_keys:
                residues.append({'file': name, 'line': lineno, 'key': key})
            else:
                pending[key] = pending.get(key, 0) + 1
    return residues, pending


# ---------------------------------------------------------------- 输出


def report_text(args, titles, used, ghosts, wrongs, residues, pending, published_keys):
    out = []
    out.append('=' * 68)
    out.append('SOP-C 全量链接审计')
    out.append('=' * 68)
    out.append(f'索引文件   : {args.index}')
    out.append(f'文章目录   : {args.articles}')
    out.append(f'索引条目   : {len(titles)}')
    out.append(f'正文唯一 ID: {len(used)}')
    out.append(f'已发布篇数 : {len(published_keys)}（取自 ARTICLES.md 🟢 行）')
    out.append('')

    out.append(f'[A] 幽灵链：{len(ghosts)}')
    for g in ghosts:
        out.append(f'    {g["file"]}:{g["line"]}  ID={g["id"]}  文案={g["text"]}')
    out.append('')

    out.append(f'[B] 真错链：{len(wrongs)}（严格口径 差值>{WRONG_GAP} 且 >{WRONG_ABS}）')
    for w in wrongs:
        out.append(f'    {w["file"]}:{w["line"]}')
        out.append(f'      文案      : {w["text"]}')
        out.append(f'      当前指向  : {w["points_to"]["id"]} = {w["points_to"]["title"]}'
                   f'  (相似度 {w["points_to"]["score"]})')
        out.append(f'      实际更像  : {w["looks_like"]["id"]} = {w["looks_like"]["title"]}'
                   f'  (相似度 {w["looks_like"]["score"]})')
    out.append('')

    if not args.no_placeholder:
        out.append(f'[C] 占位残留（目标已发布，应回填）：{len(residues)}')
        for r in residues:
            out.append(f'    {r["file"]}:{r["line"]}  {{{{LINK:{r["key"]}}}}}')
        out.append('')
        out.append(f'    待发占位合计 {sum(pending.values())} 处，'
                   f'覆盖 {len(pending)} 个未发布目标（正常，发布后逐轮消项）')
        out.append('')

    total = len(ghosts) + len(wrongs) + (0 if args.no_placeholder else len(residues))
    out.append('=' * 68)
    out.append('结论：' + ('✅ 全绿（幽灵 0 / 错链 0 / 残留 0）' if total == 0
                          else f'❌ 发现 {total} 处缺陷，需修复后复跑'))
    out.append('=' * 68)
    return '\n'.join(out)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description='SOP-C 全量链接审计')
    ap.add_argument('--index', default=DEFAULT_INDEX, help='已发布链接索引 md')
    ap.add_argument('--articles', default=DEFAULT_ARTICLES, help='文章目录')
    ap.add_argument('--articles-md', default=DEFAULT_ARTICLES_MD, help='ARTICLES.md')
    ap.add_argument('--no-placeholder', action='store_true', help='跳过占位残留检测')
    ap.add_argument('--json', action='store_true', help='输出 JSON')
    args = ap.parse_args(argv)

    for label, path in (('索引', args.index), ('文章目录', args.articles)):
        if not os.path.exists(path):
            print(f'[错误] {label}不存在：{path}', file=sys.stderr)
            return 2
    if not args.no_placeholder and not os.path.exists(args.articles_md):
        print(f'[错误] ARTICLES.md 不存在：{args.articles_md}', file=sys.stderr)
        return 2

    titles = load_index(args.index)
    published_keys = set() if args.no_placeholder else load_published_keys(args.articles_md)
    ghosts, wrongs, used = check_ghost_and_wrong(args.articles, titles)
    if args.no_placeholder:
        residues, pending = [], {}
    else:
        residues, pending = check_placeholder_residue(args.articles, published_keys)

    if args.json:
        print(json.dumps({
            'index': {'path': args.index, 'entries': len(titles)},
            'articles': {'path': args.articles, 'unique_ids': len(used)},
            'published_keys': sorted(published_keys),
            'ghosts': ghosts,
            'wrong_links': wrongs,
            'placeholder_residues': residues,
            'pending_placeholders': dict(sorted(pending.items())),
            'summary': {
                'ghosts': len(ghosts),
                'wrong_links': len(wrongs),
                'placeholder_residues': len(residues),
                'clean': not (ghosts or wrongs or residues),
            },
        }, ensure_ascii=False, indent=2))
    else:
        print(report_text(args, titles, used, ghosts, wrongs, residues, pending, published_keys))

    return 0 if not (ghosts or wrongs or residues) else 1


if __name__ == '__main__':
    sys.exit(main())
