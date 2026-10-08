<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <section class="page-content">
    <header class="page-heading"><div><h1 class="page-title">个人中心</h1><p class="page-description">管理个人资料、安全设置和站内互动</p></div></header>
    <nav class="profile-nav" aria-label="个人中心导航">
      <RouterLink to="/profile">个人资料</RouterLink><RouterLink to="/profile/password">修改密码</RouterLink><RouterLink to="/profile/notifications">通知</RouterLink><RouterLink to="/profile/likes">我的点赞</RouterLink><RouterLink to="/profile/favorites">我的收藏</RouterLink>
    </nav>
    <RouterView />
  </section>
</template>
