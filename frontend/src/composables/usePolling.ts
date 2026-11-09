import { onBeforeUnmount, onMounted } from 'vue'

export function usePolling(ambil: () => Promise<void>, perluLagi: () => boolean, jeda = 2500) {
  let timer: number | undefined
  async function putaran() {
    window.clearTimeout(timer)
    await ambil()
    if (perluLagi()) timer = window.setTimeout(putaran, jeda)
  }
  onMounted(putaran)
  onBeforeUnmount(() => window.clearTimeout(timer))
  return { muatUlang: putaran }
}