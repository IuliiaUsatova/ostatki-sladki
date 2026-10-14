import { BrowserRouter, Route, Routes } from 'react-router-dom'

import AuthWelcomePage from '../../pages/AuthWelcomePage'
import CafePendingPage from '../../pages/CafePendingPage'
import HomePage from '../../pages/HomePage'
import LoginPage from '../../pages/LoginPage'
import RegisterPage from '../../pages/RegisterPage'
import SplashPage from '../../pages/SplashPage'
import ProtectedRoute from './ProtectedRoute'

function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SplashPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth" element={<AuthWelcomePage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/home"
          element={
            <ProtectedRoute>
              <HomePage />
            </ProtectedRoute>
          }
        />
        <Route path="/cafe/pending" element={<CafePendingPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default AppRouter
