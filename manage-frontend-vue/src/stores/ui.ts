import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export type ThemePreference = 'light' | 'dark' | 'system'

const THEME_KEY = 'theme'
const SIDEBAR_KEY = 'befull-admin-ui'

function readPreference(): ThemePreference {
  const value = localStorage.getItem(THEME_KEY)
  return value === 'light' || value === 'dark' ? value : 'system'
}

function readSidebarCollapsed() {
  try {
    const saved = localStorage.getItem(SIDEBAR_KEY)
    if (!saved) return false
    const parsed = JSON.parse(saved) as {
      state?: { sidebarCollapsed?: boolean }
      sidebarCollapsed?: boolean
    }
    return parsed.state?.sidebarCollapsed ?? parsed.sidebarCollapsed ?? false
  } catch {
    return false
  }
}

export const useUiStore = defineStore('ui', () => {
  const themePreference = ref<ThemePreference>(readPreference())
  const sidebarCollapsed = ref(readSidebarCollapsed())
  const systemIsDark = ref(window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false)
  const resolvedTheme = computed(() =>
    themePreference.value === 'system'
      ? systemIsDark.value
        ? 'dark'
        : 'light'
      : themePreference.value,
  )

  function applyTheme() {
    document.documentElement.classList.toggle('dark', resolvedTheme.value === 'dark')
    document.documentElement.style.colorScheme = resolvedTheme.value
  }

  function setThemePreference(value: ThemePreference) {
    themePreference.value = value
    localStorage.setItem(THEME_KEY, value)
    applyTheme()
  }

  function toggleTheme() {
    setThemePreference(resolvedTheme.value === 'dark' ? 'light' : 'dark')
  }

  function setSidebarCollapsed(value: boolean) {
    sidebarCollapsed.value = value
    localStorage.setItem(
      SIDEBAR_KEY,
      JSON.stringify({ state: { sidebarCollapsed: value }, version: 0 }),
    )
  }

  function toggleSidebar() {
    setSidebarCollapsed(!sidebarCollapsed.value)
  }

  const media = window.matchMedia?.('(prefers-color-scheme: dark)')
  media?.addEventListener('change', (event) => {
    systemIsDark.value = event.matches
    if (themePreference.value === 'system') applyTheme()
  })
  applyTheme()

  return {
    themePreference,
    resolvedTheme,
    setThemePreference,
    toggleTheme,
    sidebarCollapsed,
    setSidebarCollapsed,
    toggleSidebar,
  }
})
