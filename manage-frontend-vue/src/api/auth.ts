import { pinia } from '@/app/pinia'
import { http } from '@/lib/request'
import { useAuthStore } from '@/stores/auth'
import type {
  AuthResult,
  ChangePasswordRequest,
  LoginRequest,
  ProfileUpdateRequest,
  User,
} from '@/types/common'

export const login = async (payload: LoginRequest) => {
  const result = await http.post<AuthResult>('/auth/login', payload, {
    skipAuth: true,
    skipAuthRedirect: true,
    skipRefresh: true,
  })
  useAuthStore(pinia).setSession(result)
  return result
}

export const logout = async () => {
  const auth = useAuthStore(pinia)
  try {
    await http.post<void>(
      '/auth/logout',
      auth.refreshToken ? { refreshToken: auth.refreshToken } : {},
      { skipAuthRedirect: true, skipRefresh: true },
    )
  } finally {
    auth.clear()
  }
}

export const getCurrentUser = () => http.get<User>('/auth/me')
export const getProfile = () => http.get<User>('/me/profile')
export const updateProfile = async (payload: ProfileUpdateRequest) => {
  const user = await http.patch<User>('/me/profile', payload)
  useAuthStore(pinia).setUser(user)
  return user
}
export const changePassword = (payload: ChangePasswordRequest) =>
  http.post<void>('/me/change-password', payload)
