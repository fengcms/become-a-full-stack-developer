<script setup lang="ts">
import { NButton, NResult } from 'naive-ui'
import { useRouter } from 'vue-router'

const router = useRouter()
</script>
<template><main class="login-shell"><NResult status="404" title="页面不存在" description="地址可能已变更，或页面已被移除。"><template #footer><NButton type="primary" @click="router.replace('/')">返回首页</NButton></template></NResult></main></template>
