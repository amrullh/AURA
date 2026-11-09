<script setup lang="ts">
import type { Step } from '@/types/detail'

defineProps<{ steps: Step[]; iterations: number; max: number }>()
const detik = (ms: number) => (ms / 1000).toFixed(1).replace('.', ',') + ' detik'
</script>

<template>
  <div>
    <div class="mb-4 flex items-center justify-between">
      <div class="flex items-center gap-2.5">
        <div class="flex size-8 items-center justify-center rounded-full bg-brand font-head text-sm font-extrabold text-white">A</div>
        <h2 class="font-head text-lg font-extrabold">Langkah penyelidikan Aura</h2>
      </div>
      <span class="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-900">Iterasi {{ iterations }} dari {{ max }}</span>
    </div>
    <ol class="m-0 list-none p-0">
      <li v-for="(s, i) in steps" :key="s.step" class="flex gap-4">
        <div class="flex flex-col items-center">
          <span class="flex size-7 items-center justify-center rounded-full bg-brand-tint text-[13px] font-extrabold text-brand-dark">{{ s.step }}</span>
          <span v-if="i < steps.length - 1" class="my-1 w-0.5 flex-1 bg-brand-tint" />
        </div>
        <div class="flex flex-1 flex-col gap-2 pb-5">
          <div class="text-[13px] text-muted"><b>Iterasi {{ s.step }} dari {{ max }}</b> · {{ detik(s.duration_ms) }}</div>
          <div class="text-sm italic text-slate-700">Hipotesis: {{ s.hypothesis }}</div>
          <div class="flex flex-wrap items-center gap-2">
            <code class="rounded-lg bg-brand-light px-2 py-0.5 text-xs text-brand-dark">{{ s.tool }}</code>
            <span class="text-[13px] text-muted">{{ s.tool_args_summary }}</span>
          </div>
          <div class="rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm">{{ s.result_summary }}</div>
        </div>
      </li>
    </ol>
  </div>
</template>