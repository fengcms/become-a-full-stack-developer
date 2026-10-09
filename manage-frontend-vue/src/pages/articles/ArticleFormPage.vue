<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { MdEditor } from 'md-editor-v3'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import 'md-editor-v3/lib/style.css'
import { NAlert, NButton, NForm, NFormItem, NInput, NSelect, NTabPane, NTabs, useDialog, useMessage } from 'naive-ui'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { createArticle, getArticle, setArticleStatus, updateArticle } from '@/api/articles'
import { uploadFile } from '@/api/attachments'
import { listCategoryTree } from '@/api/categories'
import { listTags } from '@/api/tags'
import { pinia } from '@/app/pinia'
import { fileUrl } from '@/lib/fileUrl'
import { useUiStore } from '@/stores/ui'
import type { Article, ArticleCreate, ArticleStatus, CategoryNode } from '@/types/common'

const route = useRoute()
const router = useRouter()
const ui = useUiStore(pinia)
const { resolvedTheme } = storeToRefs(ui)
const message = useMessage()
const dialog = useDialog()
const qc = useQueryClient()
const id = computed(() => Number(route.params.id))
const editing = computed(() => route.name === undefined ? route.path.endsWith('/edit') : route.path.includes('/edit'))
const articleQuery = useQuery({ queryKey: computed(() => ['articles', 'detail', id.value]), queryFn: () => getArticle(id.value), enabled: computed(() => editing.value && id.value > 0) })
const categories = useQuery({ queryKey: ['categories', 'tree'], queryFn: listCategoryTree, staleTime: 300_000 })
const tagsQuery = useQuery({ queryKey: ['tags'], queryFn: listTags, staleTime: 300_000 })
const activeTab = ref('content')
const title = ref('')
const content = ref('')
const summary = ref('')
const coverImage = ref('')
const categoryId = ref<number | null>(null)
const tags = ref<string[]>([])
const coverInput = ref<HTMLInputElement | null>(null)
const loaded = ref(false)
const saved = ref<Article | null>(null)
const uploading = ref(0)
const dirty = ref(false)
const busy = ref(false)
const savedAt = ref('')
const statusLabel = computed(() => saved.value?.status === 'published' ? '已发布' : saved.value?.status === 'pending' ? '待审核' : '草稿')
const categoryOptions = computed(() => {
  const output: Array<{ label: string; value: number }> = []
  const walk = (nodes: CategoryNode[], prefix = '') => nodes.forEach((node) => {
    if (node.id == null || node.name == null) return
    const label = prefix ? `${prefix} / ${node.name}` : node.name
    output.push({ label, value: node.id })
    walk(node.children ?? [], label)
  })
  walk(categories.data.value ?? [])
  return output
})
watch(articleQuery.data, (article) => {
  if (!article || loaded.value) return
  title.value = article.title
  content.value = article.content
  summary.value = article.summary ?? ''
  coverImage.value = article.coverImage ?? ''
  categoryId.value = article.categoryId ?? null
  tags.value = article.tags ?? []
  saved.value = article
  loaded.value = true
})
watch([title, content, summary, coverImage, categoryId, tags], () => { if (loaded.value || !editing.value) dirty.value = true }, { deep: true, flush: 'sync' })

const returnTo = typeof route.query.from === 'string' && route.query.from.startsWith('/articles') ? route.query.from : '/articles'
function onLeave() {
  if (dirty.value && !busy.value && !window.confirm('文章有未保存的修改，确定离开吗？')) return false
  return true
}
onBeforeRouteLeave(onLeave)
const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty.value && !busy.value) { event.preventDefault(); event.returnValue = '' } }
window.addEventListener('beforeunload', beforeUnload)
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))

function payload(status: ArticleStatus): ArticleCreate {
  return { title: title.value.trim(), content: content.value, summary: summary.value || null, coverImage: coverImage.value || null, categoryId: categoryId.value, tags: tags.value, slug: saved.value?.slug ?? null, status }
}
async function save(publish = false) {
  if (busy.value) return
  if (!title.value.trim() || !content.value.trim()) { message.warning('标题和正文不能为空'); activeTab.value = 'content'; return }
  if (title.value.length > 200 || summary.value.length > 500 || content.value.length > 65535) { message.warning('部分内容超出契约长度限制'); return }
  if (publish && !categoryId.value) { message.warning('发布前请先选择分类'); activeTab.value = 'settings'; return }
  const nextStatus = publish ? 'published' : (saved.value?.status ?? 'draft')
  busy.value = true
  try {
    const body = payload(nextStatus)
    const result = editing.value ? await updateArticle(id.value, body) : await createArticle(body)
    saved.value = result
    dirty.value = false
    loaded.value = true
    savedAt.value = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    await qc.invalidateQueries({ queryKey: ['articles'] })
    message.success(publish ? '文章已发布' : '文章已保存')
    if (!editing.value) await router.replace({ path: `/articles/${result.id}/edit`, query: { from: returnTo } })
  } catch (error) { message.error(error instanceof Error ? error.message : '保存失败，请重试') }
  finally { busy.value = false }
}
async function unpublish() {
  const article = saved.value
  if (!article) return
  dialog.warning({ title: '下架文章', content: '下架后文章将不再公开展示，内容会保留为草稿。', positiveText: '确认下架', negativeText: '取消', onPositiveClick: async () => {
    try { saved.value = await setArticleStatus(article.id, 'draft'); message.success('文章已下架'); await qc.invalidateQueries({ queryKey: ['articles'] }) }
    catch (error) { message.error(error instanceof Error ? error.message : '下架失败') }
  } })
}
async function uploadImages(files: Array<File>, callback: (urls: string[]) => void) {
  uploading.value += files.length
  try {
    const attachments = await Promise.all(files.map((file) => uploadFile(file, saved.value?.id)))
    callback(attachments.map((attachment) => fileUrl(attachment.url)))
  } catch (error) { message.error(error instanceof Error ? error.message : '图片上传失败') }
  finally { uploading.value = Math.max(0, uploading.value - files.length) }
}
async function uploadCover(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  try { coverImage.value = fileUrl((await uploadFile(file, saved.value?.id)).url); message.success('封面上传完成') }
  catch (error) { message.error(error instanceof Error ? error.message : '封面上传失败') }
  finally { (event.target as HTMLInputElement).value = '' }
}
</script>

<template>
  <section class="page-content article-editor">
    <div class="toolbar"><NButton @click="router.push(returnTo)">返回列表</NButton><NInput v-model:value="title" size="large" placeholder="请输入文章标题" class="title-input" /><NButton v-if="saved?.status === 'published'" secondary type="warning" :disabled="busy || dirty" @click="unpublish">下架</NButton><NButton :loading="busy" :disabled="uploading > 0 || (!dirty && !!saved)" @click="save(false)">{{ busy ? '处理中…' : saved?.status === 'published' || saved?.status === 'pending' ? '保存修改' : '保存草稿' }}</NButton><NButton v-if="saved?.status !== 'published'" type="primary" :loading="busy" :disabled="uploading > 0" @click="save(true)">发布文章</NButton></div>
    <NAlert v-if="articleQuery.isError.value" type="error">文章加载失败：{{ articleQuery.error.value instanceof Error ? articleQuery.error.value.message : '请检查文章地址' }} <NButton text @click="articleQuery.refetch()">重试</NButton></NAlert>
    <NAlert v-else-if="editing && articleQuery.isPending.value" type="info">正在加载文章…</NAlert>
    <NTabs v-else v-model:value="activeTab" type="line" animated>
      <NTabPane name="content" tab="内容">
        <div class="md-editor"><MdEditor v-model="content" :theme="resolvedTheme" language="zh-CN" :disabled="busy" :on-upload-img="uploadImages" :toolbars="['bold','underline','italic','strikeThrough','title','sub','sup','quote','unorderedList','orderedList','task','codeRow','code','link','image','table','mermaid','katex','revoke','next','save','pageFullscreen','fullscreen']" /></div>
      </NTabPane>
      <NTabPane name="settings" tab="发布设置">
        <NForm label-placement="top" class="article-settings-grid">
          <NFormItem label="摘要"><NInput v-model:value="summary" type="textarea" :rows="4" maxlength="500" show-count placeholder="用几句话介绍文章，可选" /></NFormItem>
          <NFormItem label="封面图地址"><NInput v-model:value="coverImage" placeholder="/files/... 或图片 URL" /><div v-if="coverImage" class="cover-preview"><img :src="fileUrl(coverImage)" alt="文章封面预览" /></div><input ref="coverInput" type="file" accept="image/*" hidden @change="uploadCover"><NButton size="small" @click="coverInput?.click()">上传封面</NButton></NFormItem>
          <NFormItem label="分类"><NSelect v-model:value="categoryId" clearable :options="categoryOptions" placeholder="选择分类；发布时必填" /></NFormItem>
          <NFormItem label="标签"><div class="tag-input-row"><NSelect v-model:value="tags" multiple filterable tag :options="(tagsQuery.data.value ?? []).map((tag) => ({ label: tag.name, value: tag.name }))" placeholder="选择或输入标签" /></div></NFormItem>
        </NForm>
      </NTabPane>
    </NTabs>
    <footer class="editor-actions"><span class="editor-status">{{ uploading ? `图片上传中（${uploading}）` : busy ? '正在保存…' : dirty ? '有未保存的修改' : savedAt ? `已保存于 ${savedAt}` : saved ? `已载入文章 · ${statusLabel}` : '新草稿' }}</span><NButton v-if="saved" @click="router.push(`/articles/${saved.id}/preview`)">预览</NButton></footer>
  </section>
</template>

<style scoped>.title-input{max-width:700px;flex:1}.cover-preview{max-width:240px;margin-top:10px}.cover-preview img{display:block;width:100%;border-radius:6px}.tag-input-row{width:100%}</style>
