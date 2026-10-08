<script setup lang="ts">
import { NButton, NResult } from 'naive-ui'
import { useRouter } from 'vue-router'

const router = useRouter()
</script>
<template><main class="login-shell"><NResult status="403" title="当前账号没有后台权限" description="普通会员账号仍可使用个人中心；如需管理内容，请联系管理员申请编辑或管理员权限。"><template #footer><NButton type="primary" @click="router.replace('/profile')">进入个人中心</NButton></template></NResult></main></template>
