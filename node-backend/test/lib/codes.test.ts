/**
 * test/lib/codes.test.ts
 * 错误码映射单测（审阅 B07）：验证 ErrCode / ErrorMessages / HttpForCode 三者自洽，
 * 且审阅 B01 修复后 VALIDATION 对应 HTTP 400（契约口径）。
 */
import { describe, expect, it } from 'vitest';
import { type BizErrorCode, ErrCode, ErrorMessages, HttpForCode } from '@/shared/codes';

describe('错误码映射', () => {
  it('VALIDATION 的 HTTP 状态为 400（契约口径，审阅 B01）', () => {
    expect(HttpForCode[ErrCode.VALIDATION]).toBe(400);
  });

  it('授权相关码均映射到 401，FORBIDDEN 为 403', () => {
    expect(HttpForCode[ErrCode.TOKEN_MISSING]).toBe(401);
    expect(HttpForCode[ErrCode.TOKEN_INVALID]).toBe(401);
    expect(HttpForCode[ErrCode.REFRESH_TOKEN_INVALID]).toBe(401);
    expect(HttpForCode[ErrCode.USERNAME_OR_PASSWORD_ERROR]).toBe(401);
    expect(HttpForCode[ErrCode.FORBIDDEN]).toBe(403);
  });

  it('NOT_FOUND=404 / CONFLICT 族=409 / INTERNAL=500 / RATE_LIMITED=429', () => {
    expect(HttpForCode[ErrCode.NOT_FOUND]).toBe(404);
    expect(HttpForCode[ErrCode.CONFLICT]).toBe(409);
    expect(HttpForCode[ErrCode.STATE_CONFLICT]).toBe(409);
    expect(HttpForCode[ErrCode.INTERNAL]).toBe(500);
    expect(HttpForCode[ErrCode.RATE_LIMITED]).toBe(429);
  });

  it('每个业务码都有文案与 HTTP 映射（无遗漏）', () => {
    const codes = Object.values(ErrCode).filter((c): c is BizErrorCode => c !== 0);
    for (const code of codes) {
      expect(ErrorMessages[code], `code ${code} 缺文案`).toBeDefined();
      expect(HttpForCode[code], `code ${code} 缺 HTTP 映射`).toBeDefined();
    }
  });
});
