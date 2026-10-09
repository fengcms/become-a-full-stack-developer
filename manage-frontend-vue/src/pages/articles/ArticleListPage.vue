<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import type { DataTableColumns, DataTableRowKey } from 'naive-ui'
import { NButton, NDataTable, NInput, NSelect, NTag, useDialog, useMessage } from 'naive-ui'
import { computed, h, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { approveArticle, deleteArticle, listAdminArticles } from '@/api/articles'
import PageHeader from '@/components/PageHeader.vue'
import type { ArticleStatus, ArticleSummary } from '@/types/common'

const route = useRoute()
const router = useRouter()
const dialog = useDialog()
const message = useMessage()
const qc = useQueryClient()
const page = ref(Number(route.query.page) || 1)
const status = ref<ArticleStatus | ''>((route.query.status as ArticleStatus) || '')
const keyword = ref(String(route.query.keyword || ''))
const pageSize = 10
const query = computed(() => ({ page: page.value, pageSize, sort: '-updatedAt', status: status.value || undefined, keyword: keyword.value.trim() || undefined }))
const articles = useQuery({ queryKey: computed(() => ['articles', 'admin', query.value]), queryFn: () => listAdminArticles(query.value) })
const selected = ref<DataTableRowKey[]>([])
const saving = ref(false)
const statusOptions = [{ label: '全部状态', value: '' }, { label: '草稿', value: 'draft' }, { label: '待审核', value: 'pending' }, { label: '已发布', value: 'published' }]
watch([status, keyword], () => { page.value = 1 })

async function refresh() { await qc.invalidateQueries({ queryKey: ['articles'] }) }
async function approve(row: ArticleSummary) {
  saving.value = true
  try { await approveArticle(row.id); message.success('已通过审核并发布'); await refresh() }
  catch (error) { message.error(error instanceof Error ? error.message : '审核失败') }
  finally { saving.value = false }
}
function remove(row: ArticleSummary) {
  dialog.warning({ title: '删除文章', content: `确定删除《${row.title}》吗？此操作会软删除文章。`, positiveText: '确认删除', negativeText: '取消', onPositiveClick: async () => {
    try { await deleteArticle(row.id); message.success('文章已删除'); await refresh() }
    catch (error) { message.error(error instanceof Error ? error.message : '删除失败') }
  } })
}
const columns: DataTableColumns<ArticleSummary> = [
  { type: 'selection' },
  { title: 'ID', key: 'id', width: 72 },
  { title: '标题', key: 'title', minWidth: 240, render: (row) => h(RouterLink, { to: `/articles/${row.id}/edit`, class: 'table-link' }, () => row.title) },
  { title: '状态', key: 'status', width: 100, render: (row) => h(NTag, { size: 'small', type: row.status === 'published' ? 'success' : row.status === 'pending' ? 'warning' : 'default' }, () => ({ draft: '草稿', pending: '待审核', published: '已发布' })[row.status]) },
  { title: '分类', key: 'categoryName', width: 130, render: (row) => row.categoryName || '未分类' },
  { title: '作者', key: 'authorName', width: 120, render: (row) => row.authorName || `用户 ${row.authorId}` },
  { title: '更新时间', key: 'updatedAt', width: 170, render: (row) => row.updatedAt ? new Date(row.updatedAt).toLocaleString('zh-CN') : '—' },
  { title: '操作', key: 'actions', width: 210, render: (row) => h('div', { class: 'row-actions' }, [
    h(NButton, { size: 'small', quaternary: true, onClick: () => router.push(`/articles/${row.id}/edit`) }, { default: () => '编辑' }),
    ...(row.status === 'pending' ? [h(NButton, { size: 'small', quaternary: true, type: 'success', disabled: saving.value, onClick: () => approve(row) }, { default: () => '通过' })] : []),
    h(NButton, { size: 'small', quaternary: true, type: 'error', onClick: () => remove(row) }, { default: () => '删除' }),
  ]) },
]

async function bulkDelete() {
  if (!selected.value.length) return
  const ids = selected.value.map(Number)
  dialog.warning({ title: '批量删除', content: `将逐篇删除选中的 ${ids.length} 篇文章。失败项会保留在列表中。`, positiveText: '继续', negativeText: '取消', onPositiveClick: async () => {
    const results = await Promise.allSettled(ids.map((id) => deleteArticle(id)))
    const failed = results.filter((result) => result.status === 'rejected').length
    message[failed ? 'warning' : 'success'](failed ? `删除完成，${failed} 篇失败` : `已删除 ${ids.length} 篇文章`)
    selected.value = []
    await refresh()
  } })
}
</script>

<template>
  <section class="page-content">
    <PageHeader title="文章管理" description="管理稿件、审核投稿并维护已发布内容"><template #actions><RouterLink to="/articles/new"><NButton type="primary">新建文章</NButton></RouterLink></template></PageHeader>
    <section class="content-card card-padding">
      <div class="toolbar"><NInput v-model:value="keyword" clearable placeholder="搜索文章标题或关键词" style="max-width: 320px" @keyup.enter="articles.refetch()" /><NSelect v-model:value="status" :options="statusOptions" style="width: 150px" /><span class="grow" /><NButton v-if="selected.length" type="error" secondary @click="bulkDelete">删除所选（{{ selected.length }}）</NButton><NButton @click="articles.refetch()">刷新</NButton></div>
      <NDataTable remote :columns="columns" :data="articles.data.value?.list ?? []" :loading="articles.isPending.value" :row-key="(row: ArticleSummary) => row.id" :checked-row-keys="selected" :on-update:checked-row-keys="(keys) => selected = keys" :scroll-x="1120" :pagination="{ page: page, pageSize, itemCount: articles.data.value?.pagination.total ?? 0, showSizePicker: false, onUpdatePage: (value: number) => page = value }" />
    </section>
  </section>
</template>

<style scoped>.table-link{color:var(--accent);font-weight:550}.row-actions{display:flex;gap:2px}</style>
