<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import type { DataTableColumns } from 'naive-ui'
import { NButton, NDataTable, NTag } from 'naive-ui'
import { computed, h } from 'vue'
import { RouterLink } from 'vue-router'
import { listAdminArticles } from '@/api/articles'
import { listAdminComments } from '@/api/comments'
import { getCategoryStats, getSiteStats } from '@/api/site'
import { pinia } from '@/app/pinia'
import PageHeader from '@/components/PageHeader.vue'
import { canManageArticles, canModerateComments } from '@/lib/permission'
import { useAuthStore } from '@/stores/auth'
import type { ArticleSummary, Comment } from '@/types/common'

const auth = useAuthStore(pinia)
const canArticles = computed(() => canManageArticles(auth.user))
const canComments = computed(() => canModerateComments(auth.user))
const stats = useQuery({ queryKey: ['stats'], queryFn: getSiteStats })
const categories = useQuery({ queryKey: ['category-stats'], queryFn: getCategoryStats })
const articles = useQuery({ queryKey: ['articles', 'recent'], queryFn: () => listAdminArticles({ sort: '-createdAt', pageSize: 5 }), enabled: canArticles })
const comments = useQuery({ queryKey: ['comments', 'recent'], queryFn: () => listAdminComments({ pageSize: 5 }), enabled: canComments })
const articleColumns: DataTableColumns<ArticleSummary> = [
  { title: '文章', key: 'title', render: (row) => h(RouterLink, { to: `/articles/${row.id}/edit`, class: 'table-link' }, () => row.title) },
  { title: '作者', key: 'authorName', render: (row) => row.authorName || `用户 ${row.authorId}` },
  { title: '状态', key: 'status', render: (row) => h(NTag, { size: 'small', type: row.status === 'published' ? 'success' : row.status === 'pending' ? 'warning' : 'default' }, () => ({ published: '已发布', pending: '待审核', draft: '草稿' })[row.status]) },
]
const commentColumns: DataTableColumns<Comment> = [
  { title: '评论内容', key: 'content', ellipsis: { tooltip: true } },
  { title: '作者', key: 'userName', render: (row) => row.userName || `用户 ${row.userId}` },
  { title: '状态', key: 'status', render: (row) => row.status },
]
</script>

<template>
  <section class="page-content">
    <PageHeader title="仪表盘" :description="`欢迎回来，${auth.user?.nickname || auth.user?.username || ''}。从这里继续写作和处理读者反馈。`">
      <template #actions><div class="toolbar"><NButton v-if="canArticles" type="primary" tag="a" href="/articles/new">写文章</NButton><NButton v-if="canComments" tag="a" href="/comments?status=reviewing">处理待复核评论</NButton></div></template>
    </PageHeader>
    <div class="stats-grid">
      <article v-for="item in [{label:'已发布文章',value:stats.data.value?.articleCount},{label:'已通过评论',value:stats.data.value?.commentCount},{label:'活跃会员',value:stats.data.value?.memberCount},{label:'累计阅读量',value:stats.data.value?.viewTotal}]" :key="item.label" class="content-card stat-card"><div class="stat-label">{{ item.label }}</div><div class="stat-value">{{ item.value?.toLocaleString() ?? '—' }}</div><div class="stat-note">全站实时统计</div></article>
    </div>
    <div class="dashboard-grid">
      <section class="content-card card-padding"><div class="section-heading"><h2>分类内容分布</h2></div><div v-if="categories.isPending.value" class="empty-state">正在加载…</div><div v-else class="category-bars"><div v-for="item in categories.data.value" :key="item.id" class="category-bar-row"><span>{{ item.name }}</span><div class="bar-track"><div class="bar-fill" :style="{width: `${Math.min(100, item.articleCount * 10)}%`}" /></div><b>{{ item.articleCount }}</b></div></div></section>
      <section v-if="canArticles" class="content-card card-padding"><div class="section-heading"><h2>近期文章</h2><RouterLink to="/articles">查看全部</RouterLink></div><NDataTable :columns="articleColumns" :data="articles.data.value?.list ?? []" :loading="articles.isPending.value" :bordered="false" :single-line="false" /></section>
      <section v-if="canComments" class="content-card card-padding"><div class="section-heading"><h2>近期评论</h2><RouterLink to="/comments">查看全部</RouterLink></div><NDataTable :columns="commentColumns" :data="comments.data.value?.list ?? []" :loading="comments.isPending.value" :bordered="false" :single-line="false" /></section>
    </div>
  </section>
</template>

<style scoped>
.dashboard-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.section-heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.section-heading h2{margin:0;font-size:15px}.section-heading a,.table-link{color:var(--accent)}.category-bars{display:grid;gap:14px}.category-bar-row{display:grid;grid-template-columns:minmax(70px,110px) 1fr 30px;align-items:center;gap:10px;font-size:12px}.bar-track{height:8px;overflow:hidden;border-radius:99px;background:var(--subtle)}.bar-fill{height:100%;border-radius:99px;background:var(--accent)}.category-bar-row b{text-align:right}.table-link{display:block;max-width:360px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}@media(max-width:980px){.dashboard-grid{grid-template-columns:1fr}}
</style>
