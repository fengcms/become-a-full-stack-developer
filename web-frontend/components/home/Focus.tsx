/** @file Manual focus carousel; no autoplay and no fabricated content. */
'use client'
import Link from 'next/link'
import { useState } from 'react'
import { Picture } from '@/components/ui/Picture'
import { type ArticleSummary, articleUrl } from '@/lib/utils'
/** Focus carousel supports keyboard-native buttons and reduced motion by default. */
export const Focus = ({ articles }: { articles: ArticleSummary[] }) => {
  const [index, setIndex] = useState(0)
  const item = articles[index]
  return (
    <section
      className={`homehero ${item?.coverImage ? 'with-cover' : ''}`}
      aria-label="焦点文章"
      aria-roledescription="轮播"
    >
      {item?.coverImage && (
        <div className="focus-cover">
          <Picture hero src={item.coverImage} alt="" />
        </div>
      )}
      <div className="focus-copy">
        <span className="eyebrow">{item?.categoryName || '系列教程 · 持续更新'}</span>
        <h1>
          {item ? (
            <Link href={articleUrl(item)}>{item.title}</Link>
          ) : (
            '用一个真实系统，串起全栈开发的每一步'
          )}
        </h1>
        <p>{item?.summary || '从接口设计，到工程落地与部署上线。'}</p>
        {!item && <Link href="/about">了解这个系列 →</Link>}
        {articles.length > 1 && (
          <div className="carousel-controls">
            <button
              type="button"
              aria-label="上一篇焦点"
              onClick={() => setIndex((index - 1 + articles.length) % articles.length)}
            >
              ←
            </button>
            <div className="dots">
              {articles.map((a, i) => (
                <button
                  key={a.id}
                  type="button"
                  className={i === index ? 'selected' : ''}
                  aria-label={`查看焦点 ${i + 1}：${a.title}`}
                  aria-pressed={i === index}
                  onClick={() => setIndex(i)}
                />
              ))}
            </div>
            <button
              type="button"
              aria-label="下一篇焦点"
              onClick={() => setIndex((index + 1) % articles.length)}
            >
              →
            </button>
            <span className="sr-only" aria-live="polite">
              第 {index + 1} 张，共 {articles.length} 张
            </span>
          </div>
        )}
      </div>
    </section>
  )
}
