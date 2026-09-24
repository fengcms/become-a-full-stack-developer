/**
 * @file app/(public)/members/[id]/page.tsx
 * @description 会员公开主页：展示会员资料 + 其 published 文章列表。
 *   ISR（revalidate: 10min）。
 * @module web-frontend/app/(public)/members
 * @date 2026-09-16
 */

import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import ArticleCard from '@/components/article/ArticleCard'
import { getMemberProfile, type MemberProfile } from '@/lib/api'

/** 会员主页缓存策略：10 分钟重新验证。 */
export const revalidate = 600

interface MemberPageProps {
  params: Promise<{ id: string }>
}

const MemberPage = async ({ params }: MemberPageProps) => {
  const { id } = await params

  let member: MemberProfile | undefined
  try {
    member = await getMemberProfile(id)
  } catch {
    member = undefined
  }

  if (!member) {
    notFound()
  }

  const articles = member.articles ?? []

  return (
    <div className="mx-auto max-w-content px-6 py-12">
      {/* 会员资料卡 */}
      <header className="mb-10 flex items-center gap-5">
        {member.avatar ? (
          <Image
            src={member.avatar}
            alt={member.nickname}
            width={64}
            height={64}
            className="h-16 w-16 rounded-full border border-line object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-line bg-hover text-2xl text-ink-faint">
            {member.nickname.charAt(0)}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{member.nickname}</h1>
          <p className="mt-1 text-sm text-ink-faint">
            Lv.{member.level} · {member.articleCount} 篇文章
          </p>
        </div>
      </header>

      {/* 文章列表 */}
      <div className="mb-6 border-b border-line pb-3 text-xs uppercase tracking-wider text-ink-faint">
        TA 的文章
      </div>

      {articles.length > 0 ? (
        <div className="divide-y divide-line">
          {articles.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      ) : (
        <div className="py-16 text-center text-ink-faint">暂无公开文章</div>
      )}

      <div className="mt-8">
        <Link href="/" className="text-sm text-ink-soft no-underline hover:text-accent">
          ← 返回首页
        </Link>
      </div>
    </div>
  )
}

export default MemberPage
