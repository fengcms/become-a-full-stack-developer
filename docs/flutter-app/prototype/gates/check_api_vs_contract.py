#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""门禁 2/6 · 原型 api 标注 vs 冻结契约

做什么：
  1. 从原型里抽出全部 `api:[...]`（以及第四轮新增的 `apiOptional:[...]`）标注，
     展开成 (方法, 路径) 对；
  2. 从 openapi.v1.yaml 抽出真实 (方法, 路径) 全集；
  3. 断言：标注里没有幽灵端点、没有方法错、没有参数名错。

  ⚠️ 标注写法的硬约束：数组元素必须是 `<方法> <路径>` 两段，**路径后不能再接任何
     说明文字**。解析按第一个空格切分，路径带着尾巴去比对契约就会变成幽灵端点
     （第四轮实测过：加个「（本阶段不实现）」后缀即报 FAIL）。要做语义标记请用
     `apiOptional` 这类**独立字段**，而不是往字符串里塞注释。

为什么不用 PyYAML：本项目语义门（docs/api/check_contract.py）已经依赖它，
但门禁要能被「任何有 python3 的环境」复跑，所以这里自带一个够用的
两级缩进扫描器，只认 `paths:` 下的 `  /path:` 与 `    method:`。
（本脚本另带 --selfcheck，用 PyYAML 交叉验证扫描器结果，防止解析器本身出错。）

用法：
  python3 check_api_vs_contract.py
  python3 check_api_vs_contract.py --selfcheck   # 若有 PyYAML，交叉验证解析器
退出码：0 全绿 / 1 有缺陷 / 2 输入缺失
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PROTOTYPE_DIR = os.path.dirname(HERE)
REPO_ROOT = os.path.abspath(os.path.join(PROTOTYPE_DIR, '..', '..', '..'))
CONTRACT = os.path.join(REPO_ROOT, 'docs', 'api', 'openapi.v1.yaml')
PROTO_FILES = [
    os.path.join(PROTOTYPE_DIR, '01-基本页面样稿.html'),
    os.path.join(PROTOTYPE_DIR, '02-高保真可交互原型.html'),
]
API_PREFIX = '/api/v1'

# 已声明的例外：契约 paths 里没有、但原型标注合理的端点。
# 每条例外都要写明依据，否则等于给幽灵端点开后门。
EXCEPTIONS = {
    'GET /files/{key}': '附件静态中转，挂在根路径（不带 /api/v1），M1 部署实测；不在契约 paths 中属已知例外。',
}


def parse_contract_paths(text):
    """极简扫描：只要 paths: 下的路径键与它下面的方法键。"""
    out = {}
    in_paths = False
    cur = None
    for line in text.splitlines():
        if not in_paths:
            if line.startswith('paths:'):
                in_paths = True
            continue
        if line and not line[0].isspace():
            break  # 顶层键出现，paths 段结束
        m2 = re.match(r'^  (/\S+):\s*$', line)
        if m2:
            cur = m2.group(1)
            out[cur] = set()
            continue
        m4 = re.match(r'^    (get|post|put|patch|delete|head|options|trace):\s*$', line)
        if m4 and cur:
            out[cur].add(m4.group(1).upper())
    return out


def extract_annotations(text, fname):
    """抽出 api / apiOptional 标注，返回 [(原文, 方法, 路径, 文件, 是否可选)]。

    两个数组都要抽：
      · api          —— 本页会调用 / 已渲染的端点；
      · apiOptional  —— 契约里存在、但本页本阶段不渲染成 UI 的端点（第四轮 A-8）。
    语义上分栏，但**契约校验覆盖必须一致**：可选端点也得真在契约里，
    否则"可选"就成了幽灵端点的后门。故此处共用同一套抽取与后续校验。
    """
    rows = []
    for m in re.finditer(r'api(Optional)?:\s*\[(.*?)\]', text, re.S):
        opt = bool(m.group(1))
        blob = m.group(2)
        for lit in re.findall(r"'([^']*)'", blob):
            lit = lit.strip()
            if not lit:
                continue
            parts = lit.split(' ', 1)
            if len(parts) != 2:
                rows.append((lit, None, None, fname, opt))
                continue
            methods, path = parts[0], parts[1].strip()
            rows.append((lit, methods, path, fname, opt))
    return rows


def norm(path):
    p = path
    if p.startswith(API_PREFIX):
        p = p[len(API_PREFIX):]
    p = p.split('?', 1)[0].split('#', 1)[0]
    if len(p) > 1 and p.endswith('/'):
        p = p[:-1]
    return p


def main():
    missing = [p for p in [CONTRACT] + PROTO_FILES if not os.path.exists(p)]
    if missing:
        print('输入缺失，无法执行：')
        for p in missing:
            print('  -', p)
        return 2

    contract = parse_contract_paths(open(CONTRACT, encoding='utf-8').read())
    if not contract:
        print('契约 paths 解析结果为 0，解析器可能失效'); return 2
    raw_path_count = len(contract)
    total_ops = sum(len(v) for v in contract.values())
    # 契约键带 /api/v1 前缀，统一归一后再与原型标注比对
    contract = {norm(k): v for k, v in contract.items()}
    if len(contract) != raw_path_count:
        print('归一后路径数变化，存在前缀重复，需要人工确认'); return 2

    if '--selfcheck' in sys.argv:
        try:
            import yaml
        except ImportError:
            print('[selfcheck] 无 PyYAML，跳过交叉验证')
        else:
            y = yaml.safe_load(open(CONTRACT, encoding='utf-8').read())['paths']
            ref = {norm(k): {m.upper() for m in v if m in
                             {'get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'}}
                   for k, v in y.items()}
            if ref == contract:
                print(f'[selfcheck] 扫描器与 PyYAML 结果完全一致（{len(ref)} 路径，归一后）✅')
            else:
                print('[selfcheck] 与 PyYAML 不一致 ❌')
                print('  仅在扫描器:', set(ref) ^ set(contract))
                for k in set(ref) & set(contract):
                    if ref[k] != contract[k]:
                        print(f'  {k}: yaml={ref[k]} scan={contract[k]}')
                return 2

    rows = []
    for f in PROTO_FILES:
        rows += extract_annotations(open(f, encoding='utf-8').read(), os.path.basename(f))

    print(f'契约基线：{len(contract)} 路径 / {total_ops} 操作')
    print(f'原型 api 标注：{len(rows)} 条（{len(PROTO_FILES)} 个文件）\n')

    fails = []
    used_exceptions = set()
    for raw, methods, path, fname, opt in rows:
        if methods is None:
            fails.append((fname, raw, '标注格式无法解析（期望 "<方法> <路径>"）'))
            continue
        # ① 方法写法必须统一用逗号，禁止 POST/DELETE 这类斜杠写法
        if '/' in methods:
            fails.append((fname, raw, f'方法分隔符用了 "/"，应写成 {methods.replace("/", ",")}'))
        p = norm(path)
        # ② 参数名必须与契约字面量一致
        if p not in contract:
            key = f'{methods} {p}'
            if key in EXCEPTIONS:
                used_exceptions.add(key)
                continue
            fails.append((fname, raw, f'幽灵端点：契约 paths 中没有 {p}'))
            continue
        # ③ 方法必须在契约里存在
        for m in re.split(r'[,\s]+', methods):
            m = m.strip()
            if not m:
                continue
            if m not in contract[p]:
                fails.append((fname, raw, f'方法不匹配：契约 {p} 只有 {sorted(contract[p])}，标注写了 {m}'))

    for fname, raw, why in fails:
        print(f'  FAIL  [{fname}] {raw}\n        {why}')
    if not fails:
        for row in rows:
            mark = '   〔本阶段不实现〕' if row[4] else ''
            print(f'  PASS  {row[0]}{mark}')
    print()
    for k, v in EXCEPTIONS.items():
        mark = '已命中' if k in used_exceptions else '未命中（可清理）'
        print(f'  例外  {k}  —— {mark}：{v}')
    print()
    if fails:
        print(f'结论：{len(fails)} 条标注与契约不符 ❌')
        return 1
    nopt = sum(1 for r in rows if r[4])
    print(f'结论：{len(rows)} 条标注全部与契约一致 ✅'
          f'（含 apiOptional 本阶段不实现 {nopt} 条；已声明例外 {len(EXCEPTIONS)} 条）')
    return 0


if __name__ == '__main__':
    sys.exit(main())
