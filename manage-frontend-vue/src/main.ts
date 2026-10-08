import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { createApp } from 'vue'
import App from '@/App.vue'
import { pinia } from '@/app/pinia'
import { bootstrapSession } from '@/lib/request'
import { setUnauthorizedHandler } from '@/lib/request/session'
import { router } from '@/router'
import { useAuthStore } from '@/stores/auth'
import '@/assets/main.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
})

setUnauthorizedHandler((reason) => {
  const current = router.currentRoute.value
  void router.replace({
    path: '/login',
    query: reason === 'disabled' ? { reason } : undefined,
    state: { from: current.fullPath },
  })
})

const app = createApp(App)
app.use(pinia)
app.use(VueQueryPlugin, { queryClient })
app.use(router)
await bootstrapSession()
useAuthStore(pinia).setBootStatus('ready')
await router.isReady()
app.mount('#app')
