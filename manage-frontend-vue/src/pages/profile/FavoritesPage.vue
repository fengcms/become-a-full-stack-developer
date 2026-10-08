<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { NButton, NTag, useMessage } from 'naive-ui'
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { listMyFavorites, removeFavorite } from '@/api/me'

const router=useRouter();const client=useQueryClient();const message=useMessage();const page=ref(1);const pageSize=10
const favorites=useQuery({queryKey:['me','favorites',page],queryFn:()=>listMyFavorites({page:page.value,pageSize})})
const remove=useMutation({mutationFn:removeFavorite,onSuccess:async()=>{message.success('已取消收藏');await client.invalidateQueries({queryKey:['me','favorites']})},onError:e=>message.error(e instanceof Error?e.message:'取消失败')})
</script>
<template><section class="content-card card-padding"><h2 class="section-title">我的收藏</h2><div v-if="favorites.isPending.value" class="empty-state">正在加载…</div><div v-else-if="favorites.data.value?.list.length" class="article-list"><article v-for="item in favorites.data.value.list" :key="item.id" class="article-row"><div class="article-main"><button type="button" class="article-link" @click="router.push(`/articles/${item.id}/preview`)">{{item.title}}</button><div class="article-meta">{{item.categoryName||'未分类'}} · {{item.createdAt?new Date(item.createdAt).toLocaleDateString('zh-CN'):'—'}}</div></div><NTag size="small">{{({draft:'草稿',pending:'待审',published:'已发布'})[item.status]}}</NTag><NButton size="small" quaternary type="error" :loading="remove.isPending.value" @click="remove.mutate(item.id)">取消收藏</NButton></article></div><div v-else class="empty-state">还没有收藏任何文章</div><div v-if="favorites.data.value?.pagination" class="pagination"><span>共 {{favorites.data.value.pagination.total}} 条</span><div><NButton :disabled="page<=1" @click="page--">上一页</NButton><NButton :disabled="page>=favorites.data.value.pagination.totalPages" @click="page++">下一页</NButton></div></div></section></template>
<style scoped>.section-title{margin:0 0 12px;font-size:17px}.article-list{display:grid}.article-row{display:flex;align-items:center;gap:12px;border-bottom:1px solid #edf0f4;padding:14px 0}.article-main{min-width:0;flex:1}.article-link{overflow:hidden;border:0;background:none;padding:0;color:#365f91;text-align:left;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;font-weight:600}.article-meta{margin-top:5px;color:#8894a5;font-size:12px}.pagination{display:flex;align-items:center;justify-content:space-between;margin-top:16px;color:#748196;font-size:12px}.pagination div{display:flex;gap:8px}</style>
