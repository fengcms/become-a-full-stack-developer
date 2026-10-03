#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
M4 Flutter APP 代码工艺门禁（评审侧附件）

用途：验证《M4-开发AI代码第一轮审阅报告》§5 整改清单的完成度。
用法：
    cd flutter-app
    /Users/fungleo/.workbuddy/binaries/python/envs/default/bin/python \
        ../docs/flutter-app/review/check_code_quality.py

退出码：0 = 全部通过；1 = 存在未通过项。

设计说明（为什么不用 grep 写断言）：
  1. macOS BSD grep 的 --exclude 与 --include 同时使用时不可靠；
  2. zsh 不对未加引号的变量做分词，`grep ... $FILES` 会把整串当成一个文件名；
  3. 注释统计必须排除字符串字面量里的 `//` 与中文（如 Text('首页')），grep 做不到。
  以上三点都实测踩过，故改为 Python 逐行解析。所有断言在交付前均已实测「当前会红」。
"""
import os
import re
import sys

LIB = "lib"
THEME_FILE = "app_theme.dart"

CJK = re.compile(r"[\u4e00-\u9fff]")


def dart_files():
    out = []
    for dirpath, dirnames, filenames in os.walk(LIB):
        dirnames[:] = [d for d in dirnames if d != ".dart_tool"]
        for fn in sorted(filenames):
            if fn.endswith(".dart"):
                out.append(os.path.join(dirpath, fn))
    return out


def split_comment(line):
    """返回 (代码部分, 注释部分)。字符串字面量内部不视为注释。"""
    i, n = 0, len(line)
    while i < n:
        c = line[i]
        if c in ('"', "'"):
            q = c
            if line[i:i + 3] in ('"""', "'''"):
                q = line[i:i + 3]
                j = line.find(q, i + 3)
                if j == -1:
                    return line, ""
                i = j + 3
                continue
            j = i + 1
            while j < n:
                if line[j] == "\\":
                    j += 2
                    continue
                if line[j] == q:
                    break
                j += 1
            i = j + 1
            continue
        if c == "/" and i + 1 < n and line[i + 1] == "/":
            return line[:i], line[i:]
        i += 1
    return line, ""


def strip_strings(line):
    """把字符串字面量替换为空格，用于大括号配对统计嵌套深度。"""
    code, comment = split_comment(line)
    out = []
    i, n = 0, len(code)
    while i < n:
        c = code[i]
        if c in ('"', "'"):
            q = c
            if code[i:i + 3] in ('"""', "'''"):
                q = code[i:i + 3]
                j = code.find(q, i + 3)
                if j == -1:
                    break
                out.append(" ")
                i = j + 3
                continue
            j = i + 1
            while j < n:
                if code[j] == "\\":
                    j += 2
                    continue
                if code[j] == q:
                    break
                j += 1
            out.append(" ")
            i = j + 1
            continue
        out.append(c)
        i += 1
    return "".join(out)


FUNC_RE = re.compile(
    r"^\s*(?:@\w+(?:\([^)]*\))?\s*)*"
    r"(?:static\s+|external\s+)?"
    r"(?:[\w<>,\[\]\?\.\s]+\s+)?"
    r"(?P<name>[a-zA-Z_]\w*)\s*"
    r"(?:<[^>]*>)?\s*\([^;]*?\)\s*"
    r"(?:async\s*\*?\s*|sync\s*\*?\s*)?"
    r"(?P<tail>\{)"
)
CONTROL = {"if", "for", "while", "switch", "catch", "else", "return", "try"}


def functions(path):
    """解析函数体起止（含最大嵌套深度）。"""
    lines = open(path, encoding="utf-8").read().split("\n")
    total, i, out = len(lines), 0, []
    while i < total:
        m = FUNC_RE.match(strip_strings(lines[i]))
        if m and m.group("name") not in CONTROL:
            start, depth, mx, j, started = i, 0, 0, i, False
            while j < total:
                for ch in strip_strings(lines[j]):
                    if ch == "{":
                        depth += 1
                        started = True
                        mx = max(mx, depth)
                    elif ch == "}":
                        depth -= 1
                if started and depth <= 0:
                    break
                j += 1
            out.append({
                "name": m.group("name"),
                "start": start + 1,
                "len": j - start + 1,
                "depth": mx,
            })
            i = j + 1
            continue
        i += 1
    return out


class Gate:
    def __init__(self):
        self.ok = 0
        self.failed = 0

    def check(self, label, passed, actual, expect):
        if passed:
            print(f"  PASS  {label}")
            self.ok += 1
        else:
            print(f"  FAIL  {label}   实际={actual}  期望={expect}")
            self.failed += 1


def main():
    files = dart_files()
    biz = [f for f in files if THEME_FILE not in f]

    # ---- 结构指标 ----
    line_counts = {f: sum(1 for _ in open(f, encoding="utf-8")) for f in files}
    max_file = max(line_counts.values())

    cjk_comment = 0
    for f in biz:
        for ln in open(f, encoding="utf-8"):
            _, comment = split_comment(ln.rstrip("\n"))
            if comment and CJK.search(comment):
                cjk_comment += 1

    def biz_count(pattern):
        rx = re.compile(pattern)
        return sum(len(rx.findall(open(f, encoding="utf-8").read())) for f in biz)

    naked_font = biz_count(r"fontSize:\s*[\d.]+")
    naked_edge = biz_count(r"EdgeInsets\.(?:all|symmetric|only|fromLTRB)\(")
    radius8 = biz_count(r"BorderRadius\.circular\(8\)")
    radius99 = biz_count(r"BorderRadius\.circular\(99\)")
    hex_color = biz_count(r"0x[0-9a-fA-F]{6,8}")

    # ---- 函数结构 ----
    all_funcs = []
    for f in files:
        for fn in functions(f):
            fn["file"] = f
            all_funcs.append(fn)
    longest = max(all_funcs, key=lambda x: x["len"]) if all_funcs else {"len": 0, "name": "-", "file": "-"}
    deepest = max(all_funcs, key=lambda x: x["depth"]) if all_funcs else {"depth": 0, "name": "-", "file": "-"}
    over80 = [x for x in all_funcs if x["len"] > 80]

    # ---- 文件粒度 ----
    multi_page = {}
    features_prefix = os.path.join(LIB, "features") + os.sep
    for f in files:
        if not f.startswith(features_prefix):
            continue
        text = open(f, encoding="utf-8").read()
        top = re.findall(r"^class (\w+) extends", text, re.M)
        public = [c for c in top if not c.startswith("_")]
        if len(public) > 1:
            multi_page[f] = public

    repo = "lib/features/repository.dart"
    repo_lines = line_counts.get(repo, 0)

    print("=" * 84)
    print("M4 Flutter APP 代码工艺门禁")
    print("=" * 84)
    print(f"  扫描 {len(files)} 个 Dart 文件 / {sum(line_counts.values())} 行")
    print("-" * 84)

    print("[A] 组件与函数抽离（P0-1 / P0-2）")
    g = Gate()
    g.check("最大函数 ≤ 80 行", longest["len"] <= 80,
            f'{longest["len"]} ({os.path.basename(longest["file"])}:{longest["name"]})', "≤80")
    g.check(">80 行函数数 = 0", len(over80) == 0, len(over80), "0")
    g.check("函数最大嵌套 ≤ 4 层", deepest["depth"] <= 4,
            f'{deepest["depth"]} ({os.path.basename(deepest["file"])}:{deepest["name"]})', "≤4")
    biggest = max(files, key=lambda x: line_counts[x])
    g.check("单文件 ≤ 400 行", max_file <= 400,
            f"{max_file} ({os.path.basename(biggest)})", "≤400")
    g.check("features 每文件公开 Widget 类 ≤ 1", not multi_page,
            "; ".join(f"{os.path.basename(k)}={len(v)}" for k, v in multi_page.items()) or "0", "0 个多类文件")

    print()
    print("[B] 中文注释（P0-2）")
    g.check("业务代码中文注释 ≥ 150 处", cjk_comment >= 150, cjk_comment, "≥150")

    print()
    print("[C] 设计令牌被消费（P1-1）")
    g.check("裸 fontSize ≤ 10 处", naked_font <= 10, naked_font, "≤10")
    g.check("裸 EdgeInsets ≤ 20 处", naked_edge <= 20, naked_edge, "≤20")
    g.check("无裸 BorderRadius.circular(8)", radius8 == 0, radius8, "0")
    g.check("无裸 BorderRadius.circular(99)", radius99 == 0, radius99, "0")
    g.check("业务代码无硬编码色值", hex_color == 0, hex_color, "0")

    print()
    print("[D] 公共逻辑抽离（P1-2 / P1-4）")
    g.check("repository.dart ≤ 300 行", repo_lines <= 300, repo_lines, "≤300")
    g.check("端点常量文件存在", os.path.exists("lib/core/network/endpoints.dart"),
            os.path.exists("lib/core/network/endpoints.dart"), True)

    print()
    print("-" * 84)
    print(f"结果：PASS={g.ok}  FAIL={g.failed}")
    if g.failed:
        print("存在未通过项 —— 整改未达标。")
    else:
        print("全部门禁通过 —— 达到审阅报告 §5.8 目标值。")
    return 1 if g.failed else 0


if __name__ == "__main__":
    sys.exit(main())
