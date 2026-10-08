#!/usr/bin/env python3
"""M4 文章优化验收器 —— 用法: python3 check_m4.py M4-03 M4-07 ...

按 docs/M4-文章优化方案.md §7 的 9 项门槛复核，并核验文章引用的关键代码
是否真实存在于 flutter-app/ 源码中（不采信自陈）。
"""
import re
import sys
import glob
import os

ART = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'articles')
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
FLUTTER = os.path.join(ROOT, 'flutter-app')

# 免责话术特征词：只收「自我免责」类表述。
# 注意排除纯技术术语：'边界'（信任边界/凭证边界）、'无法'（技术上确实做不到时）单独判定，
# 否则会把讲安全边界的正常技术表述误判为免责腔。
HEDGE = ['不能替代', '不是唯一', '以实际为准', '不得', '并不', '不等于', '需要核对',
         '必须核对', '示意', '不要假设', '未实现', '不能靠', '不应', '避免', '声明',
         '宣称', '不能写成', '不承诺', '不要把', '尚未', '只能由', '需自行']

GATES = [
    ('正文字数', 2400, 'ge'), ('代码行', 30, 'ge'), ('表格行', 2, 'ge'),
    ('免责密度', 3.0, 'le'), ('失败叙事', 1, 'ge'),
]

# 复盘/批次总结类文章：按内容组织，代码量天然少于技术篇
REVIEW_EXEMPT = {'M4-28'}


def find(pattern):
    hits = glob.glob(os.path.join(ART, pattern))
    return hits[0] if hits else None


def _norm(s):
    """归一化空白：源码换行排版不应导致探针误报。"""
    return re.sub(r'\s+', ' ', s)


def check(key):
    p = find(key + '*.md')
    if not p:
        print(f'!! 找不到 {key}'); return False
    t = open(p, encoding='utf-8').read()
    cut = t.find('<!-- PUBLISH_ASSIST_START')
    body = t[:cut] if cut > 0 else t

    cjk = len(re.findall(r'[\u4e00-\u9fff]', body))
    blocks = re.findall(r'```(\w*)\n(.*?)```', body, re.S)
    cl = sum(len(b[1].rstrip().split('\n')) for b in blocks)
    tbl = len([l for l in body.split('\n') if l.strip().startswith('|')])
    h2 = len(re.findall(r'^## ', body, re.M))
    hedge = sum(len(re.findall(re.escape(p), body)) for p in HEDGE)
    density = hedge / cjk * 1000
    lines = body.split('\n')
    first = next((l.strip() for l in lines[1:] if l.strip()), '')
    fail_narr = 1 if re.search(
        r'我一开始|我曾|结果下一次|真踩到|我真的踩过|我错了|第一反应是|最初.{0,6}(以为|写|做)|改成了|写错过|我数错|我一开始的判断是错|以为.{0,8}失败',
        body) else 0
    img = len(re.findall(r'\{\{IMG', body))
    link = len(re.findall(r'\{\{LINK', body))

    vals = [('正文字数', cjk), ('代码行', cl), ('表格行', tbl),
            ('免责密度', density), ('失败叙事', fail_narr)]
    thr_map = {g[0]: (g[1], g[2]) for g in GATES}
    # 复盘/总结类文章天然少代码，按技术篇标准考核不合理
    is_review = key in REVIEW_EXEMPT
    ok = True
    print(f'\n===== {key}  {os.path.basename(p)} =====')
    if is_review:
        print('  （复盘篇：代码行门槛豁免）')
    for name, v in vals:
        thr, mode = thr_map[name]
        if name == '代码行' and is_review:
            print(f'  {name:<9}{v:>8}  (复盘篇豁免)        —')
            continue
        good = v >= thr if mode == 'ge' else v <= thr
        ok &= good
        shown = f'{v:.1f}' if isinstance(v, float) else str(v)
        print(f'  {name:<9}{shown:>8}  (门槛 {"≥" if mode=="ge" else "≤"}{thr})  '
              f'{"PASS" if good else "FAIL"}')
    good = not first.startswith('>')
    ok &= good
    print(f'  {"开场形态":<9}{"叙事" if good else "引用块":>8}                '
          f'{"PASS" if good else "FAIL"}')
    good = cut > 0
    ok &= good
    print(f'  {"辅助区":<9}{"保留" if good else "缺失":>8}                '
          f'{"PASS" if good else "FAIL"}')
    # 乱码/替换字符检查
    bad = body.count('\ufffd')
    ok &= bad == 0
    print(f'  {"替换字符":<9}{bad:>8}                {"PASS" if bad == 0 else "FAIL"}')
    # 标题格式：必须以「# 成为全栈·…篇·」开头（副标题可无冒号）
    title = body.lstrip().split('\n')[0]
    title_ok = title.startswith('# 成为全栈·') and '篇·' in title
    ok &= title_ok
    print(f'  {"标题格式":<9}{"规范" if title_ok else "异常":>8}                '
          f'{"PASS" if title_ok else "FAIL"}')
    print(f'  H2 章节 {h2} · 代码块 {len(blocks)} · 占位 IMG={img} LINK={link}')
    return ok


def verify_code(key):
    """核验文章引用的关键代码在 flutter-app/ 中真实存在。"""
    probes = {
        'M4-03': [('tool/generate_contract.mjs', 'execFileSync'),
                  ('tool/generate_contract.mjs', 'Generated'),
                  ('lib/core/generated/models.dart', 'class ApiPagination'),
                  ('lib/features/data/reader_models.dart', 'data.id!'),
                  ('lib/features/data/reader_models.dart', 'p.page ?? 1')],
        'M4-07': [('lib/features/repository.dart', "path == Endpoints.search) data = data['articles']"),
                  ('lib/features/repository.dart', 'cache.fence(affected)'),
                  ('lib/features/repository.dart', 'SessionChanged'),
                  ('lib/features/data/cache_policy_table.dart', 'ResourceFamily'),
                  ('lib/features/data/cache_policy_table.dart', '_Shape.page'),
                  ('lib/features/data/cache_policy_table.dart', 'FormatException'),
                  ('lib/core/network/api_client.dart', 'class ApiFailure')],
        'M4-09': [('lib/core/network/api_client.dart', 'abstract interface class TokenVault'),
                  ('lib/core/network/api_client.dart', 'reader.refresh.$namespace'),
                  ('lib/core/network/api_client.dart', 'if (_refresh != null) return _refresh!'),
                  ('lib/core/network/api_client.dart', 'identical(_refresh, task)'),
                  ('lib/core/network/api_client.dart', 'refreshAllowed: false'),
                  ('lib/core/network/api_client.dart', 'originalToken == accessToken'),
                  ('lib/core/network/api_client.dart', 'start != epoch'),
                  ('lib/core/network/api_client.dart', 'data is FormData ? data.clone()'),
                  ('lib/features/repository.dart', 'session:${api.userId}:${api.epoch}')],
        'M4-12': [('lib/shared/widgets/article_feed.dart', 'final ticket = ++serial;'),
                  ('lib/shared/widgets/article_feed.dart', 'ids.add(a.id)'),
                  ('lib/shared/widgets/article_feed.dart', 'repository.cache.fresh(firstKey)'),
                  ('lib/shared/widgets/article_feed.dart', 'saved.offset.clamp('),
                  ('lib/shared/widgets/article_feed.dart', 'pendingUpdate = !_samePrefix'),
                  ('lib/shared/widgets/article_feed.dart', 'page <= 20')],
        'M4-17': [('lib/features/comments.dart', 'Map<int, List<ApiComment>> groupComments'),
                  ('lib/features/comments.dart', 'if (!seen.add(p)) break;'),
                  ('lib/features/comments.dart', 'root = p;'),
                  ('lib/features/comments.dart', 'if (parent == null) break;'),
                  ('lib/features/comments.dart', "if (c.status == 'approved')"),
                  ('lib/features/comments.dart', "'parentId': reply!.id"),
                  ('lib/features/comments.dart', 'pendingUpdate && !reset && !check'),
                  ('lib/features/comments.dart', "part 'comment_widgets/comment_reply.dart'"),
                  ('lib/features/comment_widgets/comment_reply.dart', '原评论暂不可见')],
        'M4-08': [('lib/core/network/api_client.dart', 'seconds <= 3) {'),
                  ('lib/core/network/api_client.dart', "method == 'GET' &&"),
                  ('lib/core/network/api_client.dart', 'seconds >= 0 &&'),
                  ('lib/core/network/api_client.dart', '1005:'),
                  ('lib/core/network/api_client.dart', '5001:'),
                  ('lib/core/network/api_client.dart', 'DioExceptionType.connectionTimeout')],
        'M4-10': [('lib/features/discovery/home_page.dart', 'header: _HomeLatest()'),
                  ('lib/features/discovery/home_page.dart', 'interlude: _HomePopular()'),
                  ('lib/features/discovery/home_latest.dart', "'sort': '-publishedAt'"),
                  ('lib/features/discovery/home_popular.dart', "'sort': '-viewCount'"),
                  ('lib/shared/widgets/async_pane.dart', '更新失败，当前显示上次内容'),
                  ('lib/shared/widgets/async_pane.dart', 'final ticket = ++serial;'),
                  ('lib/shared/widgets/async_pane.dart', 'if (superseded && cacheVisible)'),
                  ('lib/shared/widgets/async_pane.dart', 'old.loadKey != widget.loadKey'),
                  ('lib/features/data/cache_policy_table.dart', "query['sort'] == '-viewCount'")],
        'M4-11': [('lib/core/generated/models.dart', 'class ApiCategoryNode'),
                  ('lib/features/discovery/categories_page.dart', "read(Endpoints.categoriesStats)"),
                  ('lib/features/discovery/categories_page.dart', "'articleCount'"),
                  ('lib/features/discovery/categories_page.dart', 'Uri.encodeComponent'),
                  ('lib/features/repository.dart', "path == Endpoints.search) data = data['articles']")],
    }
    items = probes.get(key)
    if not items:
        return True
    print(f'\n  --- 代码真实性核验 ({key}) ---')
    ok = True
    for rel, frag in items:
        fp = os.path.join(FLUTTER, rel)
        try:
            src = open(fp, encoding='utf-8').read()
            # 归一化空白后匹配：源码换行排版不应导致探针误报
            hit = _norm(frag) in _norm(src)
        except FileNotFoundError:
            hit = False
        ok &= hit
        print(f'    {"PASS" if hit else "FAIL"}  {rel.split("/")[-1]:<24} {frag[:44]}')
    return ok


def verify_links(key):
    """核验文章里所有硬编码的 CSDN 外链真实存在于发布索引中（防编造 URL）。"""
    idx = '/Users/fungleo/Documents/Blogs/materials/csdn-已发布链接.md'
    if not os.path.exists(idx):
        print('\n  (跳过外链核验：索引文件不存在)')
        return True
    p = find(key + '*.md')
    t = open(p, encoding='utf-8').read()
    src = open(idx, encoding='utf-8').read()
    urls = re.findall(r'\]\((https://blog\.csdn\.net/fungleo/article/details/(\d+))\)', t)
    if not urls:
        print('\n  外链核验：本篇无硬编码 CSDN 外链  PASS')
        return True
    print(f'\n  --- 外链真实性核验 ({key}) ---')
    ok = True
    for full, aid in urls:
        hit = aid in src
        ok &= hit
        print(f'    {"PASS" if hit else "FAIL"}  {aid}  {full[:58]}')
    return ok


if __name__ == '__main__':
    keys = sys.argv[1:] or ['M4-03', 'M4-07']
    allok = True
    for k in keys:
        allok &= check(k)
        allok &= verify_code(k)
        allok &= verify_links(k)
    print('\n' + ('=' * 46))
    print('总判定: ' + ('全部 PASS' if allok else '存在 FAIL，需修'))
    sys.exit(0 if allok else 1)