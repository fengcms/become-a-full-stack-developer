#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
M4 Flutter APP 代码工艺门禁 v2（评审侧）

为什么有 v2 —— 诚实记录：
  v1（check_code_quality.py）的函数解析器是**逐行正则**，只能识别
  `Type name(args) {` 这种单行签名形态。它有两个盲区：
    ① 多行签名（参数换行）——`Future<dynamic> _fetch(` 换到下一行才 `)`，v1 完全看不到；
    ② 箭头表达式体 ——`Widget build(BuildContext c) => PageFrame(...)`，v1 一律不计长度。
  而 Flutter 里最长的函数**恰恰最爱写成箭头体**。后果：
    第一轮报告「>80 行函数 8 个」是低估（真实 13 个）；
    第二轮作者复跑 v1 得 PASS=13/FAIL=0，但真实仍有 4 个 >80 行函数。
  → 结论：**v1 的量程不足以支撑「>80 行函数 = 0」这条断言**，本轮修正解析器并补断言。

v2 相对 v1 的变化：
  1. 解析器改为「从 `{` / `=>` 反向回溯到上一个分隔符」，多行签名与箭头体一并计入；
  2. 注释口径改为排除**整个** `lib/app/theme/` 目录（v1 只排除 app_theme.dart 一个文件）；
  3. 新增 [E] 分组：死代码（零引用桶文件）与常量集中度（缓存 key 前缀跨文件重复）；
  4. 新增 `--selftest`：注入 7 类缺陷，逐条验证断言**真的会红**（防恒绿/恒真）。

用法：
    cd flutter-app
    python3 ../docs/flutter-app/review/check_code_quality_v2.py            # 验收
    python3 ../docs/flutter-app/review/check_code_quality_v2.py --selftest # 自检

退出码：0 = 全部通过；1 = 存在未通过项。
"""
import os
import re
import shutil
import sys
import tempfile

CJK = re.compile(r"[\u4e00-\u9fff]")
CONTROL = {"if", "for", "while", "switch", "catch", "else", "try", "do"}


# --------------------------------------------------------------------------
# 词法清洗
# --------------------------------------------------------------------------
def clean(text):
    """返回 code：注释与字符串字面量都置空，行结构保留。"""
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


SIG = re.compile(
    r"(?:^|[;{}])\s*"
    r"(?:@[\w.]+(?:\((?:[^()]|\([^()]*\))*\))?\s*)*"
    r"(?:static\s+|abstract\s+|external\s+)*"
    r"(?:[\w<>,\[\]\?\.]+\s+)?"
    r"(?P<name>[A-Za-z_]\w*)\s*"
    r"(?:<[^<>]*>)?\s*"
    r"\((?:[^()]|\([^()]*\))*\)\s*"
    r"(?:async\s*\*?\s*|sync\s*\*?\s*)?$"
)


def funcs(text):
    """多行签名 + 箭头体都能识别。返回 (name, startLine, endLine, depth)。"""
    code = clean(text)
    res, i, n = [], 0, len(code)

    def ln(p):
        return code.count("\n", 0, p) + 1

    while i < n:
        ch = code[i]
        if ch == "{":
            j = i - 1
            while j >= 0 and code[j] not in ";{}":
                j -= 1
            seg = code[j + 1:i]
            m = SIG.search(seg)
            if m and m.group("name") not in CONTROL:
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
                res.append((m.group("name"),
                            ln(j + 1 + seg.rfind(m.group("name"))), ln(k), mx))
                i = k + 1
                continue
        elif ch == "=" and i + 1 < n and code[i + 1] == ">":
            j = i - 1
            while j >= 0 and code[j] not in ";{}":
                j -= 1
            seg = code[j + 1:i]
            m = SIG.search(seg)
            if m and m.group("name") not in CONTROL:
                k = code.find(";", i)
                k = n - 1 if k == -1 else k
                s = ln(j + 1 + seg.rfind(m.group("name")))
                res.append((m.group("name"), s, ln(k), 0))
                i = k + 1
                continue
            i += 2
            continue
        i += 1
    return res


# --------------------------------------------------------------------------
# 度量
# --------------------------------------------------------------------------
THEME_DIR = os.path.join("app", "theme") + os.sep
IMPORT_RE = re.compile(r"^\s*import\s+'([^']+)'", re.M)


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
    allf = []
    for f in files:
        for nm, s, e, d in funcs(text[f]):
            allf.append({"name": nm, "file": f, "len": e - s + 1, "depth": d})
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
        "cjk": sum(1 for f in biz for c in comments_of(text[f]) if CJK.search(c)),
        "cjk_files": sum(1 for f in biz if any(CJK.search(c) for c in comments_of(text[f]))),
        "naked_font": rc(r"fontSize:\s*[\d.]+", biz),
        "naked_edge": rc(r"EdgeInsets\.(?:all|symmetric|only|fromLTRB)\(", biz),
        "r8": rc(r"BorderRadius\.circular\(8\)", biz),
        "r99": rc(r"BorderRadius\.circular\(99\)", biz),
        "hex": rc(r"0x[0-9a-fA-F]{8}", biz),
        "repo_lines": sizes.get(os.path.join(root, "features", "repository.dart"), 0),
    }

    # 死代码：只含 export 的短文件，且**全工程**（含 test/）无人 import
    # 注意：只看 lib/ 会把「仅被测试引用的桶文件」误判为死代码。
    dead = []
    project_files = list(files)
    for extra in ("test", "integration_test", "test_driver"):
        if os.path.isdir(extra):
            project_files += dart_files(extra)
    importers = {}
    for f in project_files:
        for p in IMPORT_RE.findall(text.get(f) or open(f, encoding="utf-8").read()):
            importers.setdefault(p.split("/")[-1], set()).add(f)
    for f in files:
        body = [ln for ln in text[f].split("\n")
                if ln.strip() and not ln.strip().startswith("//")]
        if body and all(ln.strip().startswith("export ") for ln in body) and len(body) <= 30:
            base = os.path.basename(f)
            users = {u for u in importers.get(base, set()) if os.path.abspath(u) != os.path.abspath(f)}
            if not users:
                dead.append(os.path.relpath(f, root))
    m["dead_barrels"] = sorted(dead)

    # 常量集中度：缓存 key 命名空间 '/reader/...' 跨文件重复
    ns = {}
    for f in biz:
        lits = re.findall(r"'(/reader/[^']*)'", text[f])
        lits += [x + "/" for x in re.findall(r"'(/reader/[a-z]+)'\s*\+", text[f])]
        lits += re.findall(r"(/reader/[a-z/]*)/", text[f])
        for lit in lits:
            ns.setdefault(lit, set()).add(os.path.relpath(f, root))
    m["reader_ns_files"] = {k: sorted(v) for k, v in ns.items() if len(v) > 1}

    # 端点集中度：endpoints.dart 的常量数 + api_client 里的裸路径前缀
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
    add("最大函数 ≤ 80 行（含箭头体）", f'{mf["len"]} ({os.path.basename(mf["file"])}:{mf["name"]})',
        "≤80", mf["len"] <= 80)
    add(">80 行函数数 = 0", len(m["over80"]), "0", not m["over80"])
    add("函数最大嵌套 ≤ 4 层", f'{m["max_depth"]} ({os.path.basename(m["deepest"]["file"])}:'
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
    add("无零引用桶文件", "; ".join(m["dead_barrels"]) or "0",
        "0 个", not m["dead_barrels"])
    return out


def run(root="lib", title="M4 Flutter APP 代码工艺门禁 v2", verbose=True):
    m = analyze(root)
    res = assertions(m)
    ok = sum(1 for r in res if r["ok"])
    bad = len(res) - ok
    if verbose:
        print("=" * 84)
        print(title)
        print("=" * 84)
        print(f"  {m['files']} 个文件 / {m['lines']} 行 / 识别函数 {m['func_total']} 个")
        print("-" * 84)
        for r in res:
            print(f'  {"PASS" if r["ok"] else "FAIL"}  {r["label"]:<34}'
                  f' 实际={r["actual"]}  期望={r["expect"]}' if not r["ok"]
                  else f'  PASS  {r["label"]}')
        print("-" * 84)
        if m["over80"]:
            print("  >80 行函数明细：")
            for x in m["over80"]:
                print(f'      {x["len"]:>4} 行  深度{x["depth"]:>2}  '
                      f'{os.path.basename(x["file"])}:{x["name"]}')
            print("-" * 84)
        print(f"结果：PASS={ok}  FAIL={bad}")
        print("全部门禁通过。" if not bad else "存在未通过项 —— 未达标。")
    return bad


def selftest():
    """注入缺陷，验证每条断言真的会红。

    要点：阈值型断言（如「裸 fontSize ≤ 10」）的夹具必须**越过阈值**才叫证明。
    只注入 1 处而阈值是 10，红了也说明不了断言有效 —— 那是夹具太温和。
    """
    root = tempfile.mkdtemp(prefix="cq-v2-selftest-")
    lib = os.path.join(root, "lib")
    os.makedirs(os.path.join(lib, "features"), exist_ok=True)
    os.makedirs(os.path.join(lib, "core", "network"), exist_ok=True)
    os.makedirs(os.path.join(lib, "core", "cache"), exist_ok=True)

    # ① repository > 300 行
    with open(os.path.join(lib, "features", "repository.dart"), "w") as fh:
        fh.write("class R {\n" + "".join(f"  int x{i} = {i};\n" for i in range(305)) + "}\n")
    # ② 端点常量 5 个（< 25，触发「已收敛」断言）
    with open(os.path.join(lib, "core", "network", "endpoints.dart"), "w") as fh:
        fh.write("abstract final class Endpoints {\n" +
                 "".join(f"  static const e{i} = '/e{i}';\n" for i in range(5)) + "}\n")
    # ③ api_client 裸路径前缀
    with open(os.path.join(lib, "core", "network", "api_client.dart"), "w") as fh:
        fh.write("bool keep(String p) => p.startsWith('/auth/') || p.endsWith('/view');\n")
    # ④ 箭头体 150 行 build + 文件 > 400 行
    body = "\n".join(f"      Text('line {i}')," for i in range(145))
    padding = "\n".join(f"// pad {i}" for i in range(300))
    with open(os.path.join(lib, "features", "arrow.dart"), "w") as fh:
        fh.write("import 'package:flutter/material.dart';\n"
                 "class A extends StatelessWidget {\n"
                 "  @override\n"
                 "  Widget build(BuildContext c) => Column(children: [\n"
                 f"{body}\n      ]);\n}}\n"
                 f"{padding}\n")
    # ⑤ 多行签名 + 深嵌套
    with open(os.path.join(lib, "core", "cache", "deep.dart"), "w") as fh:
        fh.write("Future<void> fetch(\n  String key,\n  int policy,\n) async {\n"
                 + "".join("  " * (i + 1) + f"if (key.length > {i}) {{\n" for i in range(5))
                 + "".join("  " * (5 - i) + "}\n" for i in range(5)) + "}\n")
    # ⑥ 裸令牌 / 硬编码色值 / 中文注释全缺（裸值必须越过阈值）
    with open(os.path.join(lib, "features", "naked.dart"), "w") as fh:
        fh.write("import 'package:flutter/material.dart';\n"
                 + "".join(f"const t{i} = TextStyle(fontSize: {14 + i % 3},"
                           " color: Color(0xFF123456));\n" for i in range(12))
                 + "".join(f"const p{i} = EdgeInsets.all({i + 1});\n" for i in range(22))
                 + "const r = BorderRadius.circular(8);\n"
                 + "const r2 = BorderRadius.circular(99);\n")
    # ⑦ 跨文件重复的缓存 key 命名空间
    for i in (1, 2):
        with open(os.path.join(lib, "features", f"ns{i}.dart"), "w") as fh:
            fh.write(f"const k{i} = '/reader/article/' + '{i}';\n")
    # ⑧ 零引用桶文件
    with open(os.path.join(lib, "features", "barrel.dart"), "w") as fh:
        fh.write("export 'arrow.dart';\n")

    m = analyze(lib)
    res = assertions(m)
    print("=" * 84)
    print("自检：注入 8 类缺陷（阈值型已越过阈值），逐条验证断言会红")
    print("=" * 84)
    not_red = [r for r in res if r["ok"]]
    for r in res:
        mark = "🔴 未拦住" if r["ok"] else "✅ 拦住"
        print(f'  {mark}  {r["label"]:<34} 实际={r["actual"]}')
    shutil.rmtree(root, ignore_errors=True)
    print("-" * 84)
    print(f"应红而未红：{len(not_red)} 条"
          + ("" if not_red else "  —— 全部断言均能在真实缺陷上转红"))
    return 1 if not_red else 0


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        sys.exit(selftest())
    sys.exit(1 if run() else 0)
