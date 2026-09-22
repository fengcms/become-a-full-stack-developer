/** Read-only route and metadata smoke checks for both local runtimes. */
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'

const paths = [
  '/',
  '/articles',
  '/articles?page=2&sort=-viewCount',
  '/categories',
  '/categories/frontend',
  '/categories/components',
  '/tags',
  '/tags/react',
  '/search?q=React',
  '/search?q=absent-unique-query',
  '/search?q=admin&type=member',
  '/members/1',
  '/about',
  '/articles/practice-23',
  '/login',
  '/register',
  '/member/favorites',
  '/member/history',
  '/member/likes',
  '/member/articles',
  '/member/notifications',
  '/member/profile',
  '/member/password',
  '/robots.txt',
  '/sitemap.xml',
  '/does-not-exist',
  '/articles/missing-article',
]
const report = []
for (const port of [13001, 13002]) {
  for (const path of paths) {
    const res = await fetch(`http://127.0.0.1:${port}${path}`)
    const text = await res.text()
    if (path.includes('does-not-exist') || path.includes('missing-article')) {
      // Streaming may send HTTP 200 before notFound; the noindex 404 UI must still be rendered.
      assert.match(text, /这篇内容暂时找不到/)
      assert.match(text, /noindex/)
    } else {
      assert.equal(res.status, 200, `${port}${path}`)
      assert.doesNotMatch(text, /Application error|Internal Server Error/)
    }
    if (path === '/articles/practice-23') {
      assert.match(text, /application\/ld\+json/)
      assert.match(text, /rel="canonical"/)
      assert.match(text, /id="从约定到落地-1"/)
    }
    if (path.startsWith('/member/') || path.startsWith('/search')) assert.match(text, /noindex/)
    if (path === '/sitemap.xml') {
      assert.match(text, /practice-1</)
      assert.match(text, /practice-24</)
      assert.doesNotMatch(text, /\/member\//)
    }
    report.push({ port, path, status: res.status, passed: true })
  }
  const api = await fetch(`http://127.0.0.1:${port}/api/v1/articles?page=2&pageSize=2`)
  assert.match(api.headers.get('cache-control'), /no-store/)
  assert.equal((await api.json()).data.pagination.page, 2)
  console.log(`PASS ${port}: ${paths.length} routes, metadata, sitemap and uncached proxy`)
}
writeFileSync('.local/smoke-report.json', JSON.stringify(report, null, 2))
