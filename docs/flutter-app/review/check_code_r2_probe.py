#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
M4 Flutter APP 代码工艺 · 第二轮独立探针（评审侧）

与 check_code_quality.py（第一轮交付、作者按原样复跑）的区别：
  v1 的 FUNC_RE 逐行匹配，**识别不了多行签名，也完全不计 `=>` 箭头函数体**——
  作者本人也在回复文档里承认了这一点。若只复跑 v1，等于用尺子量自己。
  本探针改为「从 `{` / `=>` 反向回溯到上一个分隔符」的扫描法，多行签名天然覆盖。

本探针输出的是**事实数据**，不做 PASS/FAIL 判定——判定在报告里逐条对比。

用法：
    cd flutter-app
    /Users/fungleo/.workbuddy/binaries/python/envs/default/bin/python \
        ../docs/flutter-app/review/check_code_r2_probe.py
"""
import json
import os
import re
import sys
from collections import Counter, defaultdict

LIB = "lib"
THEME_DIR = os.path.join(LIB, "app", "theme") + os.sep
CJK = re.compile(r"[\u4e00-\u9fff]")

# ---------- 词法清洗：去注释、字符串字面量置空（保留行结构） ----------


def clean(text):
    """返回 (code, comments)。code 中字符串与注释都变成空格，注释原文另存。"""
    out, comments = [], []
    i, n = 0, len(text)
    while i < n:
        c = text[i]
        # 三引号 / 单引号 / 双引号
        if c in ('"', "'"):
            q = c
            multi = text[i:i + 3] in ('"""', "'''")
            if multi:
                q = text[i:i + 3]
            j = i + len(q)
            while j < n:
                if not multi and text[j] == "\\":
                    j += 2
                    continue
                if text[j:j + len(q)] == q:
                    break
                j += 1
            seg = text[i:j + len(q)]
            out.append("".join("\n" if ch == "\n" else " " for ch in seg))
            i = j + len(q)
            continue
        # 注释
        if c == "/" and i + 1 < n and text[i + 1] == "/":
            j = text.find("\n", i)
            if j == -1:
                j = n
            comments.append(text[i:j])
            out.append("".join(" " for _ in text[i:j]))
            i = j
            continue
        if c == "/" and i + 1 < n and text[i + 1] == "*":
            j = text.find("*/", i + 2)
            j = n if j == -1 else j + 2
            seg = text[i:j]
            comments.append(seg)
            out.append("".join("\n" if ch == "\n" else " " for ch in seg))
            i = j
            continue
        out.append(c)
        i += 1
    return "".join(out), comments


SIG = re.compile(
    r"(?:^|[;{}])\s*"
    r"(?:@[\w.]+(?:\((?:[^()]|\([^()]*\))*\))?\s*)*"
    r"(?:static\s+|abstract\s+|external\s+)*"
    r"(?:[\w<>,\[\]\?\.]+\s+)?"
    r"(?P<name>[A-Za-z_]\w*)\s*"
    r"(?:<[^<>]*(?:<[^<>]*>)?[^<>]*>)?\s*"
    r"\((?:[^()]|\([^()]*\))*\)\s*"
    r"(?:async\s*\*?\s*|sync\s*\*?\s*)?$"
)
CONTROL = {"if", "for", "while", "switch", "catch", "else", "try", "do"}


def funcs(path):
    """扫描函数：从 `{` 或 `=>` 反向回溯到分隔符，识别多行签名与箭头体。"""
    raw = open(path, encoding="utf-8").read()
    code, _ = clean(raw)
    lines = raw.split("\n")
    code_lines = code.split("\n")
    res = []

    # 建索引：字符位置 -> 行号
    def lineof(pos):
        return code.count("\n", 0, pos) + 1

    def linelen(ln):
        return len(lines[ln - 1]) if 0 <= ln - 1 < len(lines) else 0

    i, n = 0, len(code)
    while i < n:
        ch = code[i]
        if ch == "{":
            # 反向找上一个 ; { } 或文件开头
            j = i - 1
            while j >= 0 and code[j] not in ";{}":
                j -= 1
            seg = code[j + 1:i]
            m = SIG.search(seg)
            if m and m.group("name") not in CONTROL:
                depth, mx, k, started = 0, 0, i, False
                while k < n:
                    if code[k] == "{":
                        depth += 1
                        started = True
                        mx = max(mx, depth)
                    elif code[k] == "}":
                        depth -= 1
                    if started and depth <= 0:
                        break
                    k += 1
                s_line, e_line = lineof(i), lineof(k)
                name_off = seg.rfind(m.group("name"))
                s_line = lineof(j + 1 + name_off - (name_off - seg.rfind(m.group("name"))))
                # 签名起点行：段内 signature 起点的行
                sig_start = j + 1 + (seg.rfind(m.group("name")))
                # 向前吃掉可能的返回类型（同行）
                res.append({"name": m.group("name"), "start": lineof(sig_start),
                            "end": e_line, "len": e_line - lineof(sig_start) + 1,
                            "depth": mx, "arrow": False})
                i = k + 1
                continue
        elif ch == "=" and i + 1 < n and code[i + 1] == ">":
            # 仅当同一语句段以 ; 结束且签名匹配时才算箭头函数
            j = i - 1
            while j >= 0 and code[j] not in ";{}":
                j -= 1
            seg = code[j + 1:i]
            m = SIG.search(seg)
            if m and m.group("name") not in CONTROL:
                k = code.find(";", i)
                k = n - 1 if k == -1 else k
                segline = lineof(seg and (j + 1) or i)
                res.append({"name": m.group("name"), "start": segline,
                            "end": lineof(k), "len": lineof(k) - segline + 1,
                            "depth": 0, "arrow": True})
                i = k + 1
                continue
            i += 2
            continue
        i += 1
    return res


def dart_files():
    out = []
    for dirpath, dirnames, filenames in os.walk(LIB):
        dirnames[:] = [d for d in dirnames if d != ".dart_tool"]
        for fn in sorted(filenames):
            if fn.endswith(".dart"):
                out.append(os.path.join(dirpath, fn))
    return out


def main():
    files = dart_files()
    sizes = {f: len(open(f, encoding="utf-8").read().split("\n")) for f in files}
    biz = [f for f in files if not f.startswith(THEME_DIR)]

    # ---- 函数 ----
    allf = []
    for f in files:
        for fn in funcs(f):
            fn["file"] = f
            allf.append(fn)
    allf.sort(key=lambda x: -x["len"])
    over80 = [x for x in allf if x["len"] > 80]

    # ---- 注释 ----
    def cjk_comments(paths):
        cnt, files_with = 0, 0
        for f in paths:
            _, comments = clean(open(f, encoding="utf-8").read())
            c = sum(1 for x in comments if CJK.search(x))
            cnt += c
            if c:
                files_with += 1
        return cnt, files_with

    biz_cjk, biz_files_with = cjk_comments(biz)
    all_cjk, _ = cjk_comments(files)

    doc_lines = 0
    for f in biz:
        for ln in open(f, encoding="utf-8"):
            if ln.strip().startswith("///"):
                doc_lines += 1

    # ---- 公开类 / part ----
    cls_per_file, public_cls = {}, []
    for f in files:
        text = open(f, encoding="utf-8").read()
        for c in re.findall(r"^class\s+(\w+)", text, re.M):
            cls_per_file.setdefault(f, []).append(c)
            if not c.startswith("_"):
                public_cls.append((f, c))
    multi = {f: v for f, v in cls_per_file.items() if len(v) > 1}
    parts = defaultdict(list)
    for f in files:
        text = open(f, encoding="utf-8").read()
        for stmt in re.findall(r"^part\s+(?:of\s+)?['\"]([^'\"]+)['\"]", text, re.M):
            parts[f].append(os.path.basename(stmt))

    # ---- 令牌 / 魔法值 ----
    def cnt(pattern, paths):
        rx = re.compile(pattern)
        return sum(len(rx.findall(open(f, encoding="utf-8").read())) for f in paths)

    metrics = {
        "files": len(files),
        "lines": sum(sizes.values()),
        "biz_lines": sum(sizes[f] for f in biz),
        "max_file": max(sizes.items(), key=lambda x: x[1]),
        "max_func": allf[0] if allf else None,
        "over80": [(x["name"], os.path.basename(x["file"]), x["len"]) for x in over80],
        "deepest": max(allf, key=lambda x: x["depth"]) if allf else None,
        "func_total": len(allf),
        "arrow_funcs": sum(1 for x in allf if x["arrow"]),
        "cjk_comment_biz": biz_cjk,
        "cjk_comment_all": all_cjk,
        "cjk_files_with": biz_files_with,
        "doc_lines": doc_lines,
        "naked_fontsize": cnt(r"fontSize:\s*[\d.]+", biz),
        "naked_edgeinsets": cnt(r"EdgeInsets\.(?:all|symmetric|only|fromLTRB)\(", biz),
        "circular8": cnt(r"BorderRadius\.circular\(8\)", biz),
        "circular99": cnt(r"BorderRadius\.circular\(99\)", biz),
        "hex_biz": cnt(r"0x[0-9a-fA-F]{8}", biz),
        "public_cls_total": len(public_cls),
        "multi_cls_files": {os.path.basename(f): v for f, v in multi.items()},
        "part_owners": {os.path.basename(f): v for f, v in parts.items()},
    }

    print("=" * 84)
    print("M4 Flutter APP · 第二轮独立探针（评审侧，口径严于 v1）")
    print("=" * 84)
    print(f"文件 {metrics['files']} 个 / {metrics['lines']} 行（业务 {metrics['biz_lines']} 行）")
    print(f"函数识别 {metrics['func_total']} 个，其中箭头体 {metrics['arrow_funcs']} 个")
    print("-" * 84)
    print("[1] 最长函数 Top 12")
    for x in allf[:12]:
        print(f"    {x['len']:>4} 行  深度{x['depth']}  {os.path.basename(x['file'])}:{x['name']}"
              f"{'  ()=>' if x['arrow'] else ''}")
    print(f"    >80 行函数：{len(over80)} 个")
    for n, f, L in metrics["over80"]:
        print(f"        {L:>4} 行  {f}:{n}")
    print("-" * 84)
    print("[2] 最长文件 Top 12")
    for f, L in sorted(sizes.items(), key=lambda x: -x[1])[:12]:
        print(f"    {L:>4} 行  {f}")
    print("-" * 84)
    print("[3] 注释")
    print(f"    业务代码中文注释 {biz_cjk} 处 / 覆盖 {biz_files_with} 个文件")
    print(f"    全库中文注释 {all_cjk} 处；业务代码 /// 行 {doc_lines}")
    print("-" * 84)
    print("[4] 令牌与魔法值（业务代码，排除 app/theme/）")
    print(f"    裸 fontSize {metrics['naked_fontsize']} 处 / 裸 EdgeInsets {metrics['naked_edgeinsets']} 处")
    print(f"    circular(8) {metrics['circular8']} / circular(99) {metrics['circular99']}"
          f" / 硬编码色值 {metrics['hex_biz']}")
    print("-" * 84)
    print(f"[5] 公开类 {metrics['public_cls_total']} 个；含 >1 类的文件 {len(multi)} 个")
    for f, v in sorted(multi.items(), key=lambda x: -len(x[1])):
        print(f"    {len(v)} 类  {f}  {v}")
    print("-" * 84)
    print(f"[6] part 文件：{sum(len(v) for v in parts.values())} 条 part 声明")
    for f, v in sorted(parts.items()):
        print(f"    {f}  ->  {v}")
    print("-" * 84)

    out = sys.argv[1] if len(sys.argv) > 1 else None
    if out:
        with open(out, "w", encoding="utf-8") as fh:
            json.dump(metrics, fh, ensure_ascii=False, indent=2)
        print(f"指标已写入 {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
