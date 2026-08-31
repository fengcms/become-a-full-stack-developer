/**
 * @file src/components/form/FilterSelect.tsx
 * @description 列表筛选栏专用下拉（替代此前各处手写的原生 `<select>`）。
 *   基于 shadcn Select 封装：与表单内的 SelectField 视觉一致（浅色白底、圆角、高度 36），
 *   弹层走 Portal，不受列表容器 overflow 影响，暗色模式也跟随主题。
 *
 *   注意：Radix Select 的 Item 不允许 value 为空串，因此「全部/不限」统一用哨兵值
 *   `ALL`（默认 `'all'`），由调用方把它映射回 `undefined`（即不加该筛选条件）。
 * @module manage-frontend/components/form
 * @date 2026-08-31
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

/** 「不限」哨兵值：Radix 不允许空串 value，用它以区分「未选」与「清空筛选」。 */
export const FILTER_ALL = 'all'

/** 筛选项。 */
export interface FilterOption {
  /** 选项值（不可为空串）。 */
  value: string
  /** 显示文案。 */
  label: string
}

/** 筛选下拉入参。 */
export interface FilterSelectProps {
  /** 当前值（未筛选时传 FILTER_ALL）。 */
  value: string
  /** 选中回调，回传选项 value。 */
  onChange: (value: string) => void
  /** 选项列表。 */
  options: FilterOption[]
  /** 未选中的占位文案（放在选项里也行，这里用于兜底）。 */
  placeholder?: string
  /** 无障碍名称（筛选栏没有可见 label，靠它描述用途）。 */
  ariaLabel: string
  /** 附加类名，主要用来定宽度。 */
  className?: string
}

/**
 * 列表筛选下拉。
 */
export const FilterSelect = ({
  value,
  onChange,
  options,
  placeholder = '全部',
  ariaLabel,
  className,
}: FilterSelectProps) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger aria-label={ariaLabel} className={cn('w-[9rem]', className)}>
      <SelectValue placeholder={placeholder} />
    </SelectTrigger>
    <SelectContent>
      {options.map((o) => (
        <SelectItem key={o.value} value={o.value}>
          {o.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
)
