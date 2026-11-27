import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import { ToastProvider } from './context/ToastContext.jsx'
import { LoginPage } from './pages/LoginPage.jsx'
import { InboxPage } from './pages/InboxPage.jsx'
import { HomeRedirect, LoadingPage, NotFoundPage, ServerErrorPage } from './pages/StatusPages.jsx'

function RequireAuth({ children }) {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <LoadingPage />
  if (status === 'error') return <ServerErrorPage />
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<RequireAuth><HomeRedirect /></RequireAuth>} />
            <Route path="/w/:workspaceId/:view?/:conversationId?" element={<RequireAuth><InboxPage /></RequireAuth>} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
