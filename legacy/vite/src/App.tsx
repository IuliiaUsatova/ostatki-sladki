import AppRouter from './app/router/AppRouter'
import AuthBootstrap from './features/auth/components/AuthBootstrap'

function App() {
  return (
    <AuthBootstrap>
      <AppRouter />
    </AuthBootstrap>
  )
}

export default App
