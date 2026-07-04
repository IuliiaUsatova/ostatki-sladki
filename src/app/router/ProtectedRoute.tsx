import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'

import { useAuthStore } from '../../features/auth/store/authStore'

type ProtectedRouteProps = {
  children: ReactNode
}

function ProtectedRoute({ children }: ProtectedRouteProps) {
  const isLoading = useAuthStore((state) => state.isLoading)
  const userId = useAuthStore((state) => state.userId)
  if (isLoading) {
    return <h1>Проверяем доступ...</h1>
  }
  if (!userId) {
    return <Navigate to="/auth" replace />
  }
  return children
}

export default ProtectedRoute
