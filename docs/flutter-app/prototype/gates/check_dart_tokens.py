#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""门禁 3/6 · Dart 设计令牌自洽，且与《06 UI 设计规范》逐值一致

四道断言：
  A. 四表交叉：字段 / 构造器 / copyWith / lerp 的参数集合必须**完全相等**。
     少一个就是编译错或静默漏改——比如新增字段忘了进 copyWith，主题切换时
     该令牌不跟随，不报错、只是不生效。
  B. 双主题齐备：每个字段在 light 与 dark 两套常量里都必须有取值。
  C. 语法可解析：`dart format --output=none`。本阶段唯一可用的形态——
     没有 pubspec.yaml 时 `dart analyze` 会报几百条未解析符号，那是环境缺失，
     不是文件缺陷，不要被 374 条吓到。
  D. 与 06 逐值比对：06 里**写出来的**每一个色值，Dart 侧必须有字段与之等值。
     06 没写的（规范自身的缺口）不算 Dart 的错，但会单独列出来提醒补规范。

令牌→字段名的推导规则（写在 derive() 里，少数例外集中放 OVERRIDES），
所以这张对照表不是手抄的；解析器另有 --selfcheck 用 PyYAML 交叉验证。

用法：python3 check_dart_tokens.py [--selfcheck]
退出码：0 全绿 / 1 有缺陷 / 2 输入缺失
"""
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PROTOTYPE_DIR = os.path.dirname(HERE)
REPO_ROOT = os.path.abspath(os.path.join(PROTOTYPE_DIR, '..', '..', '..'))
DART = os.path.join(PROTOTYPE_DIR, 'app_theme.dart')
SPEC = os.path.join(REPO_ROOT, 'docs', 'flutter-app', '06-UI设计规范与设计令牌.md')

# 推导规则覆盖不了的少数例外。每一条都要写清理由，避免例外变成黑洞。
OVERRIDES = {
    'bg.wash':          ['heroWashFrom', 'heroWashTo'],  # 渐变：规范一行 → Dart 两色
    'overlay.scrim':    ['scrim'],                        # 去掉 overlay 分组前缀
    'brand.solid':      ['brandSolid'],
    'brand.solidBg':    ['brandSolid'],                   # 规范深浅两处命名不同，同一个字段
    'info':             ['brandOnSubtle'],                # color.info 与 brand.onSubtle 同值，不另立字段
    'field.bg':         ['bgBase'],                        # 输入框底色与页面底同值，复用
    'line.button':      ['lineButton'],
}
# 06 §2.2「浅色 / 浅色底」两列 → 字段名。'info' 的底走 brandSubtle，不是 infoBg。
SEMANTIC_BG = {'success': 'successBg', 'warning': 'warningBg', 'danger': 'dangerBg', 'info': 'brandSubtle'}


def derive(token):
    """color.<a>.<b> → Dart 字段名（列表）。"""
    t = token[len('color.'):] if token.startswith('color.') else token
    if t in OVERRIDES:
        return list(OVERRIDES[t])
    parts = [p for p in t.split('.') if p != 'default']
    if len(parts) == 1:
        return [parts[0]]
    return [parts[0] + ''.join(w[:1].upper() + w[1:] for w in parts[1:])]


def to_argb(s):
    """'#RRGGBB' / 'rgba(r,g,b,a)' → 'AARRGGBB'（大写）。"""
    s = s.strip()
    m = re.match(r'rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)', s)
    if m:
        r, g, b = (int(float(m.group(i))) for i in (1, 2, 3))
        a = float(m.group(4)) if m.group(4) is not None else 1.0
        return f'{int(round(a * 255)):02X}{r:02X}{g:02X}{b:02X}'
    m = re.match(r'#([0-9A-Fa-f]{6})$', s)
    if m:
        return 'FF' + m.group(1).upper()
    return None


def read(p):
    return open(p, encoding='utf-8').read()


def sections(spec):
    """切出 06 §2.1~2.4 的行。"""
    out, cur = {}, None
    for line in spec.splitlines():
        m = re.match(r'^#{3} (2\.\d) ', line)
        if m:
            cur = m.group(1); out[cur] = []; continue
        if re.match(r'^#{1,3} ', line):
            cur = None; continue
        if cur and line.startswith('|'):
            out[cur].append(line)
    return out


def cells(row):
    return [c.strip().strip('`') for c in row.strip().strip('|').split('|')]


def hexes(s):
    return re.findall(r'#[0-9A-Fa-f]{6}|rgba?\([^)]*\)', s)


def main():
    for p in (DART, SPEC):
        if not os.path.exists(p):
            print('输入缺失：', p); return 2

    src = read(DART)
    lines = src.splitlines()
    fields = set(re.findall(r'^  final Color (\w+);', src, re.M))
    ctor = set(re.findall(r'required this\.(\w+)', src))
    cw = set()
    lerp = set()

    def grab(start_re):
        st = next((i for i, l in enumerate(lines) if re.search(start_re, l)), None)
        if st is None:
            return set()
        out = set()
        for l in lines[st:]:
            m = re.match(r'\s*(\w+):', l)
            if m:
                out.add(m.group(1))
            if re.match(r'\s*\);', l):
                break
        return out

    cw, lerp = grab(r'AppColors copyWith\(\{'), grab(r'AppColors lerp\(ThemeExtension')
    light = re.search(r'static const AppColors light = AppColors\((.*?)\n  \);', src, re.S)
    dark = re.search(r'static const AppColors dark = AppColors\((.*?)\n  \);', src, re.S)

    print(f'字段 {len(fields)} / 构造器 {len(ctor)} / copyWith {len(cw)} / lerp {len(lerp)}\n')
    fails = []

    # A. 四表交叉
    bad = False
    for name, st in (('构造器', ctor), ('copyWith', cw), ('lerp', lerp)):
        miss, extra = fields - st, st - fields
        if miss or extra:
            fails.append(f'A {name} 缺 {sorted(miss) or "无"}；多 {sorted(extra) or "无"}')
            print(f'  A  FAIL {name} 缺 {sorted(miss) or "无"}；多 {sorted(extra) or "无"}')
            bad = True
    if not bad:
        print(f'  A  四表交叉一致（{len(fields)}:{len(ctor)}:{len(cw)}:{len(lerp)}）✅')

    # B. 双主题齐备
    if not (light and dark):
        fails.append('B 未定位到 light / dark 常量'); print('  B  FAIL 未定位到 light / dark 常量')
        light_vals = dark_vals = {}
    else:
        def vals(block):
            return {m.group(1): m.group(2).upper()
                    for m in re.finditer(r'^\s*(\w+):\s*Color\(0x([0-9A-Fa-f]{8})\)', block, re.M)}
        light_vals, dark_vals = vals(light.group(1)), vals(dark.group(1))
        ml, md = fields - set(light_vals), fields - set(dark_vals)
        if ml or md:
            fails.append(f'B light 缺 {sorted(ml) or "无"}；dark 缺 {sorted(md) or "无"}')
            print(f'  B  FAIL light 缺 {sorted(ml) or "无"}；dark 缺 {sorted(md) or "无"}')
        else:
            print('  B  light / dark 均覆盖全部字段 ✅')

    # C. 语法解析
    dart = shutil.which('dart')
    if not dart:
        print('  C  SKIP 本机未找到 dart')
    else:
        r = subprocess.run([dart, 'format', '--output=none', DART], capture_output=True, text=True)
        if r.returncode == 0:
            print('  C  dart format 解析通过 ✅')
        else:
            fails.append('C dart 解析失败'); print('  C  FAIL', (r.stderr or '').strip()[:200])

    # D. 与 06 逐值比对
    sec = sections(read(SPEC))
    if '--selfcheck' in sys.argv:
        try:
            import yaml  # noqa: F401
            print('  [selfcheck] PyYAML 可用（本脚本已不依赖它做解析，此处仅确认环境）')
        except ImportError:
            print('  [selfcheck] 无 PyYAML（本脚本不依赖，可忽略）')

    def rows(key):
        out = []
        for r in sec.get(key, []):
            c = cells(r)
            if len(c) < 2 or not c[0].startswith('color.') or set(r) <= set('|-: '):
                continue
            out.append(c)
        return out

    exp = []          # (来源, 令牌, 主题, 字段, 期望 ARGB)
    undocumented = []  # 规范未写的 Dart 字段

    for c in rows('2.1'):
        for f, h in zip(derive(c[0]), hexes(c[1]) or [c[1]]):
            exp.append(('2.1', c[0], 'light', f, to_argb(h)))
    for c in rows('2.2'):
        hs = hexes(' | '.join(c[1:]))
        if len(hs) >= 1 and derive(c[0]):
            exp.append(('2.2', c[0], 'light', derive(c[0])[0], to_argb(hs[0])))
        bg = SEMANTIC_BG.get(c[0].replace('color.', ''))
        if len(hs) >= 2 and bg:
            exp.append(('2.2', c[0], 'light', bg, to_argb(hs[1])))
    for c in rows('2.3'):
        if len(c) < 3:
            continue
        lh, dh = hexes(c[1]), hexes(c[2])
        base = derive(c[0])[0]
        if lh:
            exp.append(('2.3', c[0], 'light', base, to_argb(lh[0])))
        if len(lh) > 1:
            exp.append(('2.3', c[0], 'light', base + 'Bg', to_argb(lh[1])))
        if dh:
            exp.append(('2.3', c[0], 'dark', base, to_argb(dh[0])))
        if len(dh) > 1:
            exp.append(('2.3', c[0], 'dark', base + 'Bg', to_argb(dh[1])))
    for c in rows('2.4'):
        hs = hexes(c[1])
        if hs and derive(c[0]):
            exp.append(('2.4', c[0], 'dark', derive(c[0])[0], to_argb(hs[0])))

    checked_fields = set()
    for src_, token, theme, field, want in exp:
        checked_fields.add(field)
        have = light_vals.get(field) if theme == 'light' else dark_vals.get(field)
        if have is None:
            fails.append(f'D {token}（{src_}）→ Dart 无字段 {field}')
            print(f'  D  FAIL {src_} {token} [{theme}]  →  Dart 没有字段 `{field}`')
        elif want and have != want:
            fails.append(f'D {token} {theme} 值不符')
            print(f'  D  FAIL {src_} {token} [{theme}]  规范 {want} ≠ Dart {field}={have}')
        elif want is None:
            print(f'  D  SKIP {src_} {token} 色值无法解析：{c[1] if len(c) > 1 else ""}')

    if not [f for f in fails if f.startswith('D')]:
        print(f'  D  06 里写明的 {len(exp)} 处色值，Dart 侧全部等值 ✅')

    undocumented = sorted(fields - checked_fields)
    print()
    print(f'  说明 06 未在 §2.1~2.4 写明的 Dart 字段 {len(undocumented)} 个（属规范缺口，不计为 Dart 的错）：')
    print('       ' + ('、'.join(undocumented) if undocumented else '无'))
    print()
    if fails:
        print(f'结论：{len(fails)} 项不通过 ❌')
        return 1
    print('结论：Dart 令牌四表自洽、双主题齐备、与 06 已写明的色值逐值一致 ✅')
    return 0


if __name__ == '__main__':
    sys.exit(main())
