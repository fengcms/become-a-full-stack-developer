<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import type { DataTableColumns } from 'naive-ui'
import { NButton, NDataTable, NInput, NModal, NSelect, NTag, useDialog, useMessage } from 'naive-ui'
import { h, ref } from 'vue'
import { deleteComment, listAdminComments, moderateComment, replyComment } from '@/api/comments'
import PageHeader from '@/components/PageHeader.vue'
import type { Comment, CommentStatus } from '@/types/common'

const client = useQueryClient(); const message = useMessage(); const dialog = useDialog()
const status = ref<CommentStatus | ''>('reviewing'); const page = ref(1); const pageSize = 20
const comments = useQuery({ queryKey: ['comments', 'admin', status, page], queryFn: () => listAdminComments({ status: status.value || undefined, page: page.value, pageSize }) })
const statusOptions = [{ label: '全部状态', value: '' }, { label: '待复核', value: 'reviewing' }, { label: '已通过', value: 'approved' }, { label: '已拒绝', value: 'rejected' }]
const replyTarget = ref<Comment | null>(null); const replyOpen = ref(false); const replyText = ref(''); const replyBusy = ref(false)
async function refresh() { await client.invalidateQueries({ queryKey: ['comments'] }) }
async function setStatus(row: Comment, next: CommentStatus) {
  try { await moderateComment(row.id, { status: next, reason: next === 'rejected' ? '由管理后台审核拒绝' : null }); message.success('评论状态已更新'); await refresh() }
  catch (error) { message.error(error instanceof Error ? error.message : '审核失败') }
}
function remove(row: Comment) { dialog.warning({ title: '删除评论', content: '删除该评论会级联删除它下面的全部回复，确定继续吗？', positiveText: '确认删除', negativeText: '取消', onPositiveClick: async () => { try { await deleteComment(row.id); message.success('评论已删除'); await refresh() } catch (error) { message.error(error instanceof Error ? error.message : '删除失败') } } }) }
async function sendReply() {
  if (!replyTarget.value || !replyText.value.trim()) { message.warning('请输入回复内容'); return }
  replyBusy.value = true
  try { const saved = await replyComment(replyTarget.value.articleId, { content: replyText.value.trim(), parentId: replyTarget.value.id }); message[saved.status === 'rejected' ? 'warning' : 'success'](saved.status === 'rejected' ? '回复已提交，但被内容安全规则拦截' : '回复已提交'); replyTarget.value = null; replyOpen.value = false; replyText.value = ''; await refresh() }
  catch (error) { message.error(error instanceof Error ? error.message : '回复失败') }
  finally { replyBusy.value = false }
}
const columns: DataTableColumns<Comment> = [
  { title: '评论', key: 'content', minWidth: 280, render: (row) => h('div', { class: 'comment-cell' }, [h('div', row.content), h('small', `文章 #${row.articleId} · ${row.parentId ? `回复 #${row.parentId}` : '文章评论'}`)]) },
  { title: '评论者', key: 'userName', width: 140, render: (row) => row.userName || `用户 ${row.userId}` },
  { title: '状态', key: 'status', width: 110, render: (row) => h(NTag, { size: 'small', type: row.status === 'approved' ? 'success' : row.status === 'reviewing' ? 'warning' : 'error' }, () => ({ approved: '已通过', reviewing: '待复核', rejected: '已拒绝' })[row.status]) },
  { title: '时间', key: 'createdAt', width: 170, render: (row) => row.createdAt ? new Date(row.createdAt).toLocaleString('zh-CN') : '—' },
  { title: '操作', key: 'actions', width: 260, render: (row) => h('div', { class: 'row-actions' }, [
    ...(row.status !== 'approved' ? [h(NButton, { size: 'small', quaternary: true, type: 'success', onClick: () => setStatus(row, 'approved') }, { default: () => '通过' })] : []),
    ...(row.status !== 'rejected' ? [h(NButton, { size: 'small', quaternary: true, type: 'warning', onClick: () => setStatus(row, 'rejected') }, { default: () => '拒绝' })] : []),
    h(NButton, { size: 'small', quaternary: true, onClick: () => { replyTarget.value = row; replyOpen.value = true } }, { default: () => '回复' }),
    h(NButton, { size: 'small', quaternary: true, type: 'error', onClick: () => remove(row) }, { default: () => '删除' }),
  ]) },
]
</script>

<template><section class="page-content"><PageHeader title="评论审核" description="查看全站评论、处理复核状态并直接回复读者"/><section class="content-card card-padding"><div class="toolbar"><NSelect v-model:value="status" :options="statusOptions" style="width:160px" @update:value="page=1"/><span class="grow"/><NButton @click="comments.refetch()">刷新</NButton></div><NDataTable remote :columns="columns" :data="comments.data.value?.list ?? []" :loading="comments.isPending.value" :scroll-x="1100" :pagination="{page,pageSize,itemCount:comments.data.value?.pagination.total??0,onUpdatePage:(value:number)=>page=value}"/><div v-if="comments.isError.value" class="empty-state">评论加载失败 <NButton text @click="comments.refetch()">重试</NButton></div></section><NModal v-model:show="replyOpen" preset="card" title="回复评论" style="width:min(600px,calc(100vw - 32px))"><blockquote v-if="replyTarget" class="reply-quote">{{ replyTarget.content }}</blockquote><NInput v-model:value="replyText" type="textarea" :rows="5" maxlength="2000" show-count placeholder="输入回复内容"/><template #footer><div class="modal-actions"><NButton @click="replyOpen=false;replyTarget=null">取消</NButton><NButton type="primary" :loading="replyBusy" @click="sendReply">提交回复</NButton></div></template></NModal></section></template>
<style scoped>.comment-cell{display:grid;gap:6px;line-height:1.55}.comment-cell small{color:var(--muted)}.row-actions,.modal-actions{display:flex;gap:2px;justify-content:flex-end}.modal-actions{gap:8px}.reply-quote{margin:0 0 14px;padding:12px;border-left:3px solid var(--accent);background:var(--subtle);color:var(--muted)}</style>
