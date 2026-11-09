export type Role = 'STAF_FINANCE' | 'VERIFIKATOR' | 'ADMIN'
export type Action = 'APPROVE' | 'REJECT' | 'ESCALATE'

export interface User {
  id: string
  name: string
  email: string
  role: Role
  is_active: boolean
  last_login_at: string | null
}

export interface LoginResponse {
  access_token: string
  token_type: string
  expires_in: number
  user: User
}

export interface ApiError {
  error: { code: string; message: string; details?: { field: string; message: string }[] }
}