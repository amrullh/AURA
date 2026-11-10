<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <section class="mx-auto flex max-w-md flex-col items-center gap-4 py-20 text-center">
    <div class="font-head text-7xl font-extrabold text-brand">403</div>
    <h1 class="font-head text-2xl font-extrabold">Anda tidak punya akses ke halaman ini</h1>
    <p class="text-sm text-muted">Halaman ini hanya untuk peran tertentu. Kalau Anda merasa seharusnya bisa membukanya, hubungi Admin.</p>
    <RouterLink to="/beranda" class="btn btn-primary">Kembali ke Beranda</RouterLink>
  </section>
</template>