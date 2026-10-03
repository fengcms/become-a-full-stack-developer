#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
M4 Flutter APP 代码工艺门禁 v2 的「量程复核」宽网探针（评审侧，第三轮）

动机：v2 的签名正则 SIG 要求 seg **以 `^` 或 `;{}` 起头**、且以 `名字(...)` 结尾。
这带来一个新的盲区（第二轮作者已主动披露）：
    命名 record 返回类型 —— `({Widget a, Widget b}) _profile() { ... }`
其 seg 以 `(` 开头，`^` 处匹配失败、seg 内又无 `;{}` → **整个函数不进枚举**。
若这样的函数恰好很长，v2 就会「假绿」。

本探针**不使用任何签名正则**来判定「是不是函数」：
  · 枚举全文每一个 `{`，回溯到上一个 `;{}` 得到 seg；
  · seg 去掉尾部 async 修饰后必须以 `)` 结尾，且该 `)` 的配对 `(` 之前是标识符 → 取该标识符为名；
  · 名字不在控制关键字表内 → 记为候选函数，用括号配对算块长度。
  这样只要「长得像声明块」就会被量到，命名 record / getter / 复杂返回类型一律覆盖。
另对 `=>` 箭头体做同样处理。

输出：
  ① 两侧（strict=v2 口径 / wide=本探针）的函数数与 >80 行明细；
  ② **strict 漏掉而 wide 看见的函数**（按长度降序）—— 这是盲区的量化；
  ③ 60~80 行的观察名单（未超线但接近）。

用法：cd flutter-app && python3 ../docs/flutter-app/review/check_code_r3_wide.py
退出码：0 = 宽网口径下也 0 个 >80 行；1 = 存在 >80 行。
"""
import os
import re
import sys

CONTROL = {"if", "for", "while", "switch", "catch", "else", "try", "do",
           "return", "case", "default"}

# ---- v2 的严格签名正则（原样搬运，仅用于对照） ----
STRICT_SIG = re.compile(
    r"(?:^|[;{}])\s*"
    r"(?:@[\w.]+(?:\((?:[^()]|\([^()]*\))*\))?\s*)*"
    r"(?:static\s+|abstract\s+|external\s+)*"
    r"(?:[\w<>,\[\]\?\.]+\s+)?"
    r"(?P<name>[A-Za-z_]\w*)\s*"
    r"(?:<[^<>]*>)?\s*"
    r"\((?:[^()]|\([^()]*\))*\)\s*"
    r"(?:async\s*\*?\s*|sync\s*\*?\s*)?$"
)


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
    """取声明名。三条路，层层兜底：

    ① 普通/命名 record/getter-带参 → seg 去尾 async 后以 `)` 结尾，取配对 `(` 前的标识符；
    ② **operator 重载** → `operator ==(Object other)`，`(` 前是 `==` 不是标识符；
    ③ **getter / setter** → `Widget get foo` / `set foo(v)`，seg 不以 `)` 结尾或以 `)` 结尾但取不到名。

    不依赖「返回类型」长什么样 —— 这正是为了覆盖命名 record。
    """
    s = seg.rstrip()
    for suf in ("async*", "sync*", "async", "sync"):
        if s.endswith(suf):
            s = s[:-len(suf)].rstrip()
            break

    # ③ getter / setter（无参 getter：seg 以标识符结尾）
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
    if not m:
        # ② operator 重载
        m2 = re.search(r"\boperator\s*(\S+)\s*$", head)
        if m2:
            return "operator" + m2.group(1)
        # setter 带参：`set foo(v)`
        m3 = re.search(r"\bset\s+([A-Za-z_]\w*)\s*$", head)
        if m3:
            return m3.group(1)
        return None
    nm = m.group(1)
    return None if nm in CONTROL else nm


def line_of(code, p):
    return code.count("\n", 0, p) + 1


def scan_wide(raw):
    """返回 [(name, start_line, end_line, depth, kind)]，不含任何签名正则。"""
    code = clean(raw)
    res, i, n = [], 0, len(code)
    while i < n:
        ch = code[i]
        if ch == "{":
            j = i - 1
            while j >= 0 and code[j] not in ";{}":
                j -= 1
            seg = code[j + 1:i]
            nm = name_before(seg)
            if nm:
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
                res.append((nm, line_of(code, j + 1 + seg.rfind(nm)),
                            line_of(code, k), mx, "block"))
                i = k + 1
                continue
        elif ch == "=" and i + 1 < n and code[i + 1] == ">":
            j = i - 1
            while j >= 0 and code[j] not in ";{}":
                j -= 1
            seg = code[j + 1:i]
            nm = name_before(seg)
            if nm:
                k = code.find(";", i)
                k = n - 1 if k == -1 else k
                res.append((nm, line_of(code, j + 1 + seg.rfind(nm)),
                            line_of(code, k), 0, "arrow"))
                i = k + 1
                continue
            i += 2
            continue
        i += 1
    return res


def scan_strict(raw):
    """复刻 v2 的口径，用于对照。"""
    code = clean(raw)
    res, i, n = [], 0, len(code)
    while i < n:
        ch = code[i]
        kind = None
        if ch == "{":
            kind = "block"
        elif ch == "=" and i + 1 < n and code[i + 1] == ">":
            kind = "arrow"
        if kind:
            j = i - 1
            while j >= 0 and code[j] not in ";{}":
                j -= 1
            seg = code[j + 1:i]
            m = STRICT_SIG.search(seg)
            if m and m.group("name") not in CONTROL:
                if kind == "block":
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
                else:
                    k = code.find(";", i)
                    k = n - 1 if k == -1 else k
                    mx = 0
                res.append((m.group("name"),
                            line_of(code, j + 1 + seg.rfind(m.group("name"))),
                            line_of(code, k), mx, kind))
                i = k + 1
                continue
            i += 2 if kind == "arrow" else 1
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

    wide, strict_keys = [], set()
    for f in files:
        for nm, s, e, d, kind in scan_wide(text[f]):
            wide.append({"file": f, "name": nm, "s": s, "e": e,
                         "len": e - s + 1, "depth": d, "kind": kind})
        for nm, s, e, d, kind in scan_strict(text[f]):
            strict_keys.add((f, nm, s))

    sizes = {f: text[f].count("\n") + 1 for f in files}
    print("=" * 84)
    print("第三轮 · 门禁量程复核（宽网探针 vs v2 严格口径）")
    print("=" * 84)
    print(f"  文件 {len(files)} 个 / 物理行合计 {sum(sizes.values())}")
    print(f"  v2 严格口径识别函数 {len(strict_keys)} 个")
    print(f"  宽网口径识别函数 {len(wide)} 个")

    # 盲区：widest 看见、strict 没看见
    missed = [w for w in wide if (w["file"], w["name"], w["s"]) not in strict_keys]
    print(f"  ⚠️ strict 漏识别（宽网多出）{len(missed)} 个")

    over80 = sorted([w for w in wide if w["len"] > 80], key=lambda x: -x["len"])
    print("-" * 84)
    print(f"  宽网口径 >80 行函数：{len(over80)} 个")
    for w in over80:
        print(f'      {w["len"]:>4} 行  深度{w["depth"]:>2}  [{w["kind"]}]  '
              f'{w["file"].replace("lib/", "")}:{w["name"]}  L{w["s"]}-{w["e"]}')

    print("-" * 84)
    print("  strict 漏识别清单（按长度降序，前 25）")
    for w in sorted(missed, key=lambda x: -x["len"])[:25]:
        print(f'      {w["len"]:>4} 行  深度{w["depth"]:>2}  [{w["kind"]}]  '
              f'{w["file"].replace("lib/", "")}:{w["name"]}  L{w["s"]}-{w["e"]}')

    watch = sorted([w for w in wide if 60 <= w["len"] <= 80], key=lambda x: -x["len"])
    print("-" * 84)
    print(f"  观察名单 60~80 行：{len(watch)} 个（未超线）")
    for w in watch[:15]:
        print(f'      {w["len"]:>4} 行  深度{w["depth"]:>2}  [{w["kind"]}]  '
              f'{w["file"].replace("lib/", "")}:{w["name"]}')

    print("-" * 84)
    print(f"  最大文件：{max(sizes.values())} 行 "
          f"({max(sizes.items(), key=lambda x: x[1])[0].replace('lib/', '')})")
    print(f"  宽网最大函数：{over80[0]['len'] if over80 else max(w['len'] for w in wide)} 行")
    print(f"  最大嵌套：{max(w['depth'] for w in wide)} 层")
    print("=" * 84)
    return 1 if over80 else 0


if __name__ == "__main__":
    sys.exit(main())
