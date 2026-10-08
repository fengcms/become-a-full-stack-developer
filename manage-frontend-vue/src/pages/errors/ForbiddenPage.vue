<script setup lang="ts">
import { NButton, NResult } from 'naive-ui'
import { useRouter } from 'vue-router'

const router = useRouter()
</script>
<template><section class="page-content"><NResult status="403" title="没有操作权限" description="当前账号无法访问此功能。"><template #footer><NButton @click="router.back()">返回上一页</NButton></template></NResult></section></template>
