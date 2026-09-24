/** @file Optional editorial configuration; these are not backend-managed slots. */
interface HomeContent {
  focusItems: (string | number)[]
  editorPicks: (string | number)[]
  banner: {
    image?: string
    mobileImage?: string
    href: string
    title: string
    description: string
    alt: string
  }
}
export const homeContent: HomeContent = {
  focusItems: [],
  editorPicks: [],
  banner: {
    href: '/about',
    title: '从会写页面，到能交付完整产品',
    description: '全栈开发实战系列 · 系统学习，持续进阶',
    alt: '探索全栈开发实战系列',
  },
}
