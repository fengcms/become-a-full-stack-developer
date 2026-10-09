<script setup lang="ts">
import { ChevronBackOutline, ChevronForwardOutline, MenuOutline, MoonOutline, SunnyOutline } from '@vicons/ionicons5'
import { NAvatar, NButton, NDropdown, NIcon, useMessage } from 'naive-ui'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { logout } from '@/api/auth'
import { pinia } from '@/app/pinia'
import { visibleMenuGroups } from '@/config/menu'
import { ROLE_LABELS } from '@/config/roles'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'

const auth = useAuthStore(pinia)
const ui = useUiStore(pinia)
const route = useRoute()
const router = useRouter()
const message = useMessage()
const brand = '全栈管理后台'
const groups = computed(() => visibleMenuGroups(auth.user))
const viewportWidth = ref(window.innerWidth)
const isMobile = computed(() => viewportWidth.value < 1024)
const isTablet = computed(() => viewportWidth.value >= 1024 && viewportWidth.value < 1280)
const desktopCollapsed = computed(() => ui.sidebarCollapsed || isTablet.value)
const mobileOpen = ref(false)
const options = [{ label: '个人资料', key: 'profile' }, { label: '退出登录', key: 'logout' }]

function updateViewport() {
  viewportWidth.value = window.innerWidth
}

onMounted(() => window.addEventListener('resize', updateViewport))
onBeforeUnmount(() => {
  window.removeEventListener('resize', updateViewport)
  document.body.style.overflow = ''
})
watch(isMobile, (value) => { if (!value) mobileOpen.value = false })
watch(() => route.fullPath, () => { mobileOpen.value = false })
watch(mobileOpen, (value) => { document.body.style.overflow = value ? 'hidden' : '' })

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
  <div class="admin-layout" :class="{ 'is-collapsed': desktopCollapsed, 'mobile-nav-open': mobileOpen }">
    <button v-if="mobileOpen" class="mobile-sidebar-backdrop" type="button" aria-label="关闭导航菜单" @click="mobileOpen = false" />
    <aside class="admin-sidebar" :aria-hidden="isMobile && !mobileOpen">
      <RouterLink to="/dashboard" class="brand-block" :title="desktopCollapsed ? brand : undefined" @click="mobileOpen = false">
        <span class="brand-mark">全</span><span class="brand-name">全栈管理后台</span>
      </RouterLink>
      <nav class="menu-scroll" aria-label="主导航">
        <section v-for="group in groups" :key="group.label">
          <div class="menu-heading">{{ group.label }}</div>
          <RouterLink
            v-for="item in group.items"
            :key="item.path"
            :to="item.path"
            class="menu-link"
            :title="desktopCollapsed ? item.label : undefined"
            :aria-label="item.label"
            :class="{ active: route.path === item.path || (item.path !== '/dashboard' && route.path.startsWith(item.path)) }"
            @click="mobileOpen = false"
          >
            <NIcon class="menu-icon"><component :is="item.icon" /></NIcon><span class="menu-label">{{ item.label }}</span>
          </RouterLink>
        </section>
      </nav>
    </aside>

    <main class="admin-main">
      <header class="topbar">
        <div class="topbar-leading">
          <NButton quaternary circle :aria-label="isMobile ? '打开导航菜单' : desktopCollapsed ? '展开侧栏' : '收起侧栏'" @click="isMobile ? mobileOpen = true : ui.toggleSidebar()">
            <template #icon><NIcon><component :is="isMobile ? MenuOutline : desktopCollapsed ? ChevronForwardOutline : ChevronBackOutline" /></NIcon></template>
          </NButton>
          <div class="topbar-title">内容运营 · 管理控制台</div>
        </div>
        <div class="topbar-actions">
          <NButton quaternary circle :aria-label="ui.resolvedTheme === 'dark' ? '切换浅色模式' : '切换深色模式'" @click="ui.toggleTheme()"><template #icon><NIcon><component :is="ui.resolvedTheme === 'dark' ? SunnyOutline : MoonOutline" /></NIcon></template></NButton>
          <NDropdown :options="options" @select="choose">
            <NButton text class="topbar-user">
              <NAvatar round size="small" :src="auth.user?.avatar || undefined">{{ (auth.user?.nickname || auth.user?.username || 'U').slice(0, 1) }}</NAvatar>
              <span class="user-copy"><span class="user-name">{{ auth.user?.nickname || auth.user?.username }}</span><span class="user-role">{{ auth.user ? ROLE_LABELS[auth.user.role] : '' }}</span></span>
            </NButton>
          </NDropdown>
        </div>
      </header>
      <RouterView />
    </main>
  </div>
</template>
