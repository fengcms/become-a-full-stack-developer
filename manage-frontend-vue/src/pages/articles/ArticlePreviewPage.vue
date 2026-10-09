<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { MdPreview } from 'md-editor-v3'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import 'md-editor-v3/lib/preview.css'
import { NButton, NSpin } from 'naive-ui'
import { useRoute, useRouter } from 'vue-router'
import { getArticle } from '@/api/articles'
import { pinia } from '@/app/pinia'
import PageHeader from '@/components/PageHeader.vue'
import { useUiStore } from '@/stores/ui'

const route = useRoute()
const router = useRouter()
const ui = useUiStore(pinia)
const { resolvedTheme } = storeToRefs(ui)
const articleId = computed(() => Number(route.params.id))
const article = useQuery({ queryKey: computed(() => ['articles','detail',articleId.value]), queryFn: () => getArticle(articleId.value), enabled: computed(() => articleId.value > 0) })
</script>
<template><section class="page-content"><NButton @click="router.back()">返回</NButton><NSpin :show="article.isPending.value"><div v-if="article.data.value"><PageHeader :title="article.data.value.title" :description="article.data.value.summary ?? ''" /><div class="content-card card-padding"><MdPreview :model-value="article.data.value.content" :theme="resolvedTheme" /></div></div><NAlert v-else-if="article.isError.value" type="error">文章不可读：可能已下架、删除，或当前账号无权查看。</NAlert></NSpin></section></template>
