import axios, { AxiosError } from 'axios'
import type { ApiError } from '@/types'

export const TOKEN_KEY = 'aura_token'
export const USER_KEY = 'aura_user'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 30000,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err: AxiosError<ApiError>) => {
    const code = err.response?.data?.error?.code
    // 401 token habis. INVALID_CREDENTIALS (salah sandi) ditangani halaman Login.
    if (err.response?.status === 401 && code !== 'INVALID_CREDENTIALS') {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
      window.location.href = '/login?expired=1'
    }
    return Promise.reject(err)
  },
)

export function pesanError(e: unknown, cadangan = 'Terjadi kesalahan. Coba lagi.') {
  const err = e as AxiosError<ApiError>
  return err.response?.data?.error?.message ?? cadangan
}