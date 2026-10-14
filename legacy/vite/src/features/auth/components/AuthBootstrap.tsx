import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useAuthStore } from '../store/authStore'

type AuthBootstrapProps = {
  children: ReactNode
}

function AuthBootstrap({ children }: AuthBootstrapProps) {
  const clearAuth = useAuthStore((state) => state.clearAuth)
  useEffect(() => {
    clearAuth()
  }, [clearAuth])
  return children
}

export default AuthBootstrap
