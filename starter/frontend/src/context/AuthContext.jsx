import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { onUnauthorized } from '../api/client.js'
import * as api from '../api/switchboard.js'

const AuthContext = createContext(null)

// status: 'loading' | 'authenticated' | 'anonymous' | 'error'
export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null, error: null })

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.getMe()
      setState({ status: 'authenticated', user: data, error: null })
      return true
    } catch (error) {
      if (error.status === 401) setState({ status: 'anonymous', user: null, error: null })
      else setState((s) => ({ ...s, status: s.user ? s.status : 'error', error }))
      return false
    }
  }, [])

  useEffect(() => {
    refresh()
    onUnauthorized(() => setState({ status: 'anonymous', user: null, error: null }))
    return () => onUnauthorized(null)
  }, [refresh])

  const signIn = useCallback(() => {
    // Full navigation: the backend redirects to the IdP (authorization code + PKCE).
    window.location.assign('/auth/login')
  }, [])

  const signOut = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      setState({ status: 'anonymous', user: null, error: null })
    }
  }, [])

  const value = useMemo(() => ({ ...state, refresh, signIn, signOut }), [state, refresh, signIn, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)
