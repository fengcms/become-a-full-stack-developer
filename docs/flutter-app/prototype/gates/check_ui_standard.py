#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
门禁 6/6 · UI 组件标准一致性（07-UI组件标准.md）

守什么
------
`07-UI组件标准.md` 为了「改色只改 06 一处」而选择**不写任何色值**，只引用 `06` 的令牌名。
这个选择能成立的前提是：**引用的名字必须真实存在**。本门禁就是那条前提的机器化。

检查项
------
A. 07 全文不含裸色值（#hex / rgb() / rgba() / hsl()）——否则「不重复色值」是假话
B. 07 引用的令牌名（color./space./radius./type./shadow./duration./border.）必须存在于 06
C. 07 引用的 Flutter 成员（AppColors./AppSpacing./AppRadius./AppType./AppDuration.）必须存在于 app_theme.dart
D. 07 引用的原型选择器（反引号内以 . 开头）必须存在于原型 CSS
E. 原型里的前向引用（`07-UI组件标准 §N`）必须能在 07 里找到对应章节
F. 原型侧的静态一致性：令牌有定义也要有消费方；动效不得裸写时长；已删图标不得残留

豁免
----
`§12 差异登记` **豁免 B 项**：该节按定义会点名「06 里没有的令牌」（如 `color.skeleton`），
把它一并扫会误报。其余章节一律在扫描范围内——这正是 B 项能发现漂移的原因。

用法
----
python3 check_ui_standard.py             # 正式检查
python3 check_ui_standard.py --selftest  # 注入缺陷，证明断言非空转
退出码：0 全绿 / 1 有失败 / 2 输入缺失
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROTO_DIR = HERE.parent
APP_DIR = PROTO_DIR.parent

DOC_07 = APP_DIR / "07-UI组件标准.md"
DOC_06 = APP_DIR / "06-UI设计规范与设计令牌.md"
PROTO = PROTO_DIR / "02-高保真可交互原型.html"
DART = PROTO_DIR / "app_theme.dart"

TOKEN_KINDS = ("color", "space", "radius", "type", "shadow", "duration", "border")
FLUTTER_CLASSES = ("AppColors", "AppSpacing", "AppRadius", "AppType", "AppDuration")


# ---------------------------------------------------------------------------
# 提取
# ---------------------------------------------------------------------------

def read(p: Path) -> str:
    return p.read_text(encoding="utf-8")


def tokens_in_06(text: str) -> set[str]:
    """06 里定义过的令牌名。只认反引号包裹的，避免把正文里的普通词当令牌。"""
    return set(re.findall(
        r"`((?:" + "|".join(TOKEN_KINDS) + r")\.[A-Za-z0-9._]+)`", text))


def tokens_in_doc(text: str) -> set[str]:
    """文档里引用的令牌名（可以不在反引号里，正文行内也允许）。"""
    return set(re.findall(
        r"\b((?:" + "|".join(TOKEN_KINDS) + r")\.[A-Za-z0-9._]+)", text))


def sections(doc: str) -> list[tuple[str, str]]:
    """按 '## N. 标题' 切分，返回 [(编号, 正文), ...]。编号取 '12' 这种字符串。"""
    out: list[tuple[str, str]] = []
    for chunk in re.split(r"(?m)^##\s+", doc)[1:]:
        m = re.match(r"(\d+)\.", chunk)
        out.append((m.group(1) if m else "", chunk))
    return out


def app_theme_members(dart: str) -> dict[str, set[str]]:
    """从 app_theme.dart 里取各令牌类的成员名。"""
    members: dict[str, set[str]] = {}

    # AppColors 字段：final Color xxx;
    members["AppColors"] = set(re.findall(r"final\s+Color\s+(\w+)\s*;", dart))
    # AppColors 的方法：Color xxx(...) { 或 getter
    members["AppColors"] |= set(re.findall(r"\bColor\s+(\w+)\s*\(", dart))

    # 普通类：abstract final class X { ... }
    for cls in ("AppSpacing", "AppRadius", "AppType", "AppDuration", "AppLayout"):
        m = re.search(r"class\s+" + cls + r"\b[^{]*\{(.*?)\n\}", dart, re.S)
        if m:
            body = m.group(1)
            names = set(re.findall(r"static\s+const\s+(?:double|Duration|Curve|BorderRadius)\s+(\w+)", body))
            names |= set(re.findall(r"static\s+\w[\w<>, ]*\s+(\w+)\s*\(", body))
            members[cls] = names
        else:
            members[cls] = set()

    # 顶层类名（ArticleStatusView / ApiErrorView）
    members["_classes"] = set(re.findall(r"\bclass\s+(\w+)", dart))
    return members


def selectors_in_doc(doc: str) -> set[str]:
    """反引号内以 . 开头的选择器，取空格前的第一段。"""
    found: set[str] = set()
    for span in re.findall(r"`([^`]+)`", doc):
        for piece in span.split("/"):
            piece = piece.strip()
            if not piece.startswith("."):
                continue
            first = piece.split()[0]
            # 去掉标注性后缀，如 `.cell（min-height 52px）`
            first = re.split(r"[（(，,。]", first)[0].strip()
            if re.fullmatch(r"\.[A-Za-z][\w-]*(?:\.[A-Za-z][\w-]*)*", first):
                found.add(first)
    return found


# ---------------------------------------------------------------------------
# 检查
# ---------------------------------------------------------------------------

def check(doc: str, doc06: str, proto: str, dart: str) -> tuple[list[str], list[str]]:
    """返回 (失败列表, 通过列表)。"""
    fails: list[str] = []
    oks: list[str] = []

    known_tokens = tokens_in_06(doc06)
    members = app_theme_members(dart)
    secs = sections(doc)
    sec_map = {n: body for n, body in secs}
    # §12 豁免令牌存在性检查（它按定义会点名 06 里没有的令牌）
    scoped = "\n".join(body for n, body in secs if n != "12")

    # ---- A. 裸色值 ----
    hexes = re.findall(r"#[0-9A-Fa-f]{3,8}\b", doc)
    funcs = re.findall(r"\b(?:rgba?|hsla?)\s*\(", doc)
    if hexes or funcs:
        fails.append(
            "A 07 出现裸色值（违反「不重复色值」）："
            + ", ".join(sorted(set(hexes + [f + "(...)" for f in funcs]))[:6]))
    else:
        oks.append("A 07 全文零裸色值（不重复 06 的任何色值）")

    # ---- B. 令牌名必须真实存在（§12 豁免）----
    used = tokens_in_doc(scoped)
    ghost = sorted(t for t in used if t not in known_tokens)
    if ghost:
        fails.append("B 07 引用了 06 里不存在的令牌名：" + ", ".join(ghost[:8]))
    else:
        oks.append(f"B 07 引用的 {len(used)} 个令牌名全部存在于 06")

    # ---- C. Flutter 成员必须真实存在 ----
    bad_members: list[str] = []
    for cls, member in re.findall(
            r"\b(" + "|".join(FLUTTER_CLASSES) + r")\.(\w+)", doc):
        pool = members.get(cls, set())
        if member not in pool:
            bad_members.append(f"{cls}.{member}")
    # 另外校验文档里提到的类名本身存在
    for cls in re.findall(r"\b(ArticleStatusView|ApiErrorView)\b", doc):
        if cls not in members.get("_classes", set()):
            bad_members.append(cls)
    if bad_members:
        fails.append("C 07 引用了 app_theme.dart 里不存在的成员："
                     + ", ".join(sorted(set(bad_members))[:8]))
    else:
        oks.append("C 07 引用的 AppColors / App* 成员全部存在于 app_theme.dart")

    # ---- D. 原型选择器必须真实存在 ----
    sels = selectors_in_doc(doc)
    # 精确子串判断：选择器后必须紧跟 { 空格 , : 或 .（就是 CSS 里的实际出现形态）
    ghost_sel = sorted(s for s in sels if (s + "{") not in proto and (s + " ") not in proto
                       and (s + ",") not in proto and (s + ":") not in proto
                       and (s + ".") not in proto)
    if ghost_sel:
        fails.append("D 07 引用了原型里不存在的选择器：" + ", ".join(ghost_sel[:8]))
    else:
        oks.append(f"D 07 引用的 {len(sels)} 个原型选择器全部真实存在")

    # ---- E. 原型 → 07 的前向引用必须解析得到 ----
    refs = sorted(set(re.findall(r"07-UI组件标准\s*§\s*(\d+)", proto)))
    unresolved = [r for r in refs if r not in sec_map]
    if unresolved:
        fails.append("E 原型引用了 07 里不存在的章节：§" + ", §".join(unresolved))
    else:
        oks.append("E 原型里的 07 前向引用全部可解析（§" + ", §".join(refs) + "）")

    # ---- F. 原型侧静态一致性 ----
    proto_problems: list[str] = []

    # F1 令牌有定义，且定义位置符合它的主题作用域
    #     · theme-dependent 令牌（取值随主题变）→ light / dark 各一份
    #     · theme-independent 令牌（时长、曲线）→ 只在 :root 一份
    def block(sel: str) -> str:
        m = re.search(re.escape(sel) + r"\s*\{(.*?)\}", proto, re.S)
        return m.group(1) if m else ""

    root_block = block(":root")
    light_block = block('html[data-theme="light"]')
    dark_block = block('html[data-theme="dark"]')

    for var in ("--line-button",):
        if var not in light_block:
            proto_problems.append(f"{var} 未在浅色主题定义")
        if var not in dark_block:
            proto_problems.append(f"{var} 未在深色主题定义")

    for var in ("--dur-fast", "--dur-base", "--dur-page"):
        if var not in root_block:
            proto_problems.append(f"{var} 未在 :root 定义（时长与主题无关，应只定义一次）")
        if var in light_block or var in dark_block:
            proto_problems.append(f"{var} 在主题块里重复定义（会增加两处不同步的风险）")

    # F2 令牌有消费方（定义了没人用 = 假令牌）
    for var in ("--line-button", "--dur-fast", "--dur-base", "--dur-page"):
        if not re.search(r"var\(\s*" + re.escape(var) + r"\s*\)", proto):
            proto_problems.append(f"{var} 已定义但无消费方")

    # F3 次级按钮确实用了 line-button
    if not re.search(r"\.b\.sec\{[^}]*var\(--line-button\)", proto):
        proto_problems.append(".b.sec 未使用 color.line.button 边界")

    # F4 动效不得裸写时长（去掉 var(...) 后不应该再出现时间字面量）
    bodies = re.findall(r"transition\s*:\s*([^;{}]+)", proto)
    for b in bodies:
        stripped = re.sub(r"var\([^)]*\)", "", b)
        bare = re.findall(r"\b\d*\.?\d+(?:ms|s)\b", stripped)
        if bare:
            proto_problems.append(f"transition 裸写时长 {bare}（应走 duration 令牌）：{b.strip()[:48]}")

    # F5 已删图标不得残留
    if "i-check2" in proto:
        proto_problems.append("i-check2 已无引用但符号仍残留")

    # F6 单选项不得再放子元素（Grid 双行溢出回归探测器）
    if re.search(r'class="radio[^"]*"[^>]*>\s*<\s*(?:svg|use)', proto):
        proto_problems.append("单选项内又出现了子元素（Grid 双行溢出回归）")

    if proto_problems:
        fails.extend("F " + p for p in proto_problems)
    else:
        oks.append("F 原型侧：令牌均有定义与消费方 · 动效已令牌化 · 无死图标 · 单选单指示器")

    return fails, oks


# ---------------------------------------------------------------------------
# 自测：注入缺陷，证明断言真的会红
# ---------------------------------------------------------------------------

def selftest(doc: str, doc06: str, proto: str, dart: str) -> int:
    print("── 注入自测：每条断言都必须能被触发 ──")
    cases: list[tuple[str, tuple[str, str, str, str], str]] = [
        ("A 裸色值",
         (doc + "\n\n这是一段注入：底 #FF00AA，阴影 rgba(1,2,3,.5)\n", doc06, proto, dart), "A"),
        ("B 幽灵令牌",
         (doc.replace("## 3. 按钮", "## 3. 按钮\n\n注入 `color.notExist.ghost` 与 `space.99`。", 1),
          doc06, proto, dart), "B"),
        ("C 幽灵成员",
         (doc.replace("## 3. 按钮", "## 3. 按钮\n\n注入 `AppColors.noSuchField`。", 1),
          doc06, proto, dart), "C"),
        ("D 幽灵选择器",
         (doc.replace("## 3. 按钮", "## 3. 按钮\n\n注入 `.no-such-selector`。", 1),
          doc06, proto, dart), "D"),
        ("E 断链前向引用",
         (doc, doc06, proto.replace("07-UI组件标准 §4", "07-UI组件标准 §77", 1), dart), "E"),
        ("F 令牌无消费方",
         (doc, doc06, proto.replace("var(--line-button)", "var(--line-strong)"), dart), "F"),
        ("F4 动效裸时长",
         (doc, doc06, proto.replace("transition:var(--dur-base); z-index:40;}",
                                    "transition:.2s; z-index:40;}", 1), dart), "F"),
    ]

    caught = 0
    for label, args, code in cases:
        f, _ = check(*args)
        hit = [x for x in f if x.startswith(code)]
        if hit:
            caught += 1
            print(f"  PASS  注入「{label}」→ 报出：{hit[0][:78]}")
        else:
            print(f"  FAIL  注入「{label}」没有报出任何 {code} 项（断言空转！）")

    ok = caught == len(cases)
    print(f"\n自测{'通过' if ok else '未通过'}：{caught}/{len(cases)} 条注入被告出")
    return 0 if ok else 1


# ---------------------------------------------------------------------------

def main() -> int:
    for p in (DOC_07, DOC_06, PROTO, DART):
        if not p.exists():
            print(f"输入缺失：{p}", file=sys.stderr)
            return 2

    doc, doc06, proto, dart = (read(DOC_07), read(DOC_06), read(PROTO), read(DART))

    if "--selftest" in sys.argv:
        rc = selftest(doc, doc06, proto, dart)
        if rc:
            return rc
        print()
        # 自测通过后再跑一遍正式检查，保证结论与注入用的同一套代码

    fails, oks = check(doc, doc06, proto, dart)
    for o in oks:
        print("  PASS  " + o)
    for f in fails:
        print("  FAIL  " + f)

    if fails:
        print(f"\n[UI 组件标准] 通过 {len(oks)} 项，失败 {len(fails)} 项")
        print("结论：07 与 06 / app_theme.dart / 原型之间存在漂移 ❌")
        return 1

    print(f"\n[UI 组件标准] 全部 {len(oks)} 项通过")
    print("结论：07 零裸色值，引用的令牌名 / Flutter 成员 / 选择器全部真实存在，"
          "原型前向引用可解析，令牌均有定义与消费方 ✅")
    return 0


if __name__ == "__main__":
    sys.exit(main())
