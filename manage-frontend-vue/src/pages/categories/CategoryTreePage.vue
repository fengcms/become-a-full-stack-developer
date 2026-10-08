<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import type { DataTableColumns } from 'naive-ui'
import { NButton, NDataTable, NFormItem, NInput, NInputNumber, NModal, NSelect, useDialog, useMessage } from 'naive-ui'
import { computed, h, ref } from 'vue'
import { CATEGORY_MAX_DEPTH, type CategoryUpsert, createCategory, deleteCategory, listCategoryTree, updateCategory } from '@/api/categories'
import PageHeader from '@/components/PageHeader.vue'
import type { Category, CategoryNode } from '@/types/common'

type Row = Category & { depth: number; hasChildren: boolean }
const queryClient = useQueryClient()
const message = useMessage()
const dialog = useDialog()
const tree = useQuery({ queryKey: ['categories', 'tree'], queryFn: listCategoryTree, staleTime: 300_000 })
const showModal = ref(false)
const saving = ref(false)
const editing = ref<Category | null>(null)
const form = ref({ name: '', slug: '', description: '', parentId: null as number | string | null, sortOrder: 0 })
const rows = computed(() => {
  const output: Row[] = []
  const walk = (nodes: CategoryNode[], depth = 0, parentId: number | null = null) => nodes.forEach((node) => {
    if (node.id == null || node.name == null || node.slug == null) return
    output.push({ id: node.id, name: node.name, slug: node.slug, description: node.description, parentId, sortOrder: node.sortOrder, depth, hasChildren: Boolean(node.children?.length) })
    walk(node.children ?? [], depth + 1, node.id)
  })
  walk(tree.data.value ?? [])
  return output
})
const parentOptions = computed(() => {
  const blocked = new Set<number>()
  const collect = (nodes: CategoryNode[], inside = false) => nodes.forEach((node) => {
    const childInside = inside || node.id === editing.value?.id
    if (childInside && node.id != null) blocked.add(node.id)
    collect(node.children ?? [], childInside)
  })
  collect(tree.data.value ?? [])
  return [{ label: '顶级分类', value: 'root' }, ...rows.value.filter((row) => !blocked.has(row.id) && row.depth < CATEGORY_MAX_DEPTH - 1).map((row) => ({ label: `${'　'.repeat(row.depth)}${row.name}`, value: row.id }))]
})
function open(row?: Row) {
  editing.value = row ?? null
  form.value = row ? { name: row.name, slug: row.slug, description: row.description ?? '', parentId: row.parentId ?? 'root', sortOrder: row.sortOrder ?? 0 } : { name: '', slug: '', description: '', parentId: 'root', sortOrder: 0 }
  showModal.value = true
}
async function save() {
  if (!form.value.name.trim() || !/^[a-z0-9-]{1,64}$/.test(form.value.slug)) { message.warning('请填写名称，并使用 1-64 位小写字母、数字或连字符作为 slug'); return }
  saving.value = true
  const payload: CategoryUpsert = { ...form.value, parentId: form.value.parentId === 'root' ? null : Number(form.value.parentId), name: form.value.name.trim(), description: form.value.description || null }
  try {
    if (editing.value) await updateCategory(editing.value.id, payload); else await createCategory(payload)
    message.success(editing.value ? '分类已保存' : '分类已创建')
    showModal.value = false
    await queryClient.invalidateQueries({ queryKey: ['categories'] })
  } catch (error) { message.error(error instanceof Error ? error.message : '保存失败') }
  finally { saving.value = false }
}
function remove(row: Row) {
  if (row.hasChildren) { message.warning('请先迁移或删除子分类'); return }
  dialog.warning({ title: '删除分类', content: `确定删除「${row.name}」吗？分类下存在文章时后端会拒绝删除。`, positiveText: '确认删除', negativeText: '取消', onPositiveClick: async () => {
    try { await deleteCategory(row.id); message.success('分类已删除'); await queryClient.invalidateQueries({ queryKey: ['categories'] }) }
    catch (error) { message.error(error instanceof Error ? error.message : '删除失败：分类下可能仍有文章') }
  } })
}
const columns: DataTableColumns<Row> = [
  { title: '分类名称', key: 'name', render: (row) => `${'　'.repeat(row.depth)}${row.depth ? '└ ' : ''}${row.name}` },
  { title: 'Slug', key: 'slug', width: 220 },
  { title: '排序', key: 'sortOrder', width: 90 },
  { title: '层级', key: 'depth', width: 90, render: (row) => `${row.depth + 1} / ${CATEGORY_MAX_DEPTH}` },
  { title: '操作', key: 'actions', width: 180, render: (row) => h('div', { class: 'row-actions' }, [h(NButton, { size: 'small', quaternary: true, onClick: () => open(row) }, { default: () => '编辑' }), h(NButton, { size: 'small', quaternary: true, disabled: row.hasChildren, type: 'error', onClick: () => remove(row) }, { default: () => '删除' })]) },
]
</script>

<template>
  <section class="page-content"><PageHeader title="分类管理" description="维护最多四级的分类树；删除前需要确认没有子分类或文章"><template #actions><NButton type="primary" @click="open()">新建分类</NButton></template></PageHeader>
    <section class="content-card card-padding"><NDataTable :columns="columns" :data="rows" :loading="tree.isPending.value" :bordered="false" :single-line="false" /><div v-if="tree.isError.value" class="empty-state">分类加载失败 <NButton text @click="tree.refetch()">重试</NButton></div></section>
    <NModal v-model:show="showModal" preset="card" :title="editing ? '编辑分类' : '新建分类'" style="width:min(520px, calc(100vw - 32px))"><div class="form-stack"><NFormItem label="名称"><NInput v-model:value="form.name" maxlength="80" /></NFormItem><NFormItem label="Slug"><NInput v-model:value="form.slug" placeholder="lowercase-slug" /></NFormItem><NFormItem label="上级分类"><NSelect v-model:value="form.parentId" :options="parentOptions" /></NFormItem><NFormItem label="描述"><NInput v-model:value="form.description" type="textarea" :rows="3" /></NFormItem><NFormItem label="排序值"><NInputNumber v-model:value="form.sortOrder" :min="0" /></NFormItem></div><template #footer><div class="modal-actions"><NButton @click="showModal = false">取消</NButton><NButton type="primary" :loading="saving" @click="save">保存</NButton></div></template></NModal>
  </section>
</template>
<style scoped>.form-stack{display:grid;gap:14px}.form-stack label{display:grid;gap:6px;color:#58677b;font-size:13px}.row-actions,.modal-actions{display:flex;gap:8px;justify-content:flex-end}.modal-actions{margin-top:4px}</style>
