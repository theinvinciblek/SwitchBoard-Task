import { useCallback, useEffect, useState } from 'react'

const KEY = 'sb:theme'

const readPreference = () => {
  try {
    return localStorage.getItem(KEY) || 'system'
  } catch {
    return 'system'
  }
}

const apply = (preference) => {
  const dark =
    preference === 'dark' ||
    (preference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}

// preference: 'light' | 'dark' | 'system'
export function useTheme() {
  const [preference, setPreference] = useState(readPreference)

  useEffect(() => {
    apply(preference)
    if (preference !== 'system') return undefined
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => apply('system')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [preference])

  const choose = useCallback((next) => {
    try {
      localStorage.setItem(KEY, next)
    } catch {
      /* not persisted */
    }
    setPreference(next)
  }, [])

  return [preference, choose]
}
