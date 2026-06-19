import { create } from 'zustand'

export type UserRole = 'buyer' | 'cafe' | 'admin'
export type CafeStatus = 'pending' | 'approved' | 'rejected'

type AuthUser = {
  userId: string
  email: string
  role: UserRole | null
  cafeStatus: CafeStatus | null
}

type AuthState = {
  userId: string | null
  email: string | null
  role: UserRole | null
  cafeStatus: CafeStatus | null
  isLoading: boolean
  error: string | null
  clearAuth: () => void
  setAuthUser: (user: AuthUser) => void
  setAuthLoading: (isLoading: boolean) => void
  setAuthError: (error: string) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  userId: null,
  email: null,
  role: null,
  cafeStatus: null,
  isLoading: true,
  error: null,
  clearAuth: () =>
    set({
      userId: null,
      email: null,
      role: null,
      cafeStatus: null,
      isLoading: false,
      error: null,
    }),
  setAuthUser: (user) =>
    set({
      userId: user.userId,
      email: user.email,
      role: user.role,
      cafeStatus: user.cafeStatus,
      isLoading: false,
      error: null,
    }),
  setAuthLoading: (isLoading) =>
    set({
      isLoading: isLoading,
    }),
  setAuthError: (error) =>
    set({
      error: error,
      isLoading: false,
    }),
}))
