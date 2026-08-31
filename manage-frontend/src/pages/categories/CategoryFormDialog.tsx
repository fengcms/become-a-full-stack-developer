/**
 * @file src/pages/categories/CategoryFormDialog.tsx
 * @description 分类新建 / 编辑表单。editor+ 可见。
 *
 * 两处刻意的设计：
 *   1. **父级下拉排除自身及子孙**——把分类挂到自己的子孙下会成环，后端返回 409。
 *      与其等提交后报错，不如在选项里就不给这个机会。
 *   2. **编辑时显式回传 parentId**——契约 `CategoryNode` 没有 parentId 字段，
 *      父子关系靠 `children` 嵌套表达；这里从树结构反推 `id → parentId`
 *      后回填（见 categoryTree.ts 头注释）。
 *      ⚠️ 后端已修（node-backend-v1.0.1）：PUT 现为**局部更新**，
 *      省略 parentId / description / sortOrder 会保留原值（openapi.v1.yaml:1541-1542），
 *      不再静默挪根。前端仍显式回传，属双保险——即便后端语义回退也不踩坑。
 *
 * 不做「名称自动生成 slug」：本专栏分类名以中文为主，中文无法转成合法 slug
 * （契约正则 `^[a-z0-9-]{1,64}$`），自动生成只会产出空串或乱码，不如让人填。
 * @module manage-frontend/pages/categories
 * @date 2026-08-29
 */

import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import type { CategoryUpsert } from '@/api/categories'
import { SelectField } from '@/components/form/SelectField'
import { TextAreaField } from '@/components/form/TextAreaField'
import { TextField } from '@/components/form/TextField'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { CategoryNode } from '@/types/common'
import { buildParentMap, collectSubtreeIds, flattenTreeOptions } from './categoryTree'

/** slug 规则与契约 `Category.slug` 的 pattern 完全一致。 */
const SLUG_PATTERN = /^[a-z0-9-]{1,64}$/

/** 表单校验 schema。 */
const schema = z.object({
  name: z.string().min(1, '名称必填').max(50, '名称最多 50 字'),
  slug: z
    .string()
    .min(1, 'slug 必填')
    .max(64, 'slug 最多 64 字符')
    .regex(SLUG_PATTERN, 'slug 只能含小写字母、数字与连字符，如 frontend-basics'),
  description: z.string().max(500, '描述最多 500 字'),
  /** 下拉用字符串承载，空串表示顶级分类 */
  parentId: z.string(),
  sortOrder: z.string(),
})

/** 表单值类型。 */
type FormValues = z.infer<typeof schema>

/**
 * 分类表单弹窗。
 * @param open - 是否打开。
 * @param onOpenChange - 打开状态变更回调（提交中忽略）。
 * @param node - 编辑态节点；null 表示新建。
 * @param presetParentId - 新建时的预设父级（点「新建子分类」时带入）。
 * @param tree - 整棵分类树，用于父级下拉与反推 parentId。
 * @param loading - 提交中。
 * @param onSubmit - 提交回调。
 */
export const CategoryFormDialog = ({
  open,
  onOpenChange,
  node,
  presetParentId,
  tree,
  loading,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  node: CategoryNode | null
  presetParentId: number | null
  tree: CategoryNode[]
  loading: boolean
  onSubmit: (payload: CategoryUpsert) => void
}) => {
  const form = useForm<FormValues>({
    mode: 'onTouched',
    resolver: zodResolver(schema),
    defaultValues: { name: '', slug: '', description: '', parentId: '', sortOrder: '0' },
  })

  const parentMap = useMemo(() => buildParentMap(tree), [tree])
  // 编辑时，自身及子孙都不能作为父级候选
  const options = useMemo(
    () => flattenTreeOptions(tree, node ? new Set(collectSubtreeIds(node)) : new Set()),
    [tree, node],
  )

  useEffect(() => {
    if (!open) return
    if (node) {
      form.reset({
        name: node.name ?? '',
        slug: node.slug ?? '',
        description: node.description ?? '',
        parentId: node.id != null ? String(parentMap.get(node.id) ?? '') : '',
        sortOrder: String(node.sortOrder ?? 0),
      })
    } else {
      form.reset({
        name: '',
        slug: '',
        description: '',
        parentId: presetParentId != null ? String(presetParentId) : '',
        sortOrder: '0',
      })
    }
  }, [open, node, presetParentId, parentMap, form])

  /** 提交：空描述转 null，空父级转 null（顶级）。 */
  const handleSubmit = form.handleSubmit((values) => {
    onSubmit({
      name: values.name.trim(),
      slug: values.slug.trim(),
      description: values.description.trim() || null,
      parentId: values.parentId ? Number(values.parentId) : null,
      sortOrder: Number(values.sortOrder) || 0,
    })
  })

  return (
    <Dialog open={open} onOpenChange={(v) => !loading && onOpenChange(v)}>
      <DialogContent
        onEscapeKeyDown={(e) => loading && e.preventDefault()}
        onInteractOutside={(e) => loading && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{node ? '编辑分类' : '新建分类'}</DialogTitle>
          <DialogDescription>
            分类树最大嵌套 4 级；把分类挂到自己的子孙下会被后端拒绝。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <TextField
            control={form.control}
            name="name"
            label="名称"
            required
            placeholder="如：前端基础"
          />
          <TextField
            control={form.control}
            name="slug"
            label="Slug"
            required
            placeholder="frontend-basics"
            description="URL 友好标识，只能含小写字母 / 数字 / 连字符，全局唯一"
          />
          <TextAreaField
            control={form.control}
            name="description"
            label="描述"
            placeholder="可选，最多 500 字"
          />
          <SelectField control={form.control} name="parentId" label="父级分类" options={options} />
          <TextField
            control={form.control}
            name="sortOrder"
            label="排序值"
            type="number"
            description="数字越小越靠前"
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
