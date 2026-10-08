#!/usr/bin/env python3
"""M6 Go 后端文章优化验收器 —— 用法: python3 check_m6.py M6-01 M6-11 ...

按 docs/M6-文章优化方案.md 的门槛复核，并做两件「不采信自陈」的核验：
  1) 文中声明的源码路径（cmd/… internal/… test/… docs/…）必须真实存在于 go-backend/ 或仓库根；
  2) 代码块里的实质代码行，应能在被声明的文件里找到（归一化空白后比对）。
只报事实，不做判定豁免以外的放宽。

与 check_m5.py 的差异（M6 特有）：
  * M6 系列正文用「波浪线围栏」~~~go / ~~~ts，M5 用反引号；本器两种都认。
  * M6 文章大量引用「包/目录」而非具体文件，故命中率仅作提示；硬门禁仍是「声明路径存在」。
  * 封面图 1 张（M5 为 2 张），标题前缀为「成为全栈·Go 后端篇·」。
"""
import re
import sys
import glob
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..')
ART = os.path.join(ROOT, 'articles')
GO = os.path.join(ROOT, 'go-backend')
DOCS = os.path.join(ROOT, 'docs')

# 免责话术特征词（沿用 check_m4/m5 口径：只收「自我免责」类）。
HEDGE = ['不能替代', '不是唯一', '以实际为准', '不得', '并不', '不等于', '需要核对',
         '必须核对', '不要假设', '未实现', '不能靠', '不应', '避免', '宣称',
         '不能写成', '不承诺', '不要把', '尚未', '只能由', '需自行']

# 门槛（对齐 M4 优化后中位、与 M5 统一）。
GATES = [
    ('正文字数', 3000, 'ge'), ('代码行', 45, 'ge'), ('表格行', 8, 'ge'),
    ('免责密度', 4.0, 'le'),
]

# 复盘 / 选型 / 对比 / 审阅类文章：天然代码少，豁免「代码行」一栏。
REVIEW_EXEMPT = {'M6-07', 'M6-08', 'M6-09', 'M6-10', 'M6-32'}

PATH_RE = re.compile(r'((?:cmd|internal|test|scripts|config)/[\w./\-]+?\.(?:go|json|md|mod|yaml|yml|sql|sh))(?![A-Za-z0-9])')
DOCPATH_RE = re.compile(r'((?:docs)/[\w./\-]+?\.(?:go|json|md|mod|yaml|yml|sql|sh))(?![A-Za-z0-9])')
# 同时认 ``` 与 ~~~ 两种围栏
FENCE_RE = re.compile(r'^(```|~~~)[^\n]*\n(.*?)^\1', re.S | re.M)

_SRC = None


def _norm(s):
    return re.sub(r'\s+', ' ', s).replace('"', "'").strip()


def _all_sources():
    """整棵 go-backend + docs 源码树，用于「代码行命中」回搜。"""
    global _SRC
    if _SRC is None:
        _SRC = {}
        for base, tag in ((GO, 'go'), (DOCS, 'docs')):
            for dp, dns, fns in os.walk(base):
                dns[:] = [d for d in dns if d not in ('node_modules', 'bin', 'dist', '.git', 'uploads')]
                for fn in fns:
                    if fn.endswith(('.go', '.ts', '.mts', '.js', '.mjs', '.json', '.md', '.yaml', '.yml', '.sql', '.sh')):
                        fp = os.path.join(dp, fn)
                        try:
                            _SRC[tag + ':' + os.path.relpath(fp, base)] = _norm(open(fp, encoding='utf-8').read())
                        except Exception:
                            pass
    return _SRC


def find(key):
    hits = glob.glob(os.path.join(ART, key + '*.md'))
    return hits[0] if hits else None


def body_of(text):
    cut = text.find('<!-- PUBLISH_ASSIST_START')
    return (text[:cut] if cut > 0 else text), cut


def probe_code(body):
    """核验：声明的源码路径存在 + 代码块实质行能在源码树找到。

    返回 (存在路径, 缺失路径, 命中行, 抽查行, 明细)。
    """
    paths = sorted(set(PATH_RE.findall(body)))
    docs_paths = sorted(set(DOCPATH_RE.findall(body)))
    exist, missing = [], []
    for rel in paths:
        (exist if os.path.exists(os.path.join(GO, rel)) else missing).append(rel)
    for rel in docs_paths:
        (exist if os.path.exists(os.path.join(ROOT, rel)) else missing).append(rel)

    blob = '\n'.join(_all_sources().values())
    checked = hit = 0
    details = []
    for m in FENCE_RE.finditer(body):
        code = m.group(2)
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
            claim = PATH_RE.findall(code) or DOCPATH_RE.findall(code)
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
    lead = first[1:].strip() if first.startswith('>') else ''
    has_preface = bool(re.search(r'^##\s*前言', body, re.M))
    opener_ok = has_preface
    opener_desc = ('导语(%d字)+前言' % len(lead)) if lead else ('叙事' if has_preface else '无前言')
    img = len(re.findall(r'\{\{IMG', body))
    link = len(re.findall(r'\{\{LINK', body))
    bad = body.count('\ufffd')
    title = body.lstrip().split('\n')[0]
    title_ok = title.startswith('# 成为全栈·') and 'Go 后端篇' in title

    is_review = key in REVIEW_EXEMPT
    thr = {g[0]: (g[1], g[2]) for g in GATES}
    ok = True
    print(f'\n===== {key}  {os.path.basename(p)} =====')
    vals = [('正文字数', cjk), ('代码行', cl), ('表格行', tbl), ('免责密度', density)]
    for name, v in vals:
        t, mode = thr[name]
        if name == '代码行' and is_review:
            print(f'  {name:<8}{v:>8}  (复盘/选型/对比篇豁免)   —')
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
    keys = sys.argv[1:] or ['M6-01']
    allok = True
    for k in keys:
        allok &= check(k)
    print('\n' + ('=' * 50))
    print('总判定: ' + ('全部 PASS' if allok else '存在 FAIL，需修或需人工确认'))
    sys.exit(0 if allok else 1)
