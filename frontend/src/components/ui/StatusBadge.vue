<script setup lang="ts">
defineProps<{ label: string; cls: string }>()
</script>

<template>
  <span v-if="cls" class="inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold" :class="cls">{{ label }}</span>
  <span v-else class="text-sm text-slate-700">{{ label }}</span>
</template>