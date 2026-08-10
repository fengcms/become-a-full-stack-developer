#!/usr/bin/env python3
"""
契约语义自查脚本（第三轮复审整改配套）

openapi-spec-validator 只保证「结构合法」。本脚本补上「逻辑无漏洞」的机器断言：
  A. 结构完整性：$ref 可解析、200 响应含 schema、无非法嵌套状态码
  B. operationId：全量存在且唯一（P9）
  C. 孤儿实体：每个 schema 都被至少一个端点可达引用（P2 类问题）
  D. 死胡同状态：枚举态都有写入路径（P1 类问题）
  E. 机器强制约束：sort 枚举、可选鉴权写法（P4/P5/P7/P12）

用法：python3 docs/api/check_contract.py docs/api/openapi.v1.yaml
"""
import sys
import yaml

HTTP_METHODS = {"get", "post", "put", "patch", "delete", "head", "options", "trace"}

failures = []
notes = []


def fail(code, msg):
    failures.append(f"[{code}] {msg}")


def ok(msg):
    notes.append(f"  OK  {msg}")


def load(path):
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def iter_operations(spec):
    for path, item in spec.get("paths", {}).items():
        for method, op in item.items():
            if method in HTTP_METHODS:
                yield path, method, op


def collect_refs(node, acc):
    """递归收集所有 $ref 字符串"""
    if isinstance(node, dict):
        for k, v in node.items():
            if k == "$ref" and isinstance(v, str):
                acc.add(v)
            else:
                collect_refs(v, acc)
    elif isinstance(node, list):
        for v in node:
            collect_refs(v, acc)


def resolve(spec, ref):
    if not ref.startswith("#/"):
        return None
    node = spec
    for part in ref[2:].split("/"):
        if not isinstance(node, dict) or part not in node:
            return None
        node = node[part]
    return node


def main(path):
    spec = load(path)
    ops = list(iter_operations(spec))

    print(f"契约文件：{path}")
    print(f"OpenAPI 版本：{spec.get('openapi')}   契约版本：{spec['info'].get('version')}")
    print(f"路径数：{len(spec.get('paths', {}))}   操作数：{len(ops)}")
    print("-" * 72)

    # ---------- A. 结构完整性 ----------
    all_refs = set()
    collect_refs(spec, all_refs)
    bad_refs = [r for r in all_refs if resolve(spec, r) is None]
    if bad_refs:
        fail("A1", f"存在无法解析的 $ref：{bad_refs}")
    else:
        ok(f"全部 {len(all_refs)} 个 $ref 均可解析")

    # 200 响应必须有 content.schema
    missing_schema = []
    for p, m, op in ops:
        r200 = op.get("responses", {}).get("200")
        if r200 is None:
            missing_schema.append(f"{m.upper()} {p} (无 200)")
            continue
        content = r200.get("content", {})
        if not content:
            missing_schema.append(f"{m.upper()} {p} (200 无 content)")
            continue
        for ct, body in content.items():
            if "schema" not in body:
                missing_schema.append(f"{m.upper()} {p} ({ct} 无 schema)")
    if missing_schema:
        fail("A2", f"200 响应缺 schema：{missing_schema}")
    else:
        ok(f"全部 {len(ops)} 个操作的 200 响应均含 content.schema")

    # 非法嵌套：状态码键出现在 responses 以外的层级（第二轮 N1 的假通过根因）
    nested = []
    for p, m, op in ops:
        for code, resp in op.get("responses", {}).items():
            blob = yaml.safe_dump(resp)
            for suspicious in ("\n404:", "\n403:", "\n409:", "\n400:", "\n401:"):
                if suspicious in "\n" + blob:
                    nested.append(f"{m.upper()} {p} -> {code}")
                    break
    if nested:
        fail("A3", f"响应体内疑似嵌套了状态码键：{nested}")
    else:
        ok("无状态码键被错误嵌套进响应体内部")

    # ---------- B. operationId ----------
    missing_oid = [f"{m.upper()} {p}" for p, m, op in ops if not op.get("operationId")]
    if missing_oid:
        fail("B1", f"缺少 operationId 的操作：{missing_oid}")
    else:
        ok(f"全部 {len(ops)} 个操作均有 operationId")

    oids = [op["operationId"] for _, _, op in ops if op.get("operationId")]
    dupes = {o for o in oids if oids.count(o) > 1}
    if dupes:
        fail("B2", f"operationId 重复：{sorted(dupes)}")
    else:
        ok(f"operationId 全局唯一（{len(oids)} 个）")

    # ---------- C. 孤儿实体 ----------
    endpoint_refs = set()
    collect_refs(spec.get("paths", {}), endpoint_refs)
    # 端点直接引用的 schema，再递归展开其内部引用（如 ArticlePage -> ArticleSummary）
    reachable = set()
    frontier = {r for r in endpoint_refs if r.startswith("#/components/schemas/")}
    while frontier:
        r = frontier.pop()
        if r in reachable:
            continue
        reachable.add(r)
        node = resolve(spec, r)
        sub = set()
        collect_refs(node, sub)
        frontier |= {s for s in sub if s.startswith("#/components/schemas/")} - reachable

    declared = {f"#/components/schemas/{n}" for n in spec["components"]["schemas"]}
    orphans = sorted(n.split("/")[-1] for n in declared - reachable)
    if orphans:
        fail("C1", f"孤儿 schema（定义了但无任何端点可达）：{orphans}")
    else:
        ok(f"全部 {len(declared)} 个 schema 均被端点可达引用，无孤儿实体")

    # ---------- D. 死胡同状态 ----------
    # 评论 status 三态：每个态都必须能被某个端点写入
    comment_states = set(spec["components"]["schemas"]["Comment"]["properties"]["status"]["enum"])
    writable = set()
    for p, m, op in ops:
        body = op.get("requestBody", {})
        refs = set()
        collect_refs(body, refs)
        blob = yaml.safe_dump(body, allow_unicode=True)
        for r in refs:
            blob += yaml.safe_dump(resolve(spec, r), allow_unicode=True)
        if "comment" in p.lower() or "Comment" in str(refs):
            for st in comment_states:
                if st in blob:
                    writable.add(st)
    unreachable = comment_states - writable
    if unreachable:
        fail("D1", f"评论状态无任何端点可写入（死胡同）：{sorted(unreachable)}")
    else:
        ok(f"评论三态 {sorted(comment_states)} 均有端点可写入")

    # 文章 status 三态可写
    article_states = set(spec["components"]["schemas"]["Article"]["properties"]["status"]["enum"])
    art_blob = yaml.safe_dump(
        {p: i for p, i in spec["paths"].items() if "article" in p.lower()}, allow_unicode=True
    )
    art_unreachable = {s for s in article_states if s not in art_blob}
    if art_unreachable:
        fail("D2", f"文章状态无写入路径：{sorted(art_unreachable)}")
    else:
        ok(f"文章三态 {sorted(article_states)} 均有写入路径")

    # ---------- E. 机器强制约束 ----------
    sort_param = spec["components"]["parameters"]["Sort"]["schema"]
    if "enum" not in sort_param:
        fail("E1", "Sort 参数仍未下沉 enum（约束只在散文里，生成器无法强制）")
    else:
        ok(f"Sort 已枚举 {len(sort_param['enum'])} 个合法组合，默认 {sort_param.get('default')}")

    # 可选鉴权写法：security 中同时含 {} 与 bearerAuth
    optional_auth = []
    for p, m, op in ops:
        sec = op.get("security")
        if isinstance(sec, list) and any(s == {} for s in sec) and any(s for s in sec):
            optional_auth.append(f"{m.upper()} {p}")
    if optional_auth:
        ok(f"可选鉴权端点（标准 [{{}}, bearerAuth] 写法）：{len(optional_auth)} 个 -> {optional_auth}")
    else:
        fail("E2", "无端点使用可选鉴权标准写法，view/详情的登录分支不可机读")

    # 过滤参数必须有 description 说明匹配口径
    silent = []
    for name in ("FilterCategory", "FilterTag", "FilterKeyword"):
        prm = spec["components"]["parameters"].get(name)
        if not prm or not prm.get("description"):
            silent.append(name)
    if silent:
        fail("E3", f"过滤参数未定义匹配口径：{silent}")
    else:
        ok("category/tag/keyword 三个过滤参数均已定义匹配口径（共享 $ref，两实现无解释空间）")

    # ---------- 输出 ----------
    print("\n".join(notes))
    print("-" * 72)
    if failures:
        print("语义自查未通过：")
        for f in failures:
            print("  FAIL", f)
        sys.exit(1)
    print("语义自查全部通过（结构 + operationId + 孤儿实体 + 死胡同状态 + 机器强制约束）")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "docs/api/openapi.v1.yaml")
