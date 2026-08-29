/**
 * src/store/ui.ts
 * 界面偏好（侧栏折叠等）。
 *
 * 这里可以放心用 localStorage：折叠状态不是凭证，泄露了也就是别人知道你爱收着侧栏。
 * 与 store/auth 的「绝不落盘」是两套标准，区别就在于**数据是不是敏感**，
 * 而不是「store 就该统一持久化」。
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UiState {
  sidebarCollapsed: boolean
  setSidebar: (collapsed: boolean) => void
  toggleSidebar: () => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      setSidebar: (sidebarCollapsed) => set({ sidebarCollapsed }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    { name: 'befull-admin-ui' },
  ),
)
