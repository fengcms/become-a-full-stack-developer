/**
 * @file src/components/dashboard/StatsChart.tsx
 * @description 仪表盘分类文章分布图（recharts 环形饼图）。数据来自公开端点 /categories/stats。
 *   抽成独立组件，避免图表逻辑撑进 DashboardPage；计划 Phase 5 明确要求「图表拆 StatsChart」。
 * @module manage-frontend/components/dashboard
 * @date 2026-08-29
 */

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { CategoryStat } from '@/types/common'

/** 分类扇区调色板（环形图循环取色）。明暗主题下都保证可读。 */
const PALETTE = [
  'hsl(221 83% 53%)',
  'hsl(262 83% 58%)',
  'hsl(199 89% 48%)',
  'hsl(160 84% 39%)',
  'hsl(38 92% 50%)',
  'hsl(0 72% 51%)',
  'hsl(291 64% 52%)',
  'hsl(173 80% 36%)',
]

/**
 * 分类文章分布环形图。
 * @param data - 各分类文章数（CategoryStat[]）。
 */
export const StatsChart = ({ data }: { data: CategoryStat[] }) => (
  <div className="h-64 w-full">
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="articleCount"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={42}
          outerRadius={80}
          paddingAngle={2}
        >
          {data.map((item, i) => (
            <Cell key={item.id} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value) => `${value} 篇`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  </div>
)
