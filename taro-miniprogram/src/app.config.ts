export default defineAppConfig({
  pages: ['pages/index/index', 'pages/categories/index', 'pages/search/index', 'pages/member/index', 'pages/browse/index', 'pages/author/index', 'pages/article/index', 'pages/auth/index', 'pages/collection/index', 'pages/notifications/index', 'pages/profile/index', 'pages/settings/index', 'pages/editor/index', 'pages/my-articles/index'],
  window: { navigationBarTitleText: '成为全栈', navigationBarBackgroundColor: '#ffffff', navigationBarTextStyle: 'black', backgroundColor: '#f7fafd', backgroundTextStyle: 'light' },
  tabBar: { color: '#607286', selectedColor: '#3277b5', backgroundColor: '#ffffff', list: [
    { pagePath: 'pages/index/index', text: '首页', iconPath: 'assets/icons/home-light.png', selectedIconPath: 'assets/icons/home-active.png' },
    { pagePath: 'pages/categories/index', text: '分类', iconPath: 'assets/icons/layers-light.png', selectedIconPath: 'assets/icons/layers-active.png' },
    { pagePath: 'pages/search/index', text: '搜索', iconPath: 'assets/icons/search-light.png', selectedIconPath: 'assets/icons/search-active.png' },
    { pagePath: 'pages/member/index', text: '我的', iconPath: 'assets/icons/user-light.png', selectedIconPath: 'assets/icons/user-active.png' },
  ] },
  darkmode: true,
  lazyCodeLoading: 'requiredComponents',
})
