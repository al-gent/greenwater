'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { appearanceKey, darkQuery, parseAppearance, type Appearance } from '@/lib/appearance'

interface AppearanceSettings {
  dark: boolean
  choose: (value: Appearance) => void
}

const AppearanceContext = createContext<AppearanceSettings | null>(null)

export function useAppearance() {
  const settings = useContext(AppearanceContext)
  if (!settings) throw new Error('AppearanceProvider is required')
  return settings
}

export default function AppearanceProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(false)
  const currentPreference = useRef<Appearance>('system')

  function apply(value: Appearance) {
    currentPreference.current = value
    const useDark = value === 'dark' || (value === 'system' && window.matchMedia(darkQuery).matches)
    document.documentElement.dataset.theme = useDark ? 'dark' : 'light'
    setDark(useDark)
  }

  useEffect(() => {
    let stored = null
    try { stored = localStorage.getItem(appearanceKey) } catch { /* Storage may be disabled. */ }
    apply(parseAppearance(stored))
    function sync(event: StorageEvent) {
      if (event.storageArea === window.localStorage && (event.key === appearanceKey || event.key === null)) {
        apply(parseAppearance(event.newValue))
      }
    }
    const media = window.matchMedia(darkQuery)
    function deviceChanged() {
      if (currentPreference.current === 'system') apply('system')
    }
    window.addEventListener('storage', sync)
    media.addEventListener('change', deviceChanged)
    return () => {
      window.removeEventListener('storage', sync)
      media.removeEventListener('change', deviceChanged)
    }
  }, [])

  function choose(value: Appearance) {
    apply(value)
    try { localStorage.setItem(appearanceKey, value) } catch { /* Still applies for this visit. */ }
  }

  return <AppearanceContext.Provider value={{ dark, choose }}>{children}</AppearanceContext.Provider>
}
