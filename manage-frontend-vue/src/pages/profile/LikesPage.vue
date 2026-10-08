<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { NButton, NTag } from 'naive-ui'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { listMyLikes } from '@/api/me'

const router=useRouter();const page=ref(1);const pageSize=20
const likes=useQuery({queryKey:['me','likes',page],queryFn:()=>listMyLikes({page:page.value,pageSize})})
const items=computed(()=>likes.data.value??[])
</script>
<template><section class="content-card card-padding"><h2 class="section-title">我的点赞</h2><div v-if="likes.isPending.value" class="empty-state">正在加载…</div><div v-else-if="items.length" class="article-list"><article v-for="item in items" :key="item.id" class="article-row"><div class="article-main"><button type="button" class="article-link" @click="router.push(`/articles/${item.id}/preview`)">{{item.title}}</button><div class="article-meta">{{item.categoryName||'未分类'}} · {{item.createdAt?new Date(item.createdAt).toLocaleDateString('zh-CN'):'—'}}</div></div><NTag size="small">{{({draft:'草稿',pending:'待审',published:'已发布'})[item.status]}}</NTag></article></div><div v-else class="empty-state">{{page>1?'这一页没有更多点赞':'还没有点赞任何文章'}}</div><div class="pagination"><span>第 {{page}} 页 · 每页最多 {{pageSize}} 篇</span><div><NButton :disabled="page<=1||likes.isPending.value" @click="page--">上一页</NButton><NButton :disabled="likes.isPending.value||items.length<pageSize" @click="page++">下一页</NButton></div></div></section></template>
<style scoped>.section-title{margin:0 0 12px;font-size:17px}.article-list{display:grid}.article-row{display:flex;align-items:center;gap:12px;border-bottom:1px solid #edf0f4;padding:14px 0}.article-main{min-width:0;flex:1}.article-link{overflow:hidden;border:0;background:none;padding:0;color:#365f91;text-align:left;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;font-weight:600}.article-meta{margin-top:5px;color:#8894a5;font-size:12px}.pagination{display:flex;align-items:center;justify-content:space-between;margin-top:16px;color:#748196;font-size:12px}.pagination div{display:flex;gap:8px}</style>
