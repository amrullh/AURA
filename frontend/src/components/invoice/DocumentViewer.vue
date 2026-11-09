<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { api } from '@/api/client'

const props = defineProps<{ invoiceId: string; contentType: string }>()
const url = ref('')
const galat = ref(false)

onMounted(async () => {
  try {
    const res = await api.get(`/invoices/${props.invoiceId}/file`, { responseType: 'blob' })
    url.value = URL.createObjectURL(res.data)
  } catch {
    galat.value = true
  }
})
onBeforeUnmount(() => url.value && URL.revokeObjectURL(url.value))
</script>

<template>
  <div class="overflow-hidden rounded-2xl bg-slate-100">
    <iframe v-if="url && contentType === 'application/pdf'" :src="url" title="Dokumen asli" class="h-[620px] w-full" />
    <img v-else-if="url" :src="url" alt="Dokumen asli" class="w-full" />
    <div v-else class="flex h-[360px] items-center justify-center px-6 text-center text-sm text-muted">
      {{ galat ? 'Dokumen asli tidak tersedia pada mode data tiruan.' : 'Memuat dokumen...' }}
    </div>
  </div>
</template>