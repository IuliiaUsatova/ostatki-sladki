import { useAuthStore } from '../features/auth/store/authStore'

function SplashPage() {
  const isLoading = useAuthStore((state) => state.isLoading)
  const clearAuth = useAuthStore((state) => state.clearAuth)

  return (
    <>
      <h1>{isLoading ? 'Проверяем сессию...' : 'Готово'}</h1>
      <button type="button" onClick={clearAuth}>
        Завершить проверку
      </button>
    </>
  )
}

export default SplashPage
