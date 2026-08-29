/**
 * @file src/hooks/useSite.ts
 * @description 站点级只读数据。hooks 层把 api 函数与 queryKey 绑在一起，
 *   组件里只 `const { data } = useSiteStats()`，不接触 queryKey 字符串。
 * @module manage-frontend/hooks
 * @date 2026-08-29
 */

import { useQuery } from '@tanstack/react-query'
import { getCategoryStats, getPublicSiteSettings, getSiteStats } from '@/api/site'
import { qk } from '@/lib/queryClient'

/**
 * 站点品牌信息（公开）。侧栏标题、浏览器标题用。
 * 站点设置未配置时后端会稳定返回 5000（缺种子行），重试无意义，关闭重试回落默认品牌名。
 */
export const usePublicSiteSettings = () =>
  useQuery({
    queryKey: qk.site.publicSettings,
    queryFn: getPublicSiteSettings,
    staleTime: 10 * 60_000, // 品牌几乎不变，缓存久一点
    retry: false,
  })

/**
 * 全站聚合统计（公开）。仪表盘四个数字卡片用。
 */
export const useSiteStats = () =>
  useQuery({
    queryKey: qk.site.stats,
    queryFn: getSiteStats,
  })

/**
 * 分类文章数（公开）。仪表盘分布图用。
 */
export const useCategoryStats = () =>
  useQuery({
    queryKey: qk.site.categoryStats,
    queryFn: getCategoryStats,
  })
