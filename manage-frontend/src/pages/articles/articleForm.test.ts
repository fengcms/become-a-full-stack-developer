/**
 * @file pages/articles/articleForm.test.ts
 * @description 写作回归：保存已有状态与空字段契约、中文层级及校验定位依据。
 */
import { describe, expect, it } from 'vitest'
import { articlePayload, articleSchema, articleToForm, categoryOptions } from './articleForm'

describe('写作数据边界', () => {
  it.each(['published', 'pending', 'draft'] as const)(
    '普通保存保留 %s 状态，空可选字段使用 null',
    (status) => {
      const values = { ...articleToForm(), title: '修正错字', content: '仍然保留正文' }
      expect(articlePayload(values, status, 'original-slug')).toMatchObject({
        status,
        slug: 'original-slug',
        summary: null,
        coverImage: null,
        categoryId: null,
      })
    },
  )
  it('全空白标题和正文不会成为看似保存成功的空稿件', () => {
    const result = articleSchema.safeParse({ ...articleToForm(), title: '  ', content: '\n  ' })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(result.error.issues.map((issue) => issue.path[0])).toEqual(['title', 'content'])
  })
  it('同名分类通过完整父路径区分', () => {
    const options = categoryOptions([
      { id: 1, name: '前端', children: [{ id: 2, name: '基础' }] },
      { id: 3, name: '后端', children: [{ id: 4, name: '基础' }] },
    ])
    expect(
      options.filter((option) => option.label.endsWith('基础')).map((option) => option.label),
    ).toEqual(['前端 / 基础', '后端 / 基础'])
  })
})
