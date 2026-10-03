#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
M4 Flutter APP 代码工艺门禁「量程复核」探针（评审侧，第三轮）

== 为什么有这一版（诚实记录）==
v2（check_code_quality_v2.py）修掉了 v1 的「多行签名 / 箭头体」盲区，但**仍有第三代盲区**：
    **命名参数组 `{...}` 本身是一对花括号。**
    `Future<dynamic> _request(\n  String path, {\n    ...\n  }) async {`
    从 body 的 `{` 回溯到「上一个 `;{}`」时，**停在了参数组的 `}`**，
    于是 seg 只剩 `) async ` → 无法解析 → 该函数**整条不进枚举**。
受影响面：**所有带命名参数且有函数体的方法**（`foo({required int a}) { ... }`）。
实测：`api_client.dart` 里 v2 只认出 7 个函数，`request`(34行) 与 `_request`(**119行**) 全部漏掉
→ v2 报「最大函数 79 行」是**假绿**。

== 本探针的口径 ==
1. **括号深度感知**：只有出现在 `pdepth == 0` 的 `{` 才可能是函数体；
   出现在 `pdepth > 0` 的 `{` 是命名参数组或表达式内字面量，**不作语句边界**。
2. 语句边界（`;` `{` `}`）只在 `pdepth == 0` 时更新 → seg 能覆盖完整签名（含命名参数组）。
3. 函数名判定**不用签名正则**：seg 去尾 async 后须以 `)` 结尾，取其配对 `(` 前的标识符；
   另外单独兜底 **getter/setter** 与 **operator 重载**。
4. 无名块（闭包/控制块）**只记录不消费**，用于单独观察「字段初始化里的厚闭包」。

用法：cd flutter-app && python3 ../docs/flutter-app/review/check_code_r3_wide.py
退出码：0 = 本口径下 0 个 >80 行；1 = 存在 >80 行。
"""
import os
import re
import sys

CONTROL = {"if", "for", "while", "switch", "catch", "else", "try", "do",
           "return", "case", "default"}
TYPE_KW = re.compile(r"\b(?:class|enum|mixin|extension|typedef)\b")


def clean(text):
    """注释与字符串字面量置空（保留换行以维持行号）。"""
    out, i, n = [], 0, len(text)
    while i < n:
        c = text[i]
        if c in ('"', "'"):
            q = text[i:i + 3] if text[i:i + 3] in ('"""', "'''") else c
            j = i + len(q)
            while j < n:
                if len(q) == 1 and text[j] == "\\":
                    j += 2
                    continue
                if text[j:j + len(q)] == q:
                    break
                j += 1
            seg = text[i:j + len(q)]
            out.append("".join("\n" if ch == "\n" else " " for ch in seg))
            i = j + len(q)
            continue
        if c == "/" and i + 1 < n and text[i + 1] == "/":
            j = text.find("\n", i)
            j = n if j == -1 else j
            out.append(" " * (j - i))
            i = j
            continue
        if c == "/" and i + 1 < n and text[i + 1] == "*":
            j = text.find("*/", i + 2)
            j = n if j == -1 else j + 2
            seg = text[i:j]
            out.append("".join("\n" if ch == "\n" else " " for ch in seg))
            i = j
            continue
        out.append(c)
        i += 1
    return "".join(out)


def name_before(seg):
    """取声明名；取不到返回 None（= 裸块/闭包/控制块）。"""
    s = seg.rstrip()
    for suf in ("async*", "sync*", "async", "sync"):
        if s.endswith(suf):
            s = s[:-len(suf)].rstrip()
            break

    # 无参 getter：`Widget get foo`
    m = re.search(r"\b(?:get|set)\s+([A-Za-z_]\w*)\s*$", s)
    if m and not s.endswith(")"):
        return None if m.group(1) in CONTROL else m.group(1)

    if not s.endswith(")"):
        return None
    depth, i = 0, len(s) - 1
    while i >= 0:
        if s[i] == ")":
            depth += 1
        elif s[i] == "(":
            depth -= 1
            if depth == 0:
                break
        i -= 1
    if i < 0:
        return None
    j = i - 1
    while j >= 0 and s[j] in " \t\n":
        j -= 1
    head = s[:j + 1]
    m = re.search(r"([A-Za-z_]\w*)$", head)
    if m:
        return None if m.group(1) in CONTROL else m.group(1)
    m2 = re.search(r"\boperator\s*(\S+)\s*$", head)
    if m2:
        return "operator" + m2.group(1)
    m3 = re.search(r"\bset\s+([A-Za-z_]\w*)\s*$", head)
    return m3.group(1) if m3 else None


def line_of(code, p):
    return code.count("\n", 0, p) + 1


def scan(code):
    """括号深度感知的枚举。返回 [{name,start,end,len,depth,kind}]，name 可为 None。"""
    res, i, n = [], 0, len(code)
    pdepth = 0
    boundary = 0            # 最近一次 **pdepth==0** 的 `;` `{` `}` 的下标

    def ln(p):
        return line_of(code, p)

    while i < n:
        c = code[i]
        if c == "(":
            pdepth += 1
            i += 1
            continue
        if c == ")":
            pdepth = max(0, pdepth - 1)
            i += 1
            continue
        if c == "{":
            if pdepth > 0:                 # 命名参数组 / 表达式内字面量
                i += 1
                continue
            seg = code[boundary + 1:i]
            nm = name_before(seg)
            d = mx = 0
            k, started = i, False
            while k < n:
                if code[k] == "{":
                    d += 1
                    started = True
                    mx = max(mx, d)
                elif code[k] == "}":
                    d -= 1
                if started and d <= 0:
                    break
                k += 1
            if nm is None:
                if not TYPE_KW.search(seg):
                    res.append({"name": None, "start": ln(boundary + 1),
                                "end": ln(k), "len": ln(k) - ln(boundary + 1) + 1,
                                "depth": mx, "kind": "bare"})
                boundary = i
                i += 1
                continue
            res.append({"name": nm, "start": ln(boundary + 1 + seg.rfind(nm)),
                        "end": ln(k), "len": ln(k) - ln(boundary + 1 + seg.rfind(nm)) + 1,
                        "depth": mx, "kind": "block"})
            boundary = k
            i = k + 1
            continue
        if c == "}":
            if pdepth == 0:
                boundary = i
            i += 1
            continue
        if c == ";":
            if pdepth == 0:
                boundary = i
            i += 1
            continue
        if c == "=" and i + 1 < n and code[i + 1] == ">":
            if pdepth == 0:
                seg = code[boundary + 1:i]
                nm = name_before(seg)
                if nm:
                    k, bd, pd = i + 2, 0, 0
                    while k < n:
                        ch = code[k]
                        if ch == "(":
                            pd += 1
                        elif ch == ")":
                            pd = max(0, pd - 1)
                        elif ch == "{":
                            bd += 1
                        elif ch == "}":
                            bd -= 1
                        elif ch == ";" and bd == 0 and pd == 0:
                            break
                        k += 1
                    k = min(k, n - 1)
                    res.append({"name": nm,
                                "start": ln(boundary + 1 + seg.rfind(nm)),
                                "end": ln(k),
                                "len": ln(k) - ln(boundary + 1 + seg.rfind(nm)) + 1,
                                "depth": 0, "kind": "arrow"})
                    boundary = k
                    i = k + 1
                    continue
            i += 1
            continue
        i += 1
    return res


def dart_files(root):
    out = []
    for dp, dn, fn in os.walk(root):
        dn[:] = [d for d in dn if d != ".dart_tool"]
        for f in sorted(fn):
            if f.endswith(".dart"):
                out.append(os.path.join(dp, f))
    return out


def main():
    root = "lib"
    files = dart_files(root)
    text = {f: open(f, encoding="utf-8").read() for f in files}
    sizes = {f: text[f].count("\n") + 1 for f in files}

    named, bare = [], []
    for f in files:
        for rec in scan(clean(text[f])):
            rec["file"] = f
            (bare if rec["name"] is None else named).append(rec)

    over80 = sorted([x for x in named if x["len"] > 80], key=lambda x: -x["len"])
    print("=" * 88)
    print("第三轮 · 门禁量程复核（括号深度感知口径）")
    print("=" * 88)
    print(f"  文件 {len(files)} 个 / 物理行合计 {sum(sizes.values())}")
    print(f"  识别函数 {len(named)} 个（其中 >80 行 {len(over80)} 个）")
    print("-" * 88)
    if over80:
        print("  🔴 >80 行函数：")
        for x in over80:
            print(f'      {x["len"]:>4} 行  深度{x["depth"]:>2}  [{x["kind"]:>5}]  '
                  f'{x["file"].replace("lib/", "")}:{x["name"]}  L{x["start"]}-{x["end"]}')
    else:
        print("  ✅ 无 >80 行函数")
    print("-" * 88)
    print("  最大函数 TOP 12：")
    for x in sorted(named, key=lambda x: -x["len"])[:12]:
        print(f'      {x["len"]:>4} 行  深度{x["depth"]:>2}  [{x["kind"]:>5}]  '
              f'{x["file"].replace("lib/", "")}:{x["name"]}  L{x["start"]}-{x["end"]}')

    bigbare = sorted([b for b in bare if b["len"] >= 40], key=lambda x: -x["len"])
    print("-" * 88)
    print(f"  无名块 ≥40 行（闭包/控制块，仅结构观察）：{len(bigbare)} 个")
    for b in bigbare[:12]:
        print(f'      {b["len"]:>4} 行  深度{b["depth"]:>2}  '
              f'{b["file"].replace("lib/", "")}  L{b["start"]}-{b["end"]}')

    print("-" * 88)
    print(f"  最大文件 {max(sizes.values())} 行 · 最大函数 "
          f'{max(x["len"] for x in named)} 行 · 最大嵌套 {max(x["depth"] for x in named)} 层')
    print("=" * 88)
    return 1 if over80 else 0


if __name__ == "__main__":
    sys.exit(main())
