/** @file Regression tests for real boundary errors: URL safety, category mapping, headings, cookies. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { assignHeadings, type MarkdownNode } from '../lib/headings.ts'
import { backendCookie, frontendCookie } from '../lib/proxy-utils.ts'
import { flattenCategories, jsonLd, pageNumber, safeLink, safeReturn } from '../lib/utils.ts'

test('login returns cannot escape the site or loop into login', () => {
  for (const value of [
    'https://evil.test',
    '//evil.test',
    '/%2fevil.test',
    '/\\evil.test',
    '/login?redirect=/login',
    '/%5cevil.test',
  ])
    assert.equal(safeReturn(value), '/member/favorites')
  assert.equal(safeReturn('/articles/1?from=search#comments'), '/articles/1?from=search#comments')
})
test('unsafe configurable links are discarded', () => {
  for (const link of ['javascript:alert(1)', 'data:text/html,test', '//evil.test'])
    assert.equal(safeLink(link), undefined)
  assert.equal(safeLink('/about'), '/about')
})
test('category ID mapping visits all four levels', () => {
  const tree = [
    {
      id: 1,
      slug: 'root',
      children: [
        {
          id: 2,
          slug: 'child',
          children: [{ id: 3, slug: 'third', children: [{ id: 4, slug: 'fourth' }] }],
        },
      ],
    },
  ]
  assert.equal(flattenCategories(tree).find((c) => c.id === 4)?.slug, 'fourth')
})
test('heading IDs match actual rendered heading text and handle collisions', () => {
  const heading = (text: string): MarkdownNode => ({
    type: 'element',
    tagName: 'h2',
    children: [{ type: 'text', value: text }],
  })
  const tree: MarkdownNode = {
    type: 'root',
    children: [
      heading('中文标题'),
      heading('中文标题'),
      heading('中文标题-1'),
      { type: 'element', tagName: 'pre', children: [{ type: 'text', value: '## not a heading' }] },
    ],
  }
  assert.deepEqual(
    assignHeadings(tree).map((h) => h.id),
    ['中文标题', '中文标题-1', '中文标题-1-1'],
  )
  assert.equal(tree.children?.[0].properties?.id, '中文标题')
})
test('new frontend does not forward or delete old frontend cookies', () => {
  assert.equal(
    backendCookie('refreshToken=old; codex_refresh=new; theme=light'),
    'refreshToken=new',
  )
  assert.equal(backendCookie('refreshToken=old'), '')
  const cookie = 'refreshToken=rotated; HttpOnly; SameSite=None; Secure; Path=/'
  assert.equal(
    frontendCookie(cookie, '127.0.0.1'),
    'codex_refresh=rotated; HttpOnly; SameSite=Lax; Path=/',
  )
  assert.match(frontendCookie(cookie, 'example.com'), /; Secure;/)
})
test('pagination and JSON-LD safely handle untrusted values', () => {
  for (const v of ['0', '-1', 'abc', '1.5', '999999999999999999']) assert.equal(pageNumber(v), 1)
  assert.equal(pageNumber('2'), 2)
  assert.ok(!jsonLd({ text: '</script><script>alert(1)</script>' }).includes('<'))
})
