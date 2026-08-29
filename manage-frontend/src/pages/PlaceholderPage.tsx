/**
 * @file src/pages/PlaceholderPage.tsx
 * @description 待建模块的占位页。
 *
 * 为什么要有这东西：首波交付的是骨架（请求层 / 权限 / 路由 / 布局），
 * 业务模块随后逐篇落地。占位页让路由表和菜单从第一天起就是完整的、可点的，
 * 而不是点进去白屏——白屏分不清「没做」和「做坏了」。
 * @module manage-frontend/pages
 * @date 2026-08-29
 */

import { Construction } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent } from '@/components/ui/card'

/**
 * 通用占位页。
 * @param title - 模块标题。
 * @param description - 模块说明，可空。
 * @param endpoints - 该模块将要对接的契约端点，写在页面上当施工图，可空。
 */
export const PlaceholderPage = ({
  title,
  description,
  endpoints,
}: {
  title: string
  description?: string
  /** 该模块将要对接的契约端点，写在页面上当施工图 */
  endpoints?: string[]
}) => (
  <div>
    <PageHeader title={title} description={description} />
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Construction className="size-5" aria-hidden />
        </div>
        <div>
          <p className="text-sm font-medium">该模块尚未开发</p>
          <p className="mt-1 text-sm text-muted-foreground">
            路由与权限已就位，页面实现随对应篇目逐步落地。
          </p>
        </div>
        {endpoints?.length ? (
          <div className="mt-2 w-full max-w-md rounded-lg border border-border bg-muted/40 p-3 text-left">
            <p className="mb-2 text-xs font-medium text-muted-foreground">计划对接端点</p>
            <ul className="space-y-1">
              {endpoints.map((e) => (
                <li key={e} className="font-mono text-xs text-muted-foreground/80">
                  {e}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  </div>
)
