<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import type { DataTableColumns } from 'naive-ui'
import { NButton, NDataTable, NFormItem, NInput, NModal, useDialog, useMessage } from 'naive-ui'
import { h, ref } from 'vue'
import { createTag, deleteTag, listTags, type TagUpsert, updateTag } from '@/api/tags'
import PageHeader from '@/components/PageHeader.vue'
import type { Tag } from '@/types/common'

const client = useQueryClient(); const message = useMessage(); const dialog = useDialog()
const tags = useQuery({ queryKey: ['tags'], queryFn: listTags, staleTime: 300_000 })
const show = ref(false); const busy = ref(false); const editing = ref<Tag | null>(null); const name = ref(''); const slug = ref('')
function open(row?: Tag) { editing.value = row ?? null; name.value = row?.name ?? ''; slug.value = row?.slug ?? ''; show.value = true }
async function save() {
  if (!name.value.trim() || !/^[a-z0-9-]{1,64}$/.test(slug.value)) { message.warning('请填写名称，并使用 1-64 位小写字母、数字或连字符作为 slug'); return }
  busy.value = true
  try { const payload: TagUpsert = { name: name.value.trim(), slug: slug.value }; if (editing.value) await updateTag(editing.value.id, payload); else await createTag(payload); message.success('标签已保存'); show.value = false; await client.invalidateQueries({ queryKey: ['tags'] }) }
  catch (error) { message.error(error instanceof Error ? error.message : '保存失败') } finally { busy.value = false }
}
function remove(row: Tag) { if ((row.articleCount ?? 0) > 0) { message.warning('该标签仍被文章使用，请先调整文章标签'); return }; dialog.warning({ title: '删除标签', content: `确定删除「${row.name}」吗？`, positiveText: '确认删除', negativeText: '取消', onPositiveClick: async () => { try { await deleteTag(row.id); message.success('标签已删除'); await client.invalidateQueries({ queryKey: ['tags'] }) } catch (error) { message.error(error instanceof Error ? error.message : '删除失败') } } }) }
const columns: DataTableColumns<Tag> = [
  { title: '名称', key: 'name' }, { title: 'Slug', key: 'slug' }, { title: '文章数', key: 'articleCount', width: 120 },
  { title: '操作', key: 'actions', width: 160, render: (row) => h('div', { class: 'row-actions' }, [h(NButton, { size: 'small', quaternary: true, onClick: () => open(row) }, { default: () => '编辑' }), h(NButton, { size: 'small', quaternary: true, type: 'error', disabled: (row.articleCount ?? 0) > 0, onClick: () => remove(row) }, { default: () => '删除' })]) },
]
</script>
<template><section class="page-content"><PageHeader title="标签管理" description="维护文章标签；有文章引用的标签不能删除"><template #actions><NButton type="primary" @click="open()">新建标签</NButton></template></PageHeader><section class="content-card card-padding"><NDataTable :columns="columns" :data="tags.data.value ?? []" :loading="tags.isPending.value" :bordered="false" :single-line="false" /></section><NModal v-model:show="show" preset="card" :title="editing ? '编辑标签' : '新建标签'" style="width:min(480px, calc(100vw - 32px))"><div class="form-stack"><NFormItem label="名称"><NInput v-model:value="name" maxlength="80" /></NFormItem><NFormItem label="Slug"><NInput v-model:value="slug" placeholder="lowercase-slug" /></NFormItem></div><template #footer><div class="modal-actions"><NButton @click="show = false">取消</NButton><NButton type="primary" :loading="busy" @click="save">保存</NButton></div></template></NModal></section></template>
<style scoped>.form-stack{display:grid;gap:14px}.form-stack label{display:grid;gap:6px;color:var(--muted);font-size:13px}.row-actions,.modal-actions{display:flex;gap:8px;justify-content:flex-end}</style>
