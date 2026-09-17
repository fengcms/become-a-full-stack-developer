/**
 * @file components/layout/Footer.tsx
 * @description 公开区页脚：站点描述 + 版权信息。
 *   极简编辑风：顶部细分割线、居中窄栏、淡色文字。
 *   RSC：拉取站点配置；年份用服务器时间（ISR 重新验证时更新）。
 * @module web-frontend/components/layout
 * @date 2026-09-16
 */

import { getSiteSettings, type SiteSetting } from '@/lib/api'

const Footer = async () => {
  const site = await getSiteSettings().catch<SiteSetting | null>(() => null)
  const siteName = site?.siteName ?? '成为全栈开发工程师'
  const description = site?.siteDescription
  const year = new Date().getFullYear()
  const copyright = site?.copyright ?? `© ${year} ${siteName}`

  return (
    <footer className="mt-auto border-t border-line bg-surface">
      <div className="mx-auto max-w-content px-6 py-10 text-center text-sm text-ink-faint">
        {description && <p className="mb-2">{description}</p>}
        <p>{copyright}</p>
      </div>
    </footer>
  )
}

export default Footer
