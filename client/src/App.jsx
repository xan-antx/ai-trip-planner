import { useEffect, useState } from 'react'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

function App() {
  const [status, setStatus] = useState('checking')

  useEffect(() => {
    fetch(`${API_URL}/api/health`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => setStatus(data.status === 'ok' ? 'connected' : 'error'))
      .catch(() => setStatus('error'))
  }, [])

  const label = {
    checking: 'Checking backend…',
    connected: 'Backend connected',
    error: 'Backend not reachable',
  }[status]

  return (
    <main className="app">
      <h1>AI Trip Planner</h1>
      <p className={`status status--${status}`}>
        <span className="dot" aria-hidden="true" />
        {label}
      </p>
    </main>
  )
}

export default App
