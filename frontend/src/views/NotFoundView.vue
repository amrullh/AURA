<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <div class="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
    <div class="font-head text-7xl font-extrabold text-brand">404</div>
    <h1 class="font-head text-2xl font-extrabold">Halaman tidak ditemukan</h1>
    <p class="text-sm text-muted">Alamat yang Anda buka tidak ada atau sudah dipindahkan.</p>
    <RouterLink to="/beranda" class="btn btn-primary">Kembali ke Beranda</RouterLink>
  </div>
</template>