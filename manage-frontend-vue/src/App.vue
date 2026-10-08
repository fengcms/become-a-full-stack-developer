<script setup lang="ts">
import { dateZhCN, NConfigProvider, NDialogProvider, NMessageProvider, NNotificationProvider, zhCN } from 'naive-ui'
import { RouterView } from 'vue-router'

const themeOverrides = {
  common: {
    primaryColor: '#365f91',
    primaryColorHover: '#294e7b',
    primaryColorPressed: '#213f63',
    borderRadius: '8px',
    fontFamily: 'Inter, "PingFang SC", "Microsoft YaHei", sans-serif',
  },
}
</script>

<template>
  <NConfigProvider :locale="zhCN" :date-locale="dateZhCN" :theme-overrides="themeOverrides">
    <NDialogProvider>
      <NMessageProvider>
        <NNotificationProvider>
          <RouterView />
        </NNotificationProvider>
      </NMessageProvider>
    </NDialogProvider>
  </NConfigProvider>
</template>
