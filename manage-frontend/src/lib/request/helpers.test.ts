/**
 * @file src/lib/request/helpers.test.ts
 * @description fileUrl 的冒烟测试。
 *
 * 为什么单独钉住这条：契约里 attachment.url 形如 `/files/{key}`，挂在后端**根路径**，
 * 不在 `/api/v1` 下。一旦有人"顺手"按 API_BASE 拼接，得到 `/api/v1/files/xxx`，
 * 结果就是全站图片稳定 404 —— 而且是那种本地看不出来、上线才炸的坑。
 * @module manage-frontend/lib/request
 * @date 2026-08-29
 */

import { describe, expect, it } from 'vitest'
import { fileUrl } from '@/lib/request/helpers'

describe('fileUrl 附件地址修正', () => {
  /** 契约给出的 /files/{key} 必须原样保留。 */
  it('契约返回的 /files/{key} 原样保留，绝不补 /api/v1 前缀', () => {
    expect(fileUrl('/files/2026/08/cover.png')).toBe('/files/2026/08/cover.png')
    expect(fileUrl('/files/2026/08/cover.png')).not.toContain('/api/v1')
  })

  /** 少了前导斜杠会变成相对当前路由的路径，必须补上。 */
  it('缺少前导斜杠的相对路径补齐为根路径', () => {
    expect(fileUrl('files/a.png')).toBe('/files/a.png')
  })

  /** 已经是完整地址时不要二次加工。 */
  it('绝对地址与协议相对地址原样透传', () => {
    expect(fileUrl('https://cdn.example.com/x.png')).toBe('https://cdn.example.com/x.png')
    expect(fileUrl('http://cdn.example.com/x.png')).toBe('http://cdn.example.com/x.png')
    expect(fileUrl('//cdn.example.com/x.png')).toBe('//cdn.example.com/x.png')
  })

  /** 空值统一收敛成空串，调用方可直接塞进 src 而不必再判空。 */
  it('空值统一返回空串', () => {
    expect(fileUrl(null)).toBe('')
    expect(fileUrl(undefined)).toBe('')
    expect(fileUrl('')).toBe('')
  })
})
