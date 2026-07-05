import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../features/auth/store/authStore'

function SplashPage() {
  const isLoading = useAuthStore((state) => state.isLoading)
  const clearAuth = useAuthStore((state) => state.clearAuth)
  const setAuthUser = useAuthStore((state) => state.setAuthUser)
  const navigate = useNavigate()

  function handleTestBuyerLogin() {
    setAuthUser({
      userId: 'test-buyer-id',
      email: 'buyer@test.com',
      role: 'buyer',
      cafeStatus: null,
    })
    navigate('/home')
  }

  return (
    <>
      <h1>{isLoading ? 'Проверяем сессию...' : 'Готово'}</h1>
      <button type="button" onClick={clearAuth}>
        Завершить проверку
      </button>
      <button type="button" onClick={handleTestBuyerLogin}>
        Войти как покупатель
      </button>
    </>
  )
}

export default SplashPage
