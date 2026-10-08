<script setup lang="ts">
import { NAvatar, NButton, NDropdown, NIcon, useMessage } from 'naive-ui'
import { computed } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { logout } from '@/api/auth'
import { pinia } from '@/app/pinia'
import { visibleMenuGroups } from '@/config/menu'
import { ROLE_LABELS } from '@/config/roles'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore(pinia)
const route = useRoute()
const router = useRouter()
const message = useMessage()
const groups = computed(() => visibleMenuGroups(auth.user))
const options = [{ label: '个人资料', key: 'profile' }, { label: '退出登录', key: 'logout' }]
async function choose(key: string) {
  if (key === 'profile') await router.push('/profile')
  if (key === 'logout') {
    await logout()
    message.success('已退出登录')
    await router.replace('/login')
  }
}
</script>

<template>
  <div class="admin-layout">
    <aside class="admin-sidebar">
      <RouterLink to="/dashboard" class="brand-block"><span class="brand-mark">全</span><span class="brand-name">全栈管理后台</span></RouterLink>
      <nav class="menu-scroll" aria-label="主导航">
        <section v-for="group in groups" :key="group.label">
          <div class="menu-heading">{{ group.label }}</div>
          <RouterLink v-for="item in group.items" :key="item.path" :to="item.path" class="menu-link" :class="{ active: route.path === item.path || (item.path !== '/dashboard' && route.path.startsWith(item.path)) }">
            <NIcon class="menu-icon"><component :is="item.icon" /></NIcon><span class="menu-label">{{ item.label }}</span>
          </RouterLink>
        </section>
      </nav>
    </aside>
    <main class="admin-main">
      <header class="topbar">
        <div class="topbar-title">内容运营 · 管理控制台</div>
        <NDropdown :options="options" @select="choose">
          <NButton text class="topbar-user">
            <NAvatar round size="small" :src="auth.user?.avatar || undefined">{{ (auth.user?.nickname || auth.user?.username || 'U').slice(0, 1) }}</NAvatar>
            <span class="user-copy"><span class="user-name">{{ auth.user?.nickname || auth.user?.username }}</span><span class="user-role">{{ auth.user ? ROLE_LABELS[auth.user.role] : '' }}</span></span>
          </NButton>
        </NDropdown>
      </header>
      <RouterView />
    </main>
  </div>
</template>
