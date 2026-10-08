#!/usr/bin/env python3
"""M5 小程序文章优化验收器 —— 用法: python3 check_m5.py M5-01 M5-11 ...

按 docs/M5-文章优化方案.md 的门槛复核，并做两件「不采信自陈」的核验：
  1) 文中声明的源码路径（src/... / test/... / scripts/...）必须真实存在于 taro-miniprogram/；
  2) 代码块里的实质代码行，应能在被声明的文件里找到（归一化空白后比对）。
只报事实，不做判定豁免以外的放宽。
"""
import re
import sys
import glob
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..')
ART = os.path.join(ROOT, 'articles')
TARO = os.path.join(ROOT, 'taro-miniprogram')

# 免责话术特征词（沿用 check_m4.py 口径：只收「自我免责」类）。
HEDGE = ['不能替代', '不是唯一', '以实际为准', '不得', '并不', '不等于', '需要核对',
         '必须核对', '不要假设', '未实现', '不能靠', '不应', '避免', '宣称',
         '不能写成', '不承诺', '不要把', '尚未', '只能由', '需自行']

# 门槛（owner 2026-10-08 提高）：对齐 M4 优化后中位（≈3095 字 / 86 行代码 / 13 表行）。
# 代码行留了一点余量——部分主题天然代码少，但仍须显著高于优化前的 8 行。
GATES = [
    ('正文字数', 3000, 'ge'), ('代码行', 45, 'ge'), ('表格行', 8, 'ge'),
    ('免责密度', 4.0, 'le'),
]

# 复盘/总述类文章：代码量天然少
REVIEW_EXEMPT = {'M5-05', 'M5-07', 'M5-08', 'M5-24'}

PATH_RE = re.compile(r'((?:src|test|scripts|config|tool)/[\w./\-]+?\.(?:tsx|ts|mjs|js|json|scss|md))(?![A-Za-z0-9])')
FENCE_RE = re.compile(r'```(\w*)\n(.*?)```', re.S)

# 源码树缓存：不仅按「声明的文件」比对，也整树回搜（应对跨文件节选与跨仓库对照）
_SRC_FILES = None


def _norm(s):
    return re.sub(r'\s+', ' ', s).replace('"', "'").strip()


def _all_sources():
    global _SRC_FILES
    if _SRC_FILES is None:
        _SRC_FILES = {}
        for dp, dns, fns in os.walk(TARO):
            dns[:] = [d for d in dns if d not in ('node_modules', 'dist', '.git')]
            for fn in fns:
                if fn.endswith(('.ts', '.tsx', '.js', '.mjs', '.json', '.scss')):
                    fp = os.path.join(dp, fn)
                    try:
                        _SRC_FILES[os.path.relpath(fp, TARO)] = _norm(open(fp, encoding='utf-8').read())
                    except Exception:
                        pass
    return _SRC_FILES


def find(key):
    hits = glob.glob(os.path.join(ART, key + '*.md'))
    return hits[0] if hits else None


def body_of(text):
    cut = text.find('<!-- PUBLISH_ASSIST_START')
    return (text[:cut] if cut > 0 else text), cut


def probe_code(body):
    """核验：声明的源码路径存在 + 代码块实质行能在整棵源码树找到。

    返回 (存在路径, 缺失路径, 命中行, 抽查行, 明细)。比对做引号/空白归一化，
    以排除「源码用双引号、文章用单引号」这类排版差异造成的伪影。
    """
    paths = sorted(set(PATH_RE.findall(body)))
    exist, missing = [], []
    for rel in paths:
        (exist if os.path.exists(os.path.join(TARO, rel)) else missing).append(rel)

    blob = '\n'.join(_all_sources().values())
    checked = hit = 0
    details = []
    for lang, code in FENCE_RE.findall(body):
        block_all = block_ok = 0
        for line in code.split('\n'):
            s = line.strip()
            if len(s) < 14 or s.startswith('//') or s.startswith('*') or s in ('...',):
                continue
            block_all += 1
            if _norm(s) in blob:
                block_ok += 1
        if block_all:
            checked += block_all
            hit += block_ok
            # 该块声明的路径（若有）
            claim = PATH_RE.findall(code)
            label = claim[0] if claim else '(未在块内声明路径)'
            details.append((label, block_ok, block_all))
    return exist, missing, hit, checked, details


def check(key):
    p = find(key)
    if not p:
        print(f'!! 找不到 {key}')
        return False
    text = open(p, encoding='utf-8').read()
    body, cut = body_of(text)

    cjk = len(re.findall(r'[\u4e00-\u9fff]', body))
    blocks = FENCE_RE.findall(body)
    cl = sum(len(b[1].rstrip().split('\n')) for b in blocks)
    tbl = len([l for l in body.split('\n') if l.strip().startswith('|')])
    h2 = len(re.findall(r'^## ', body, re.M))
    h3 = len(re.findall(r'^### ', body, re.M))
    hedge = sum(len(re.findall(re.escape(w), body)) for w in HEDGE)
    density = hedge / cjk * 1000 if cjk else 0
    lines = body.split('\n')
    first = next((l.strip() for l in lines[1:] if l.strip()), '')
    # 开场口径（owner 2026-10-08 拍板）：「导语 + 叙事前言」分工。
    # 客观可判的只有「必须有 `## 前言` 叙事段」；导语与前言是否重复属编辑判断，
    # 机器只报告导语字数，不据此判死（避免又一次伪影）。
    lead = first[1:].strip() if first.startswith('>') else ''
    has_preface = bool(re.search(r'^##\s*前言', body, re.M))
    opener_ok = has_preface
    opener_desc = ('导语(%d字)+前言' % len(lead)) if lead else ('叙事' if has_preface else '无前言')
    img = len(re.findall(r'\{\{IMG', body))
    link = len(re.findall(r'\{\{LINK', body))
    bad = body.count('\ufffd')
    title = body.lstrip().split('\n')[0]
    title_ok = title.startswith('# 成为全栈·') and '篇·' in title

    is_review = key in REVIEW_EXEMPT
    thr = {g[0]: (g[1], g[2]) for g in GATES}
    ok = True
    print(f'\n===== {key}  {os.path.basename(p)} =====')
    vals = [('正文字数', cjk), ('代码行', cl), ('表格行', tbl), ('免责密度', density)]
    for name, v in vals:
        t, mode = thr[name]
        if name == '代码行' and is_review:
            print(f'  {name:<8}{v:>8}  (复盘/总述篇豁免)   —')
            continue
        good = v >= t if mode == 'ge' else v <= t
        ok &= good
        shown = f'{v:.1f}' if isinstance(v, float) else str(v)
        print(f'  {name:<8}{shown:>8}  ({"≥" if mode=="ge" else "≤"}{t})  {"PASS" if good else "FAIL"}')
    for name, good in [('开场形态', opener_ok),
                       ('标题格式', title_ok), ('乱码', bad == 0), ('辅助区', cut > 0)]:
        ok &= good
        detail = opener_desc if name == '开场形态' else ''
        print(f'  {name:<8}{detail:>8}  {"PASS" if good else "FAIL"}')
    print(f'  H2={h2} H3={h3} 代码块={len(blocks)} IMG={img} LINK={link}')

    exist, missing, hit, checked, details = probe_code(body)
    ratio = (hit / checked) if checked else 1.0
    # 硬门禁：声明的源码路径必须真实存在。命中率只作提示——散文节选会改引号、
    # 折行、跨文件引用，机械 100% 会误报（本项目已两次踩到该伪影）。
    probe_ok = (not missing)
    ok &= probe_ok
    print(f'  --- 代码真实性：声明路径 {len(exist)} 存在 / {len(missing)} 缺失（硬门禁）'
          f'；代码行命中 {hit}/{checked} = {ratio*100:.0f}%（提示，不算失败）---')
    if missing:
        print('    缺失路径（硬 FAIL）：' + '、'.join(missing))
    for label, b_ok, b_all in details:
        if b_all and b_ok / b_all < 0.9:
            print(f'    ⚠ 低命中 {label:<28}{b_ok}/{b_all}（多为折行/换引号，需人工确认）')
    return ok


if __name__ == '__main__':
    keys = sys.argv[1:] or ['M5-01']
    allok = True
    for k in keys:
        allok &= check(k)
    print('\n' + ('=' * 50))
    print('总判定: ' + ('全部 PASS' if allok else '存在 FAIL，需修或需人工确认'))
    sys.exit(0 if allok else 1)
