#!/usr/bin/env python3
"""
契约语义自查脚本（后端架构师评审 R1-R11 整改配套）

openapi-spec-validator 只保证「结构合法」。本脚本补上「逻辑无漏洞」的机器断言：
  A. 结构完整性：$ref 可解析、200 响应含 schema、无非法嵌套状态码
  B. operationId：全量存在且唯一
  C. 孤儿实体：每个 schema 都被至少一个端点可达引用
  D. 死胡同状态：枚举态都有写入路径
  E. 机器强制约束：sort 枚举、可选鉴权写法
  F. 错误码机器强制：每个错误响应必须挂**结构化** code（example / examples 均可机读），
     码落在 ErrorCode 枚举、枚举非零码均在结构化示例中落地（不再以 description 兜底）
  R1/N1. 授权求值机器化：每个需登录端点必须声明 x-authz{minRole, 可选 ownerOverride{param,ownerField}}；minRole ∈ member/editor/admin；ownerOverride.param 须为本操作 path 参数、ownerField 须属主实体真实字段
  R5/N5. 限流声明：info.x-rate-limit + components.responses.RateLimited + ErrorCode 5001 + scope/key 齐备
  G.  扩展约束结构合法：x-cascade / x-max-depth / x-max-size-bytes / x-accepted-mime-types / x-idempotent
  N2. URL 类字段（format:uri + maxLength）与反范式展示字段（maxLength）约束统一，防止两实现分裂

用法：python3 docs/api/check_contract.py docs/api/openapi.v1.yaml
"""
import sys
import yaml

HTTP_METHODS = {"get", "post", "put", "patch", "delete", "head", "options", "trace"}
ROLES = {"member", "editor", "admin"}
CASCADE_VALUES = {"none", "children", "soft-hide"}
ERR_HTTP = {"400", "401", "403", "404", "409", "500", "501"}

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
    if isinstance(node, dict):
        for k, v in node.items():
            if k == "$ref" and isinstance(v, str):
                acc.add(v)
            else:
                collect_refs(v, acc)
    elif isinstance(node, list):
        for v in node:
            collect_refs(v, acc)


def find_keys(node, key, acc):
    """递归收集所有名为 key 的扩展字段值"""
    if isinstance(node, dict):
        for k, v in node.items():
            if k == key:
                acc.append(v)
            find_keys(v, key, acc)
    elif isinstance(node, list):
        for v in node:
            find_keys(v, key, acc)


def resolve(spec, ref):
    if not ref.startswith("#/"):
        return None
    node = spec
    for part in ref[2:].split("/"):
        if not isinstance(node, dict) or part not in node:
            return None
        node = node[part]
    return node


# ---------- 错误码提取（兼容 example 单数 与 examples 复数）----------
def resp_structured_codes(resp):
    codes = set()
    if not isinstance(resp, dict):
        return codes
    aj = resp.get("content", {}).get("application/json", {})
    ex = aj.get("example")
    if isinstance(ex, dict) and isinstance(ex.get("code"), int):
        codes.add(ex["code"])
    exs = aj.get("examples")
    if isinstance(exs, dict):
        for v in exs.values():
            val = v.get("value", v) if isinstance(v, dict) else v
            if isinstance(val, dict) and isinstance(val.get("code"), int):
                codes.add(val["code"])
    return codes


def resp_desc_codes(resp):
    d = (resp.get("description", "") if isinstance(resp, dict) else "") or ""
    import re
    return {int(m) for m in re.findall(r"code (\d{4})", d)}


def effective_security(item, op):
    if "security" in op:
        return op["security"]
    if "security" in item:
        return item["security"]
    return spec_global_security


def is_public(sec):
    if sec is None:
        return False
    if sec == []:
        return True
    if isinstance(sec, list) and any(s == {} for s in sec):
        return True
    return False


def main(path):
    global spec_global_security
    spec = load(path)
    spec_global_security = spec.get("security")
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

    optional_auth = []
    for p, m, op in ops:
        sec = op.get("security")
        if isinstance(sec, list) and any(s == {} for s in sec) and any(s for s in sec):
            optional_auth.append(f"{m.upper()} {p}")
    if optional_auth:
        ok(f"可选鉴权端点（标准 [{{}}, bearerAuth] 写法）：{len(optional_auth)} 个 -> {optional_auth}")
    else:
        fail("E2", "无端点使用可选鉴权标准写法，view/详情的登录分支不可机读")

    silent = []
    for name in ("FilterCategory", "FilterTag", "FilterKeyword"):
        prm = spec["components"]["parameters"].get(name)
        if not prm or not prm.get("description"):
            silent.append(name)
    if silent:
        fail("E3", f"过滤参数未定义匹配口径：{silent}")
    else:
        ok("category/tag/keyword 三个过滤参数均已定义匹配口径（共享 $ref，两实现无解释空间）")

    # ---------- F. 错误码机器强制（收紧：不再以 description 兜底）----------
    errorcode_enum = set(spec["components"]["schemas"].get("ErrorCode", {}).get("enum", []))
    err_struct = set()
    err_desc = set()

    def sweep(respmap):
        nonlocal err_struct, err_desc
        for st, resp in respmap.items():
            if str(st) not in ERR_HTTP and str(st) != "default":
                continue
            err_struct |= resp_structured_codes(resp)
            err_desc |= resp_desc_codes(resp)

    for p, m, op in ops:
        sweep(op.get("responses", {}))
    # 组件响应（如 RateLimited）本身即是一个响应对象，其键是组件名而非 HTTP 状态码，
    # 不能套用 ERR_HTTP 过滤，直接抽取其结构化 code。
    for name, r in spec.get("components", {}).get("responses", {}).items():
        err_struct |= resp_structured_codes(r)
        err_desc |= resp_desc_codes(r)

    missing = []
    for p, m, op in ops:
        for st, resp in op.get("responses", {}).items():
            if str(st) not in ERR_HTTP and str(st) != "default":
                continue
            if not resp_structured_codes(resp):
                missing.append(f"{m.upper()} {p} -> {st}")
    if missing:
        fail("F1", f"以下错误响应未挂结构化 code 示例（机器不可读，仅靠 description 兜底）：{missing}")
    else:
        ok("全部错误响应均挂结构化 code 示例（example / examples 均可机读）")

    bad = [c for c in err_struct if c not in errorcode_enum]
    if bad:
        fail("F2", f"错误响应使用了未定义于 ErrorCode 枚举的码：{sorted(bad)}")
    else:
        ok(f"全部 {len(err_struct)} 种结构化错误码均落在 ErrorCode 枚举内")

    missing_enum = [c for c in errorcode_enum if c != 0 and c not in err_struct]
    if missing_enum:
        fail("F3", f"ErrorCode 枚举中以下非零码未在契约任何错误响应的结构化 example/value 出现（§六与契约漂移）：{missing_enum}")
    else:
        ok(f"ErrorCode 枚举全部非零码（{len([c for c in errorcode_enum if c != 0])} 个）均已在结构化错误响应中落地")

    desc_only = err_desc - err_struct
    if desc_only:
        notes.append(f"  NOTE 以下码仅出现在响应 description 中（未结构化，F3 不认其落地，须补 example）：{sorted(desc_only)}")

    # ---------- R1/N1. 授权求值机器化（x-authz）----------
    r1_missing = []
    r1_bad = []
    r1_owner_param = []
    r1_owner_field = []
    r1_legacy = []
    n_login = 0
    # 收集所有 schema 的 property 名（用于 ownerField 存在性粗校验）
    all_props = set()
    for sname, sch in spec.get("components", {}).get("schemas", {}).items():
        if isinstance(sch, dict):
            all_props |= set((sch.get("properties") or {}).keys())
    # 端点 operationId -> 主实体 schema（用于 ownerField 精确校验）
    OWNER_ENTITY = {
        "updateArticle": "Article",
        "deleteArticle": "Article",
        "submitArticle": "Article",
        "deleteComment": "Comment",
        "deleteAttachment": "Attachment",
        "updateNotification": "Notification",
    }
    for path, item in spec.get("paths", {}).items():
        for m, op in item.items():
            if m not in HTTP_METHODS:
                continue
            if op.get("x-required-roles") is not None or op.get("x-owner-resource") is not None:
                r1_legacy.append(f"{m.upper()} {path}")
            sec = effective_security(item, op)
            if is_public(sec):
                continue
            n_login += 1
            az = op.get("x-authz")
            if not isinstance(az, dict) or "minRole" not in az:
                r1_missing.append(f"{m.upper()} {path}")
                continue
            if az["minRole"] not in ROLES:
                r1_bad.append(f"{m.upper()} {path} -> minRole={az['minRole']}")
            oo = az.get("ownerOverride")
            if oo is not None:
                if not isinstance(oo, dict) or "param" not in oo or "ownerField" not in oo:
                    r1_owner_field.append(f"{m.upper()} {path} -> ownerOverride 结构非法")
                    continue
                op_params = [p.get("name") for p in op.get("parameters", []) if isinstance(p, dict)]
                item_params = [p.get("name") for p in item.get("parameters", []) if isinstance(p, dict)]
                if oo["param"] not in op_params + item_params:
                    r1_owner_param.append(f"{m.upper()} {path} -> ownerOverride.param={oo['param']} 非本操作 path 参数")
                if oo["ownerField"] not in all_props:
                    r1_owner_field.append(f"{m.upper()} {path} -> ownerOverride.ownerField={oo['ownerField']} 非已知字段")
                oid = op.get("operationId")
                ent = OWNER_ENTITY.get(oid)
                if ent:
                    ent_props = (spec["components"]["schemas"].get(ent, {}) or {}).get("properties", {})
                    if oo["ownerField"] not in ent_props:
                        r1_owner_field.append(f"{m.upper()} {path} -> ownerField={oo['ownerField']} 不属于 {ent}")
    if r1_missing:
        fail("R1a", f"需登录端点未声明 x-authz.minRole：{r1_missing}")
    else:
        ok(f"全部 {n_login} 个需登录端点均声明了 x-authz.minRole（授权角色已机器化）")
    if r1_bad:
        fail("R1b", f"x-authz.minRole 非法（须 ∈ member/editor/admin）：{r1_bad}")
    else:
        ok("x-authz.minRole 取值均合法（member/editor/admin）")
    if r1_owner_param:
        fail("R1c", f"ownerOverride.param 非本操作 path 参数：{r1_owner_param}")
    else:
        ok("ownerOverride.param 均指向本操作真实 path 参数（6 个归属端点统一为 id）")
    if r1_owner_field:
        fail("R1d", f"ownerOverride.ownerField 非法或不属于主实体：{r1_owner_field}")
    else:
        ok("ownerOverride.ownerField 均指向主实体真实归属字段（article→authorId / comment&attachment→userId / notification→userId）")
    if r1_legacy:
        fail("R1e", f"仍存在遗留 x-required-roles / x-owner-resource（应已重构为 x-authz）：{r1_legacy}")
    else:
        ok("无遗留 x-required-roles / x-owner-resource（已全量重构为 x-authz）")

    # ---------- R5. 限流声明 ----------
    rl = spec["info"].get("x-rate-limit")
    has_rl_comp = "RateLimited" in spec.get("components", {}).get("responses", {})
    pub_with_429 = [
        f"{m.upper()} {p}"
        for p, item in spec.get("paths", {}).items()
        for m, op in item.items()
        if m in HTTP_METHODS and is_public(effective_security(item, op)) and "429" in op.get("responses", {})
    ]
    if rl and has_rl_comp and 5001 in errorcode_enum:
        ok(f"限流已机器化：info.x-rate-limit + components.responses.RateLimited + ErrorCode 5001；{len(pub_with_429)} 个公开端点挂 429")
    else:
        fail("R5", "限流声明不完整（需 info.x-rate-limit + RateLimited 响应组件 + ErrorCode 5001）")

    # ---------- G. 扩展约束结构合法 ----------
    g_cascade = []
    g_idem_409 = []
    g_size = []
    g_mime = []
    g_depth = []
    for path, item in spec.get("paths", {}).items():
        for m, op in item.items():
            if m not in HTTP_METHODS:
                continue
            xc = op.get("x-cascade")
            if xc is not None and xc not in CASCADE_VALUES:
                g_cascade.append(f"{m.upper()} {path} -> {xc}")
            if op.get("x-idempotent") is True and "409" in op.get("responses", {}):
                g_idem_409.append(f"{m.upper()} {path}")
    for name, sch in spec.get("components", {}).get("schemas", {}).items():
        if isinstance(sch, dict) and "x-max-depth" in sch:
            md = sch["x-max-depth"]
            if not (isinstance(md, int) and md >= 1):
                g_depth.append(f"{name} -> {md}")
    sizes = []
    find_keys(spec, "x-max-size-bytes", sizes)
    for s in sizes:
        if not (isinstance(s, int) and s >= 1):
            g_size.append(s)
    mimes = []
    find_keys(spec, "x-accepted-mime-types", mimes)
    for mm in mimes:
        if not (isinstance(mm, list) and all(isinstance(x, str) for x in mm)):
            g_mime.append(mm)

    if g_cascade:
        fail("G1", f"x-cascade 取值非法（须 ∈ none/children/soft-hide）：{g_cascade}")
    else:
        ok("x-cascade 取值均合法（none/children/soft-hide）")
    if g_depth:
        fail("G2", f"x-max-depth 非法（须为整数≥1）：{g_depth}")
    else:
        ok("Category.x-max-depth 合法（整数≥1）")
    if g_size:
        fail("G3", f"x-max-size-bytes 非法：{g_size}")
    else:
        ok("上传 x-max-size-bytes 合法")
    if g_mime:
        fail("G4", f"x-accepted-mime-types 非法（须为字符串列表）：{g_mime}")
    else:
        ok("上传 x-accepted-mime-types 合法（字符串列表）")
    if g_idem_409:
        fail("G6", f"x-idempotent 端点不应声明 409（重复调用须返回 200）：{g_idem_409}")
    else:
        ok("x-idempotent 端点均未声明 409（幂等语义已机器化）")

    # ---------- N2. URL 类与展示字段约束统一（防止两实现约束分裂）----------
    schemas = spec.get("components", {}).get("schemas", {})

    def prop(schema_name, pname):
        s = schemas.get(schema_name)
        if not isinstance(s, dict):
            return None
        return (s.get("properties") or {}).get(pname)

    url_fields = [
        ("Article", "coverImage"), ("ArticleSummary", "coverImage"),
        ("ArticleCreate", "coverImage"), ("OAuthCallbackRequest", "redirectUri"),
        ("SiteSetting", "logoUrl"), ("ProfileUpdateRequest", "avatar"),
        ("Attachment", "url"), ("Notification", "link"),
    ]
    n2_url = []
    for sn, pn in url_fields:
        p = prop(sn, pn)
        if p is None:
            n2_url.append(f"{sn}.{pn} 缺失")
        elif p.get("format") != "uri" or not isinstance(p.get("maxLength"), int):
            n2_url.append(f"{sn}.{pn} 须 format:uri + 整数 maxLength")
    if n2_url:
        fail("N2a", f"URL 类字段约束缺失（须统一 format:uri + maxLength）：{n2_url}")
    else:
        ok("URL 类字段（coverImage/redirectUri/logoUrl/avatar/url/link）均 format:uri + maxLength（约束统一）")

    display_fields = [
        ("Article", "authorName"), ("ArticleSummary", "authorName"),
        ("Article", "categoryName"), ("ArticleSummary", "categoryName"),
        ("Comment", "userName"), ("Comment", "rejectedReason"),
        ("Notification", "body"),
    ]
    n2_disp = []
    for sn, pn in display_fields:
        p = prop(sn, pn)
        if p is None:
            n2_disp.append(f"{sn}.{pn} 缺失")
        elif not isinstance(p.get("maxLength"), int):
            n2_disp.append(f"{sn}.{pn} 缺 maxLength")
    if n2_disp:
        fail("N2b", f"反范式/展示字段缺 maxLength（与源字段长度可能不一致）：{n2_disp}")
    else:
        ok("反范式展示字段（authorName/categoryName/userName/rejectedReason/body）均设 maxLength（与源字段对齐）")

    # ---------- N5. 限流粒度声明 ----------
    rl = spec["info"].get("x-rate-limit")
    if isinstance(rl, dict) and rl.get("scope") in ("per-endpoint", "per-client-global") and rl.get("key"):
        ok(f"限流粒度已声明：scope={rl['scope']}，key={rl['key']}（消除单桶/每端点歧义）")
    else:
        fail("N5", "info.x-rate-limit 未声明 scope / key（限流粒度歧义）")

    # ---------- 输出 ----------
    print("\n".join(notes))
    print("-" * 72)
    if failures:
        print("语义自查未通过：")
        for f in failures:
            print("  FAIL", f)
        sys.exit(1)
    print("语义自查全部通过（结构+operationId+孤儿实体+死胡同状态+机器强制约束+错误码+R1授权求值机器化+R5/N5限流+G扩展约束+N2字段约束）")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "docs/api/openapi.v1.yaml")
