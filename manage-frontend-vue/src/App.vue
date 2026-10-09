<script setup lang="ts">
import { darkTheme, dateZhCN, NConfigProvider, NDialogProvider, NMessageProvider, NNotificationProvider, zhCN } from 'naive-ui'
import { storeToRefs } from 'pinia'
import { RouterView } from 'vue-router'
import { pinia } from '@/app/pinia'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore(pinia)
const { resolvedTheme } = storeToRefs(ui)
const themeOverrides = {
  common: {
    primaryColor: '#5965dc',
    primaryColorHover: '#4853c6',
    primaryColorPressed: '#3f49ad',
    borderRadius: '8px',
    fontFamily: 'Inter, "PingFang SC", "Microsoft YaHei", sans-serif',
  },
}
</script>

<template>
  <NConfigProvider :locale="zhCN" :date-locale="dateZhCN" :theme="resolvedTheme === 'dark' ? darkTheme : null" :theme-overrides="themeOverrides">
    <NDialogProvider>
      <NMessageProvider>
        <NNotificationProvider>
          <RouterView />
        </NNotificationProvider>
      </NMessageProvider>
    </NDialogProvider>
  </NConfigProvider>
</template>
