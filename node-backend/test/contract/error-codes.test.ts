/**
 * test/contract/error-codes.test.ts
 * 契约一致性门禁（审阅 B01 / B07）：用脚本比对 docs/api/openapi.v1.yaml 中每个错误响应的
 * 业务码 ↔ HTTP 状态，断言与 lib/codes.ts 的 HttpForCode 完全一致。
 * 这把"契约加 code 而漏配 / 配错 HTTP"的回归前移到测试阶段。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { type BizErrorCode, ErrCode, HttpForCode } from '@/shared/codes';

interface Spec {
  paths?: Record<string, Record<string, { responses?: Record<string, unknown> }>>;
  components?: { responses?: Record<string, unknown> };
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** 从单个响应对象中抽出全部业务码（兼容 example 单例 与 examples 多例两种写法，如 Unauthorized 含 1004/1002）。 */
const codesOfResponse = (resp: unknown): number[] => {
  if (!isObject(resp)) return [];
  const content = resp.content;
  if (!isObject(content)) return [];
  const json = content['application/json'];
  if (!isObject(json)) return [];

  const codes: number[] = [];
  const example = json.example;
  if (isObject(example) && typeof example.code === 'number') codes.push(example.code);

  const examples = json.examples;
  if (isObject(examples)) {
    for (const key of Object.keys(examples)) {
      const ex = examples[key];
      if (isObject(ex) && isObject(ex.value) && typeof ex.value.code === 'number') {
        codes.push(ex.value.code);
      }
    }
  }
  return codes;
};

const specPath = fileURLToPath(new URL('../../../docs/api/openapi.v1.yaml', import.meta.url));
const spec = parseYaml(readFileSync(specPath, 'utf8')) as Spec;
const responses = spec.components?.responses ?? {};

// 业务码 → 契约中出现的 HTTP 状态集合（同一码应只对应一种状态）
const byCode = new Map<number, Set<number>>();
for (const path of Object.values(spec.paths ?? {})) {
  for (const op of Object.values(path)) {
    const resps = op.responses;
    if (!resps) continue;
    for (const [status, body] of Object.entries(resps)) {
      const http = Number(status);
      if (!Number.isFinite(http)) continue;
      let resp = body;
      if (isObject(body) && typeof body.$ref === 'string') {
        const name = body.$ref.split('/').pop();
        if (name && responses[name]) resp = responses[name];
      }
      const codes = codesOfResponse(resp);
      for (const code of codes) {
        if (code === 0) continue;
        if (!byCode.has(code)) byCode.set(code, new Set());
        byCode.get(code)?.add(http);
      }
    }
  }
}

describe('契约错误码 ↔ HTTP 状态一致性（审阅 B01 / B07）', () => {
  it('HttpForCode 每个业务码都与契约实际 HTTP 状态一致', () => {
    for (const [code, statuses] of byCode) {
      if (code === 0) continue; // 成功码不在 HttpForCode 中
      const mapped = HttpForCode[code as BizErrorCode];
      expect(mapped, `业务码 ${code} 在 HttpForCode 中缺失`).toBeDefined();
      for (const s of statuses) {
        expect(mapped, `业务码 ${code} 契约 HTTP=${s}，但 HttpForCode=${mapped}`).toBe(s);
      }
    }
  });

  it('每个 BizErrorCode 都能在契约响应中找到对应声明', () => {
    for (const code of Object.values(ErrCode)) {
      if (code === 0) continue;
      expect(byCode.has(code), `BizErrorCode ${code} 未在契约响应中出现`).toBe(true);
    }
  });
});
