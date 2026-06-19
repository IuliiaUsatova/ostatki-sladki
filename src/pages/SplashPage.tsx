import { useAuthStore } from '../features/auth/store/authStore'

function SplashPage() {
  const isLoading = useAuthStore((state) => state.isLoading)
  const setAuthLoading = useAuthStore((state) => state.setAuthLoading)

  return (
    <>
      <h1>{isLoading ? 'Проверяем сессию...' : 'Готово'}</h1>
      <button type="button" onClick={() => setAuthLoading(false)}>
        Завершить проверку
      </button>
    </>
  )
}

export default SplashPage
