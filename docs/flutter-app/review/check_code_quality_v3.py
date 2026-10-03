#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
M4 Flutter APP 代码工艺门禁 v3（评审侧）

== 为什么有 v3（诚实记录，第三代量程修正）==
v1 的盲区：逐行正则 → 多行签名 + 箭头体全部看不见。
v2 的盲区（本轮发现）：**命名参数组 `{...}` 本身是一对花括号**。
    `Future<dynamic> _request(\n  String path, {\n    ...\n  }) async {`
    从函数体的 `{` 回溯「上一个 `;{}`」时**停在参数组的 `}`**，
    seg 只剩 `) async ` → 无法解析 → **所有带命名参数且有函数体的方法整条漏掉**。
    实测后果：`api_client.dart` 里 v2 只认出 7 个函数，`request`(34行) 与
    `_request`(**119行**) 全部漏掉 → v2 报「最大函数 79 行」是**假绿**。
    （第二轮基线 `eda7860` 的真实读数：**11 个 >80 行函数，最大 196 行**，
      v2 与第二轮报告当时都只报 4 个。）

v3 的三处修正：
  1. **括号深度感知**：只有出现在 `pdepth == 0` 的 `{` 才可能是函数体；
     `pdepth > 0` 的 `{`（命名参数组 / 表达式内字面量）**不作语句边界**。
     → 语句边界（`;` `{` `}`）只在 `pdepth == 0` 时更新，seg 因此能覆盖完整签名。
  2. **箭头体终止符改为深度感知**：`=>` 后找 `;` 时须同时满足花括号深度 0 与括号深度 0，
     否则会被内层 lambda 的 `;` 提前截断（v2 会把 127 行 build 量成 76 行）。
  3. **嵌套改为「控制流嵌套」**：v1/v2 的 depth 是**花括号深度**，
     会把集合字面量 `{...}`、命名参数组算进去 → 系统性虚高、误伤。
     v3 只对 `if/for/while/switch/catch/try/else/do/finally` 的分支块计数。
  另：函数长度与嵌套的统计**排除 `lib/app/theme/`**（设计令牌 / `copyWith` 属配置型，
  机械拆分只会更差 —— 与中文注释指标的口径一致），超线者单独列为「配置型，不建议拆」。

用法：
    cd flutter-app
    python3 ../docs/flutter-app/review/check_code_quality_v3.py            # 验收
    python3 ../docs/flutter-app/review/check_code_quality_v3.py --selftest # 自检
退出码：0 = 全通过；1 = 存在未通过项。
"""
import os
import re
import shutil
import sys
import tempfile

CJK = re.compile(r"[\u4e00-\u9fff]")
CONTROL = {"if", "for", "while", "switch", "catch", "else", "try", "do",
           "return", "case", "default"}
CTRL_OPEN = re.compile(
    r"\b(?:if|for|while|switch|catch|try|else|do|finally)\b[^;{}]*$")
THEME_DIR = os.path.join("app", "theme") + os.sep
IMPORT_RE = re.compile(r"^\s*import\s+'([^']+)'", re.M)


# --------------------------------------------------------------------------
# 词法清洗
# --------------------------------------------------------------------------
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


def comments_of(text):
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
            i = j + len(q)
            continue
        if c == "/" and i + 1 < n and text[i + 1] == "/":
            j = text.find("\n", i)
            j = n if j == -1 else j
            out.append(text[i:j])
            i = j
            continue
        if c == "/" and i + 1 < n and text[i + 1] == "*":
            j = text.find("*/", i + 2)
            j = n if j == -1 else j + 2
            out.append(text[i:j])
            i = j
            continue
        i += 1
    return out


# --------------------------------------------------------------------------
# 函数枚举（括号深度感知）
# --------------------------------------------------------------------------
def name_before(seg):
    """取声明名；取不到返回 None（裸块 / 闭包 / 控制块）。"""
    s = seg.rstrip()
    for suf in ("async*", "sync*", "async", "sync"):
        if s.endswith(suf):
            s = s[:-len(suf)].rstrip()
            break
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


def ctrl_depth(code, s, e):
    """区间 [s,e] 内**控制流分支块**的最大嵌套（集合字面量 / 命名参数组不计）。"""
    stack, mx, i = [], 0, s
    while i <= e and i < len(code):
        c = code[i]
        if c == "{":
            j = i - 1
            while j >= s and code[j] not in ";{}":
                j -= 1
            stack.append(bool(CTRL_OPEN.search(code[j + 1:i])))
            mx = max(mx, sum(1 for x in stack if x))
        elif c == "}":
            if stack:
                stack.pop()
        i += 1
    return mx


def scan(text):
    """返回 [{name,start,end,len,depth,kind}]；name 为 None 表示裸块。"""
    code = clean(text)
    res, i, n = [], 0, len(code)
    pdepth, boundary = 0, 0

    def ln(p):
        return code.count("\n", 0, p) + 1

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
            if pdepth > 0:                      # 命名参数组 / 表达式内字面量
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
                boundary = i
                i += 1
                continue
            start = ln(boundary + 1 + seg.rfind(nm))
            res.append({"name": nm, "start": start, "end": ln(k),
                        "len": ln(k) - start + 1,
                        "depth": ctrl_depth(code, i, k), "kind": "block"})
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
                    start = ln(boundary + 1 + seg.rfind(nm))
                    res.append({"name": nm, "start": start, "end": ln(k),
                                "len": ln(k) - start + 1,
                                "depth": ctrl_depth(code, i, k), "kind": "arrow"})
                    boundary = k
                    i = k + 1
                    continue
            i += 1
            continue
        i += 1
    return res


# --------------------------------------------------------------------------
# 度量
# --------------------------------------------------------------------------
def dart_files(root):
    out = []
    for dp, dn, fn in os.walk(root):
        dn[:] = [d for d in dn if d != ".dart_tool"]
        for f in sorted(fn):
            if f.endswith(".dart"):
                out.append(os.path.join(dp, f))
    return out


def analyze(root="lib"):
    files = dart_files(root)
    text = {f: open(f, encoding="utf-8").read() for f in files}
    rel = {f: os.path.relpath(f, root) for f in files}
    biz = [f for f in files if not rel[f].startswith(THEME_DIR)]

    sizes = {f: text[f].count("\n") + 1 for f in files}
    allf, theme_f = [], []
    for f in files:
        bucket = allf if f in biz else theme_f
        for rec in scan(text[f]):
            rec["file"] = f
            bucket.append(rec)
    allf.sort(key=lambda x: -x["len"])

    def rc(pat, paths):
        rx = re.compile(pat)
        return sum(len(rx.findall(text[f])) for f in paths)

    m = {
        "files": len(files),
        "lines": sum(sizes.values()),
        "max_file": max(sizes.items(), key=lambda x: x[1]),
        "func_total": len(allf),
        "max_func": allf[0] if allf else None,
        "over80": [x for x in allf if x["len"] > 80],
        "max_depth": max((x["depth"] for x in allf), default=0),
        "deepest": max(allf, key=lambda x: x["depth"]) if allf else None,
        "theme_long": sorted([x for x in theme_f if x["len"] > 80],
                             key=lambda x: -x["len"]),
        "cjk": sum(1 for f in biz for c in comments_of(text[f]) if CJK.search(c)),
        "cjk_files": sum(1 for f in biz if any(CJK.search(c) for c in comments_of(text[f]))),
        "naked_font": rc(r"fontSize:\s*[\d.]+", biz),
        "naked_edge": rc(r"EdgeInsets\.(?:all|symmetric|only|fromLTRB)\(", biz),
        "r8": rc(r"BorderRadius\.circular\(8\)", biz),
        "r99": rc(r"BorderRadius\.circular\(99\)", biz),
        "hex": rc(r"Color\(\s*0x", biz),
        "repo_lines": sizes.get(os.path.join(root, "features", "repository.dart"), 0),
    }

    # 死代码：只含 export 的短文件，且**全工程（含 test/）无人 import**
    dead = []
    project_files = list(files)
    for extra in ("test", "integration_test", "test_driver"):
        if os.path.isdir(extra):
            project_files += dart_files(extra)
    importers = {}
    for f in project_files:
        body = text.get(f) or open(f, encoding="utf-8").read()
        for p in IMPORT_RE.findall(body):
            importers.setdefault(p.split("/")[-1], set()).add(f)
    for f in files:
        body = [ln for ln in text[f].split("\n")
                if ln.strip() and not ln.strip().startswith("//")]
        if body and all(ln.strip().startswith("export ") for ln in body) and len(body) <= 30:
            users = {u for u in importers.get(os.path.basename(f), set())
                     if os.path.abspath(u) != os.path.abspath(f)}
            if not users:
                dead.append(rel[f])
    m["dead_barrels"] = sorted(dead)

    # 常量集中度：缓存 key 命名空间 '/reader/...' 跨文件重复
    ns = {}
    for f in biz:
        lits = re.findall(r"'(/reader/[^']*)'", text[f])
        lits += [x + "/" for x in re.findall(r"'(/reader/[a-z]+)'\s*\+", text[f])]
        lits += re.findall(r"(/reader/[a-z/]*)/", text[f])
        for lit in lits:
            ns.setdefault(lit, set()).add(rel[f])
    m["reader_ns_files"] = {k: sorted(v) for k, v in ns.items() if len(v) > 1}

    ep = os.path.join(root, "core", "network", "endpoints.dart")
    m["endpoints_exists"] = os.path.exists(ep)
    m["endpoints_consts"] = (len(re.findall(r"static const", text[ep]))
                             if os.path.exists(ep) else 0)
    ac = os.path.join(root, "core", "network", "api_client.dart")
    m["api_client_raw_prefix"] = (rc(r"'(/(?:auth|files|view)[^']*)'", [ac])
                                  if os.path.exists(ac) else 0)
    return m


# --------------------------------------------------------------------------
# 断言
# --------------------------------------------------------------------------
def assertions(m):
    out = []

    def add(label, actual, expect, ok):
        out.append({"label": label, "actual": actual, "expect": expect, "ok": bool(ok)})

    mf = m["max_func"]
    add("最大函数 ≤ 80 行（非主题代码）",
        f'{mf["len"]} ({os.path.basename(mf["file"])}:{mf["name"]})',
        "≤80", mf["len"] <= 80)
    add(">80 行函数数 = 0（非主题代码）", len(m["over80"]), "0", not m["over80"])
    add("控制流最大嵌套 ≤ 4 层",
        f'{m["max_depth"]} ({os.path.basename(m["deepest"]["file"])}:'
        f'{m["deepest"]["name"]})', "≤4", m["max_depth"] <= 4)
    add("单文件 ≤ 400 行", f'{m["max_file"][1]} ({os.path.basename(m["max_file"][0])})',
        "≤400", m["max_file"][1] <= 400)
    add("业务代码中文注释 ≥ 150 处", m["cjk"], "≥150", m["cjk"] >= 150)
    add("裸 fontSize ≤ 10 处", m["naked_font"], "≤10", m["naked_font"] <= 10)
    add("裸 EdgeInsets ≤ 20 处", m["naked_edge"], "≤20", m["naked_edge"] <= 20)
    add("无裸 BorderRadius.circular(8)", m["r8"], "0", m["r8"] == 0)
    add("无裸 BorderRadius.circular(99)", m["r99"], "0", m["r99"] == 0)
    add("业务代码无硬编码色值", m["hex"], "0", m["hex"] == 0)
    add("repository.dart ≤ 300 行", m["repo_lines"], "≤300", 0 < m["repo_lines"] <= 300)
    add("端点常量文件存在且 ≥25 常量", f'{m["endpoints_exists"]}/{m["endpoints_consts"]}',
        "True/≥25", m["endpoints_exists"] and m["endpoints_consts"] >= 25)
    add("api_client 无裸路径前缀字面量", m["api_client_raw_prefix"], "0",
        m["api_client_raw_prefix"] == 0)
    add("缓存 key 命名空间不跨文件重复", "; ".join(m["reader_ns_files"]) or "0",
        "0 组", not m["reader_ns_files"])
    add("无零引用桶文件", "; ".join(m["dead_barrels"]) or "0", "0 个",
        not m["dead_barrels"])
    return out


def run(root="lib", title="M4 Flutter APP 代码工艺门禁 v3", verbose=True):
    m = analyze(root)
    res = assertions(m)
    ok = sum(1 for r in res if r["ok"])
    bad = len(res) - ok
    if verbose:
        print("=" * 88)
        print(title)
        print("=" * 88)
        print(f'  {m["files"]} 个文件 / {m["lines"]} 行 / 识别函数 {m["func_total"]} 个'
              f'（含命名参数函数）')
        print("-" * 88)
        for r in res:
            print(f'  PASS  {r["label"]}' if r["ok"] else
                  f'  FAIL  {r["label"]:<34} 实际={r["actual"]}  期望={r["expect"]}')
        print("-" * 88)
        if m["over80"]:
            print("  >80 行函数明细（非主题代码）：")
            for x in m["over80"]:
                print(f'      {x["len"]:>4} 行  控制流嵌套{x["depth"]:>2}  [{x["kind"]:>5}]  '
                      f'{os.path.relpath(x["file"], root)}:{x["name"]}  '
                      f'L{x["start"]}-{x["end"]}')
            print("-" * 88)
        if m["theme_long"]:
            print("  主题目录超线函数（配置型，不建议拆，仅登记）：")
            for x in m["theme_long"]:
                print(f'      {x["len"]:>4} 行  {os.path.relpath(x["file"], root)}:{x["name"]}')
            print("-" * 88)
        print(f"结果：PASS={ok}  FAIL={bad}")
        print("全部门禁通过。" if not bad else "存在未通过项 —— 未达标。")
    return bad


def selftest():
    """注入缺陷，验证每条断言真的会红。

    夹具必须**越过阈值**才叫证明；且必须包含 v2 量不到的形态：
    **带命名参数的长函数**与**箭头体长函数**。
    """
    root = tempfile.mkdtemp(prefix="cq-v3-selftest-")
    lib = os.path.join(root, "lib")
    for sub in ("features", "core/network", "core/cache", "app/theme"):
        os.makedirs(os.path.join(lib, sub), exist_ok=True)

    # ① repository > 300 行
    with open(os.path.join(lib, "features", "repository.dart"), "w") as fh:
        fh.write("class R {\n" + "".join(f"  int x{i} = {i};\n" for i in range(305)) + "}\n")
    # ② 端点常量 5 个（< 25）
    with open(os.path.join(lib, "core", "network", "endpoints.dart"), "w") as fh:
        fh.write("abstract final class Endpoints {\n" +
                 "".join(f"  static const e{i} = '/e{i}';\n" for i in range(5)) + "}\n")
    # ③ api_client 裸路径前缀
    with open(os.path.join(lib, "core", "network", "api_client.dart"), "w") as fh:
        fh.write("bool keep(String p) => p.startsWith('/auth/') || p.endsWith('/view');\n")
    # ④ 箭头体 150 行 build，且文件 > 400 行
    body = "\n".join(f"      Text('line {i}')," for i in range(145))
    padding = "\n".join(f"// pad {i}" for i in range(300))
    with open(os.path.join(lib, "features", "arrow.dart"), "w") as fh:
        fh.write("import 'package:flutter/material.dart';\n"
                 "class A extends StatelessWidget {\n  @override\n"
                 "  Widget build(BuildContext c) => Column(children: [\n"
                 f"{body}\n      ]);\n}}\n{padding}\n")
    # ⑤ **带命名参数**的多行长函数（v2 完全看不见的形态）
    with open(os.path.join(lib, "core", "cache", "named.dart"), "w") as fh:
        fh.write("Future<void> fetch(\n  String key, {\n    bool a = false,\n"
                 "    bool b = false,\n  }) async {\n"
                 + "\n".join(f"  final v{i} = {i};" for i in range(90)) + "\n}\n")
    # ⑥ 控制流嵌套 6 层
    with open(os.path.join(lib, "core", "cache", "deep.dart"), "w") as fh:
        fh.write("void w(int k) {\n"
                 + "".join("  " * (i + 1) + f"if (k > {i}) {{\n" for i in range(6))
                 + "".join("  " * (6 - i) + "}\n" for i in range(6)) + "}\n")
    # ⑦ 裸令牌 / 硬编码色值 / 中文注释全缺（阈值型必须越线）
    with open(os.path.join(lib, "features", "naked.dart"), "w") as fh:
        fh.write("import 'package:flutter/material.dart';\n"
                 + "".join(f"const t{i} = TextStyle(fontSize: {14 + i % 3},"
                           " color: Color(0xFF123456));\n" for i in range(12))
                 + "".join(f"const p{i} = EdgeInsets.all({i + 1});\n" for i in range(22))
                 + "const r = BorderRadius.circular(8);\n"
                 + "const r2 = BorderRadius.circular(99);\n")
    # ⑧ 跨文件重复的缓存 key 命名空间
    for i in (1, 2):
        with open(os.path.join(lib, "features", f"ns{i}.dart"), "w") as fh:
            fh.write(f"const k{i} = '/reader/article/' + '{i}';\n")
    # ⑨ 零引用桶文件
    with open(os.path.join(lib, "features", "barrel.dart"), "w") as fh:
        fh.write("export 'arrow.dart';\n")
    # ⑩ 主题目录里的超线函数：**不应**把长度断言判红（口径验证）
    with open(os.path.join(lib, "app", "theme", "app_colors.dart"), "w") as fh:
        fh.write("class C {\n  C copyWith({\n"
                 + "".join(f"    int? p{i},\n" for i in range(90))
                 + "  }) {\n" + "\n".join(f"    final q{i} = {i};" for i in range(80))
                 + "\n  }\n}\n")

    m = analyze(lib)
    res = assertions(m)
    print("=" * 88)
    print("自检：注入缺陷（阈值型已越线，含命名参数与箭头体两种 v2 盲区形态）")
    print("=" * 88)
    not_red = [r for r in res if r["ok"]]
    for r in res:
        print(f'  {"🔴 未拦住" if r["ok"] else "✅ 拦住"}  {r["label"]:<34} 实际={r["actual"]}')

    # 附加口径验证：必须真看见命名参数长函数、且主题目录不计入
    named_seen = any(x["name"] == "fetch" and x["len"] > 80 for x in m["over80"])
    theme_excluded = all(not os.path.relpath(x["file"], lib).startswith(THEME_DIR)
                         for x in m["over80"])
    print("-" * 88)
    print(f'  命名参数长函数被看见：{"✅" if named_seen else "🔴 否"}'
          f'   主题目录已排除：{"✅" if theme_excluded else "🔴 否"}')
    shutil.rmtree(root, ignore_errors=True)
    print("-" * 88)
    bad = len(not_red) + (0 if named_seen and theme_excluded else 1)
    print(f"应红而未红：{len(not_red)} 条"
          + ("" if bad else "  —— 全部断言均能在真实缺陷上转红"))
    return 1 if bad else 0


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        sys.exit(selftest())
    sys.exit(1 if run() else 0)
