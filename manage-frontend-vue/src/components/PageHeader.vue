<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
</script>

<template>
  <header class="page-heading">
    <div><h1 class="page-title">{{ title }}</h1><p v-if="description" class="page-description">{{ description }}</p></div>
    <div><slot name="actions" /></div>
  </header>
</template>
