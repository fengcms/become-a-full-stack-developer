<script setup lang="ts">
import { NButton, NForm, NFormItem, NInput, useMessage } from 'naive-ui'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { login } from '@/api/auth'
import { getPublicSiteSettings } from '@/api/site'
import { canEnterConsole, ROLE_HOME, ROLE_LABELS } from '@/config/roles'
import { isApiError } from '@/lib/request'

const router = useRouter()
const message = useMessage()
const username = ref(import.meta.env.DEV ? import.meta.env.VITE_DEV_LOGIN_USERNAME ?? '' : '')
const password = ref(import.meta.env.DEV ? import.meta.env.VITE_DEV_LOGIN_PASSWORD ?? '' : '')
const loading = ref(false)
const brand = ref('全栈管理后台')
const buttonText = computed(() => loading.value ? '正在登录…' : '登录')
onMounted(async () => { try { brand.value = (await getPublicSiteSettings()).siteName || brand.value } catch { /* 品牌配置不是登录前置条件 */ } })

async function submit() {
  if (!username.value.trim() || !password.value) { message.warning('请输入用户名和密码'); return }
  loading.value = true
  try {
    const result = await login({ username: username.value.trim(), password: password.value })
    if (!canEnterConsole(result.user.role)) {
      message.warning(`当前账号是${ROLE_LABELS[result.user.role]}，将进入个人中心`)
      await router.replace('/no-access')
      return
    }
    message.success(`欢迎回来，${result.user.nickname || result.user.username}`)
    const state = history.state as { from?: string } | null
    await router.replace(typeof state?.from === 'string' ? state.from : ROLE_HOME[result.user.role])
  } catch (error) {
    message.error(isApiError(error) ? error.message : '登录失败，请稍后重试')
  } finally { loading.value = false }
}
</script>

<template>
  <main class="login-shell">
    <section class="login-card">
      <div class="login-mark">{{ brand.slice(0, 1) }}</div>
      <h1 class="login-title">登录管理后台</h1>
      <p class="login-subtitle">使用编辑或管理员账号登录</p>
      <NForm @submit.prevent="submit">
        <NFormItem label="用户名"><NInput v-model:value="username" autocomplete="username" placeholder="请输入用户名" @keyup.enter="submit" /></NFormItem>
        <NFormItem label="密码"><NInput v-model:value="password" type="password" show-password-on="click" autocomplete="current-password" placeholder="请输入密码" @keyup.enter="submit" /></NFormItem>
        <NButton type="primary" block size="large" :loading="loading" @click="submit">{{ buttonText }}</NButton>
      </NForm>
    </section>
  </main>
</template>
