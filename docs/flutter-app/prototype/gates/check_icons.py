# -*- coding: utf-8 -*-
"""门禁 4/6 · 图标几何
零第三方依赖。对原型全部 <symbol> 里的 path 做几何健全性检查。

为什么需要它：设置图标曾出现「右侧方角缺口」——20px 下几乎看不出，120px 放大后明显。
根因是手工把半径从 1.65/2 改成 1.6/1.9 时**末尾收尾弧丢失、闭合被破坏**：
路径终点 (21.80,14.80) 与起点 (19.40,15.00) 相差 2.41 单位。同时 4 处 1.9 半径的弧
弦长 3.818 > 3.8 —— 按 SVG 规范浏览器会**静默放大半径**，形状与作者意图不一致却不报错。

检查项
  A 语法：d 可完整解析（命令参数齐全、隐式重复参数展开、M/m 后的隐式命令按 L/l 处理）
  B 弧线半径：每条 a/A 的弦长 ≤ 2r（超出即为静默放大 → 形状失真）
  C 边界：把每段曲线按真实参数采样后，所有点（含 0.8 描边半宽）须落在 viewBox 内
  D 径向对称：对「≥8 条弧且只用 2 种半径」的路径判定为径向轮廓（齿轮/花键类），
    断言 r(θ) 与 r(θ+360/n) 的最大偏差 ≤ 0.15 —— n 取较大半径的弧的条数，全部由路径自身推导。
    （这一条才是对「缺口」最灵敏的探测器：缺口会在半径剖面上留下一个大台阶。）

用法
  python3 check_icons.py            正常检查，退出码 0/1
  python3 check_icons.py --selftest 自测：注入已知缺陷的旧齿轮路径，断言必须变红
"""
import math
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
FILE_02 = HERE.parent / '02-高保真可交互原型.html'

# 每条命令的参数个数（大写=绝对，小写=相对）
ARITY = {'M': 2, 'L': 2, 'H': 1, 'V': 1, 'C': 6, 'S': 4, 'Q': 4, 'T': 2, 'A': 7, 'Z': 0}
NUM = re.compile(r'[+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?')
CMD = re.compile(r'[MmLlHhVvCcSsQqTtAaZz]')

# 已知缺陷样本：改坏前的 i-cog path
BROKEN_COG = ('M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a1.9 1.9 0 1 1-2.7 2.7l-.1-.1'
              'a1.6 1.6 0 0 0-2.7 1.1v.3a1.9 1.9 0 1 1-3.8 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1'
              'a1.9 1.9 0 1 1-2.7-2.7l.1-.1A1.6 1.6 0 0 0 4.6 15a1.9 1.9 0 0 1 0-3.8h.3'
              'A1.6 1.6 0 0 0 6 8.4l-.1-.1a1.9 1.9 0 1 1 2.7-2.7l.1.1a1.6 1.6 0 0 0 2.7-1.1v-.3'
              'a1.9 1.9 0 1 1 3.8 0v.2a1.6 1.6 0 0 0 2.8 1.1l.1-.1a1.9 1.9 0 1 1 2.7 2.7l-.1.1'
              'a1.6 1.6 0 0 0 1.1 2.7h.3a1.9 1.9 0 0 1 0 3.8h-.3')
FIXED_COG_FRAG = 'M20.314 10.233A8.5 8.5'


class PathError(Exception):
    pass


def parse_path(d):
    """完整解析 d，返回 [(命令字符, [参数...]), ...]。"""
    out, i, n = [], 0, len(d)

    def skip(j):
        while j < n and d[j] in ' \t\r\n,':
            j += 1
        return j

    while i < n:
        i = skip(i)
        if i >= n:
            break
        ch = d[i]
        if not CMD.fullmatch(ch):
            raise PathError(f'位置 {i} 出现非法字符 {ch!r}')
        i += 1
        need = ARITY[ch.upper()]
        if need == 0:
            out.append((ch, []))
            continue
        first = True
        while True:
            args = []
            for _ in range(need):
                i = skip(i)
                m = NUM.match(d, i)
                if not m:
                    raise PathError(f'命令 {ch} 参数不足（需要 {need} 个，只得到 {len(args)} 个）')
                args.append(float(m.group(0)))
                i = m.end()
            if first:
                out.append((ch, args))
                first = False
            else:
                # 隐式重复：M 后续为 L，m 后续为 l，其余沿用原命令
                rep = 'L' if ch == 'M' else ('l' if ch == 'm' else ch)
                out.append((rep, args))
            j = skip(i)
            if j >= n or CMD.fullmatch(d[j]):
                break
            i = j
    if not out:
        raise PathError('d 为空')
    return out


def arc_samples(p0, rx, ry, phi_deg, laf, sf, p1, steps=32):
    """按 SVG 规范的弧线→圆心参数化，返回弧上采样点（含端点）。"""
    x0, y0 = p0
    x1, y1 = p1
    rx, ry = abs(rx), abs(ry)
    if rx < 1e-12 or ry < 1e-12:
        return [(x0, y0), (x1, y1)]
    phi = math.radians(phi_deg % 360)
    cosp, sinp = math.cos(phi), math.sin(phi)
    dx2, dy2 = (x0 - x1) / 2.0, (y0 - y1) / 2.0
    x1p = cosp * dx2 + sinp * dy2
    y1p = -sinp * dx2 + cosp * dy2
    lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
    if lam > 1:
        k = math.sqrt(lam)
        rx, ry = rx * k, ry * k            # 规范要求：半径不足则等比放大
    num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
    den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
    co = math.sqrt(max(0.0, num / den)) if den else 0.0
    if laf == sf:
        co = -co
    cxp = co * rx * y1p / ry
    cyp = -co * ry * x1p / rx
    cx = cosp * cxp - sinp * cyp + (x0 + x1) / 2
    cy = sinp * cxp + cosp * cyp + (y0 + y1) / 2

    def angle(ux, uy, vx, vy):
        d = math.hypot(ux, uy) * math.hypot(vx, vy)
        c = max(-1.0, min(1.0, (ux * vx + uy * vy) / d)) if d else 1.0
        a = math.acos(c)
        return -a if (ux * vy - uy * vx) < 0 else a

    th1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
    dth = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
    if not sf and dth > 0:
        dth -= 2 * math.pi
    elif sf and dth < 0:
        dth += 2 * math.pi
    pts = []
    for i in range(steps + 1):
        t = th1 + dth * i / steps
        ex = cx + rx * math.cos(t) * cosp - ry * math.sin(t) * sinp
        ey = cy + rx * math.cos(t) * sinp + ry * math.sin(t) * cosp
        pts.append((ex, ey))
    return pts


def cubic_samples(p0, c1, c2, p1, steps=24):
    pts = []
    for i in range(steps + 1):
        t = i / steps
        mt = 1 - t
        x = mt**3 * p0[0] + 3 * mt*mt * t * c1[0] + 3 * mt * t*t * c2[0] + t**3 * p1[0]
        y = mt**3 * p0[1] + 3 * mt*mt * t * c1[1] + 3 * mt * t*t * c2[1] + t**3 * p1[1]
        pts.append((x, y))
    return pts


def quad_samples(p0, c, p1, steps=20):
    pts = []
    for i in range(steps + 1):
        t = i / steps
        mt = 1 - t
        pts.append((mt*mt * p0[0] + 2*mt*t * c[0] + t*t * p1[0],
                    mt*mt * p0[1] + 2*mt*t * c[1] + t*t * p1[1]))
    return pts


def walk(cmds):
    """推进坐标，返回 dict：末端、起点、全部采样点、弧线列表、是否有 Z。"""
    x = y = 0.0
    start = None
    pts = []
    arcs = []
    closed = False
    prev_c = None
    prev_q = None
    for c, a in cmds:
        u = c.upper()
        rel = c.islower()
        if u == 'M':
            x, y = (x + a[0], y + a[1]) if rel else (a[0], a[1])
            if start is None:
                start = (x, y)
            pts.append((x, y))
            prev_c = prev_q = None
        elif u == 'L':
            x, y = (x + a[0], y + a[1]) if rel else (a[0], a[1])
            pts.append((x, y)); prev_c = prev_q = None
        elif u == 'H':
            x = x + a[0] if rel else a[0]
            pts.append((x, y)); prev_c = prev_q = None
        elif u == 'V':
            y = y + a[0] if rel else a[0]
            pts.append((x, y)); prev_c = prev_q = None
        elif u == 'C':
            c1 = (x + a[0], y + a[1]) if rel else (a[0], a[1])
            c2 = (x + a[2], y + a[3]) if rel else (a[2], a[3])
            p1 = (x + a[4], y + a[5]) if rel else (a[4], a[5])
            pts += cubic_samples((x, y), c1, c2, p1)
            x, y = p1; prev_c, prev_q = c2, None
        elif u == 'S':
            c1 = (2*x - prev_c[0], 2*y - prev_c[1]) if prev_c else (x, y)
            c2 = (x + a[0], y + a[1]) if rel else (a[0], a[1])
            p1 = (x + a[2], y + a[3]) if rel else (a[2], a[3])
            pts += cubic_samples((x, y), c1, c2, p1)
            x, y = p1; prev_c, prev_q = c2, None
        elif u == 'Q':
            c1 = (x + a[0], y + a[1]) if rel else (a[0], a[1])
            p1 = (x + a[2], y + a[3]) if rel else (a[2], a[3])
            pts += quad_samples((x, y), c1, p1)
            x, y = p1; prev_q, prev_c = c1, None
        elif u == 'T':
            c1 = (2*x - prev_q[0], 2*y - prev_q[1]) if prev_q else (x, y)
            p1 = (x + a[0], y + a[1]) if rel else (a[0], a[1])
            pts += quad_samples((x, y), c1, p1)
            x, y = p1; prev_q, prev_c = c1, None
        elif u == 'A':
            p1 = (x + a[5], y + a[6]) if rel else (a[5], a[6])
            seg = arc_samples((x, y), a[0], a[1], a[2], int(a[3]), int(a[4]), p1)
            pts += seg
            arcs.append({'rx': a[0], 'ry': a[1], 'from': (x, y), 'to': p1,
                         'chord': math.hypot(p1[0]-x, p1[1]-y), 'sampled': seg})
            x, y = p1; prev_c = prev_q = None
        elif u == 'Z':
            closed = True
            if start:
                pts.append(start)
                x, y = start
    return {'end': (x, y), 'start': start, 'pts': pts, 'arcs': arcs, 'closed': closed}


def radial_symmetry_issue(pts, center, arcs, tol=0.15):
    """径向轮廓对称性。返回 (n, max_dev) 或 None（不适用）。"""
    if len(arcs) < 8:
        return None
    radii = sorted({round(a['rx'], 3) for a in arcs})
    if len(radii) != 2:
        return None
    big = radii[-1]
    n = sum(1 for a in arcs if abs(a['rx'] - big) < 1e-6)
    if n < 4:
        return None
    step = 360.0 / n
    prof = {}
    for (px, py) in pts:
        ang = math.degrees(math.atan2(py - center[1], px - center[0])) % 360
        prof[int(round(ang)) % 360] = math.hypot(px - center[0], py - center[1])
    worst = 0.0
    for deg in range(360):
        a = prof.get(deg)
        b = prof.get(int(round((deg + step))) % 360)
        if a is None or b is None:
            continue
        worst = max(worst, abs(a - b))
    return n, worst, tol


def check(src, stroke_half=0.8, label=''):
    fails, warns, n_icons = [], [], 0
    for m in re.finditer(r'<symbol id="(i-[^"]+)"([^>]*)>(.*?)</symbol>', src, re.S):
        iid, attrs, body = m.group(1), m.group(2), m.group(3)
        vb = re.search(r'viewBox="([^"]+)"', attrs)
        box = [float(v) for v in vb.group(1).replace(',', ' ').split()] if vb else [0, 0, 24, 24]
        n_icons += 1
        bx, by, bw, bh = box
        lo_x, hi_x = bx - stroke_half, bx + bw + stroke_half
        lo_y, hi_y = by - stroke_half, by + bh + stroke_half
        for pm in re.finditer(r'<path[^>]*\bd="([^"]+)"', body):
            d = pm.group(1)
            try:
                w = walk(parse_path(d))
            except PathError as e:
                fails.append(f'{iid} 路径语法错误：{e}')
                continue
            # B 弧线半径
            for idx, a in enumerate(w['arcs']):
                if a['chord'] > 2 * a['rx'] + 1e-9:
                    fails.append(
                        f'{iid} 弧线半径不足：第 {idx+1} 条弧 r={a["rx"]}，弦长 {a["chord"]:.3f} '
                        f'> 2r={2*a["rx"]:.3f}（浏览器会静默放大半径 → 形状失真）')
            # C 边界
            for (px, py) in w['pts']:
                if px < lo_x - 1e-6 or px > hi_x + 1e-6 or py < lo_y - 1e-6 or py > hi_y + 1e-6:
                    fails.append(f'{iid} 坐标越界：({px:.2f},{py:.2f}) 超出 viewBox 含描边半宽的范围')
                    break
            # D 径向对称
            rs = radial_symmetry_issue(w['pts'], (bx + bw/2, by + bh/2), w['arcs'])
            if rs:
                n, worst, tol = rs
                if worst > tol:
                    fails.append(
                        f'{iid} 径向轮廓不对称：按 {n} 等分（齿距 {360/n:.1f}°）比较半径剖面，'
                        f'最大偏差 {worst:.3f} > 容差 {tol}（典型症状：某个齿/凸起被压成缺口）')
                else:
                    warns.append(f'{iid} 径向轮廓 {n} 等分对称，最大偏差 {worst:.4f}')
    tag = f'[{label}] ' if label else ''
    print(f'{tag}扫描 {n_icons} 个图标')
    for w in warns:
        print(f'  INFO  {w}')
    for f in fails:
        print(f'  FAIL  {f}')
    if not fails:
        print(f'  PASS  路径语法完整 · 弧线半径均 ≤ 2r · 坐标均在 viewBox 内 · 径向轮廓对称（{n_icons} 个图标）')
    return fails


def main():
    selftest = '--selftest' in sys.argv
    src = FILE_02.read_text(encoding='utf-8')
    print('门禁 4/6 · 图标几何')
    print('做什么：解析全部 <symbol> 的 path，检查语法完整性、弧线半径是否被静默放大、')
    print('        采样后坐标是否越界，并对径向轮廓断言等分对称。\n')

    fails = check(src, label='原型实况')

    if selftest:
        print('\n--- 自测（反向验证：注入已知缺陷路径，断言必须变红）---')
        cands = [m.group(0) for m in re.finditer(r'<symbol id="i-cog"[^>]*>.*?</symbol>', src, re.S)]
        if len(cands) != 1:
            print(f'  FAIL  自测注入失败：i-cog 定位到 {len(cands)} 处，期望 1 处')
            return 1
        injected = src.replace(cands[0], f'<symbol id="i-cog" viewBox="0 0 24 24">'
                                          f'<path d="{BROKEN_COG}"/></symbol>')
        inj = check(injected, label='注入缺陷后')
        if not inj:
            print('  FAIL  自测失败：注入已知缺陷后仍未报错 → 本门禁是空转的')
            return 1
        print(f'  PASS  自测通过：注入后报出 {len(inj)} 条，断言非空转')
        if not any('i-cog' in x for x in inj):
            print('  FAIL  自测失败：报错项未指向 i-cog')
            return 1
        if fails:
            print('  FAIL  自测失败：还原后实况仍有失败项')
            return 1

    print()
    if fails:
        print(f'结论：发现 {len(fails)} 条几何缺陷 ❌')
        return 1
    print('结论：图标几何健全 ✅')
    return 0


if __name__ == '__main__':
    sys.exit(main())
