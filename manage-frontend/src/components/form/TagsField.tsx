/**
 * @file src/components/form/TagsField.tsx
 * @description 标签输入：回车 / 逗号分隔成 chip，点击 × 移除。受控组件 value:string[]。
 *   与 RHF 配合时由调用方用 Controller 包一层。
 * @module manage-frontend/components/form
 * @date 2026-08-29
 */

import { X } from 'lucide-react'
import { useState } from 'react'
import { FormField } from './FormField'

/** 标签输入受控组件入参。 */
export interface TagsFieldProps {
  /** 当前标签列表。 */
  value: string[]
  /** 变化回调（返回最新标签列表）。 */
  onChange: (tags: string[]) => void
  /** 标签。 */
  label?: string
  /** 输入占位。 */
  placeholder?: string
  /** 辅助说明。 */
  description?: string
}

/**
 * 标签输入（chip 形式）。
 */
export const TagsField = ({ value, onChange, label, placeholder, description }: TagsFieldProps) => {
  const [draft, setDraft] = useState('')

  /** 把输入按逗号拆分并去重追加到现有标签。 */
  const add = (raw: string) => {
    const next = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (next.length === 0) return
    const merged = [...value]
    for (const t of next) if (!merged.includes(t)) merged.push(t)
    onChange(merged)
    setDraft('')
  }

  /** 移除单个标签。 */
  const remove = (t: string) => onChange(value.filter((x) => x !== t))

  return (
    <FormField label={label} htmlFor="tags" description={description}>
      <div className="flex flex-wrap gap-2 rounded-md border border-input p-2">
        {value.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-sm"
          >
            {t}
            <button
              type="button"
              onClick={() => remove(t)}
              className="text-muted-foreground hover:text-foreground"
              aria-label={`移除 ${t}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          id="tags"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              add(draft)
            }
          }}
          onBlur={() => add(draft)}
          placeholder={placeholder ?? '输入后回车添加'}
          className="min-w-[8rem] flex-1 bg-transparent text-sm outline-none"
        />
      </div>
    </FormField>
  )
}
