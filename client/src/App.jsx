import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthContext.jsx'
import LoginPage from './pages/LoginPage.jsx'
import CitiesPage from './pages/CitiesPage.jsx'
import CityPlacesPage from './pages/CityPlacesPage.jsx'
import './App.css'

function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <p className="muted">Loading…</p>
  if (!user) return <Navigate to="/login" replace />
  return children
}

function Header() {
  const { user, logout } = useAuth()
  if (!user) return null
  return (
    <header className="app-header">
      <span className="brand">AI Trip Planner</span>
      <span className="header-right">
        <span className="muted">{user.email}</span>
        <button className="btn btn--ghost" onClick={logout}>Log out</button>
      </span>
    </header>
  )
}

export default function App() {
  return (
    <>
      <Header />
      <main className="app">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/cities" element={<RequireAuth><CitiesPage /></RequireAuth>} />
          <Route path="/cities/:cityId" element={<RequireAuth><CityPlacesPage /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/cities" replace />} />
        </Routes>
      </main>
    </>
  )
}
