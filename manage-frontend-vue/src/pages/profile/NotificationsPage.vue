<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { DataTableColumns } from 'naive-ui'
import { NButton, NDataTable, NTag, useMessage } from 'naive-ui'
import { h, ref } from 'vue'
import { listMyNotifications, markNotificationRead, readAllNotifications } from '@/api/notify'
import PageHeader from '@/components/PageHeader.vue'
import type { Notification } from '@/types/common'

const client=useQueryClient();const message=useMessage();const page=ref(1);const pageSize=20
const notifications=useQuery({queryKey:['me','notifications',page],queryFn:()=>listMyNotifications({page:page.value,pageSize})})
async function mark(row:Notification){if(row.isRead)return;try{await markNotificationRead(row.id);await client.invalidateQueries({queryKey:['me','notifications']})}catch(e){message.error(e instanceof Error?e.message:'操作失败')}}
const all=useMutation({mutationFn:readAllNotifications,onSuccess:async()=>{message.success('全部通知已标记为已读');await client.invalidateQueries({queryKey:['me','notifications']})},onError:e=>message.error(e instanceof Error?e.message:'操作失败')})
const columns:DataTableColumns<Notification>=[{title:'类型',key:'type',width:120,render:r=>h(NTag,{size:'small'},()=>({article_published:'文章发布',comment_approved:'评论审核',system:'系统'}[r.type]))},{title:'通知',key:'title',render:r=>h('button',{class:['notification-title',r.isRead?'read':'unread'],onClick:()=>mark(r)},[h('b',r.title),r.body?h('p',r.body):null])},{title:'时间',key:'createdAt',width:180,render:r=>new Date(r.createdAt).toLocaleString('zh-CN')},{title:'状态',key:'isRead',width:100,render:r=>r.isRead?'已读':'未读'}]
</script>
<template><section class="page-content"><PageHeader title="我的通知" description="查看文章和互动消息"><template #actions><NButton :loading="all.isPending.value" @click="all.mutate()">全部已读</NButton></template></PageHeader><section class="content-card card-padding"><NDataTable remote :columns="columns" :data="notifications.data.value?.list??[]" :loading="notifications.isPending.value" :scroll-x="780" :pagination="{page,pageSize,itemCount:notifications.data.value?.pagination.total??0,onUpdatePage:(n:number)=>page=n}"/></section></section></template>
<style scoped>.notification-title{border:0;background:transparent;text-align:left;color:#34465e;cursor:pointer}.notification-title p{margin:6px 0 0;color:#778499}.notification-title.read{opacity:.65}.notification-title.unread b{color:#365f91}</style>
