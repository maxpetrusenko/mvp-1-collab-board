import { Route, Routes } from 'react-router-dom'

import { LoginPage } from './pages/LoginPage'
import { BoardPage } from './pages/BoardPage'
import { BoardEntryPage } from './pages/BoardEntryPage'
import { useAuth } from './state/AuthContext'

const App = () => {
  const { loading } = useAuth()

  if (loading) {
    return (
      <main className="loading-shell">
        <p>Loading session...</p>
      </main>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<BoardEntryPage />} />
      <Route path="/b/:boardId" element={<BoardPage />} />
      <Route path="*" element={<BoardEntryPage />} />
    </Routes>
  )
}

export default App
