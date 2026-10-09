<script setup lang="ts">
import { NButton, NForm, NFormItem, NInput, useMessage } from 'naive-ui'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { login } from '@/api/auth'
import { getPublicSiteSettings } from '@/api/site'
import { canEnterConsole, ROLE_HOME, ROLE_LABELS } from '@/config/roles'
import { isApiError } from '@/lib/request'
import type { SiteSetting } from '@/types/common'

const router = useRouter()
const message = useMessage()
const username = ref(import.meta.env.DEV ? import.meta.env.VITE_DEV_LOGIN_USERNAME ?? '' : '')
const password = ref(import.meta.env.DEV ? import.meta.env.VITE_DEV_LOGIN_PASSWORD ?? '' : '')
const loading = ref(false)
const site = ref<SiteSetting | null>(null)
const brand = computed(() => site.value?.siteName || '全栈管理后台')
const buttonText = computed(() => loading.value ? '正在登录…' : '登录')

onMounted(async () => {
  try {
    site.value = await getPublicSiteSettings()
  } catch {
    // 品牌配置不是登录前置条件。
  }
})

async function submit() {
  if (!username.value.trim() || !password.value) {
    message.warning('请输入用户名和密码')
    return
  }
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
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="login-shell">
    <section class="login-brand-panel" aria-label="管理后台介绍">
      <RouterLink to="/login" class="login-brand-lockup">
        <img v-if="site?.logoUrl" :src="site.logoUrl" :alt="brand" class="login-brand-logo" />
        <span v-else class="login-brand-symbol">{{ brand.slice(0, 1) }}</span>
        <span>{{ brand }} · 管理后台</span>
      </RouterLink>

      <div class="login-brand-content">
        <div class="login-eyebrow"><span /> 内容运营工作台</div>
        <h1>内容、评论、用户，<br />一个后台管到底</h1>
        <p>{{ site?.siteDescription || '文章审核、分类维护、成员治理与站点配置，集中在一处。' }}</p>
        <ul class="login-benefits">
          <li><span class="benefit-check">✓</span><span>三角色权限：会员 / 编辑 / 管理员</span></li>
          <li><span class="benefit-check">✓</span><span>文章三态流转：草稿 → 待审 → 已发布</span></li>
          <li><span class="benefit-check">✓</span><span>评论复核与站点内容，一处协同管理</span></li>
        </ul>
      </div>

      <p class="login-copyright">{{ site?.copyright || '仅限授权人员访问' }}</p>
    </section>

    <section class="login-form-panel">
      <div class="login-card">
        <div class="login-card-brand">
          <img v-if="site?.logoUrl" :src="site.logoUrl" :alt="brand" />
          <span v-else>{{ brand.slice(0, 1) }}</span>
        </div>
        <div class="login-card-heading">
          <p class="login-card-kicker">欢迎回来</p>
          <h2 class="login-title">登录到管理后台</h2>
          <p class="login-subtitle">使用编辑或管理员账号登录</p>
        </div>

        <NForm class="login-form" @submit.prevent="submit">
          <NFormItem label="用户名">
            <NInput v-model:value="username" size="large" autocomplete="username" placeholder="请输入用户名" @keyup.enter="submit" />
          </NFormItem>
          <NFormItem label="密码">
            <NInput v-model:value="password" size="large" type="password" show-password-on="click" autocomplete="current-password" placeholder="请输入密码" @keyup.enter="submit" />
          </NFormItem>
          <NButton type="primary" block size="large" :loading="loading" @click="submit">{{ buttonText }}</NButton>
        </NForm>
        <p class="login-form-footnote">登录即表示你拥有此管理后台的授权访问权限。</p>
      </div>
      <p class="login-mobile-copyright">{{ site?.copyright || brand }}</p>
    </section>
  </main>
</template>
