import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useUiStore } from './ui'

describe('ui theme preference', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
    setActivePinia(createPinia())
  })

  it('uses system preference by default and can toggle to a saved theme', () => {
    const ui = useUiStore()

    expect(ui.themePreference).toBe('system')
    ui.setThemePreference('dark')
    expect(localStorage.getItem('theme')).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    ui.toggleTheme()
    expect(ui.resolvedTheme).toBe('light')
    expect(localStorage.getItem('theme')).toBe('light')
  })

  it('restores an explicitly saved light theme', () => {
    localStorage.setItem('theme', 'light')

    const ui = useUiStore()

    expect(ui.themePreference).toBe('light')
    expect(ui.resolvedTheme).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
