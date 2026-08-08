export type ThemePref = 'light' | 'dark' | 'system'

const KEY = 'zoolander.ui.theme'

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

export function loadThemePref(): ThemePref {
  const stored = localStorage.getItem(KEY)
  return stored === 'light' || stored === 'dark' ? stored : 'system'
}

export function persistThemePref(pref: ThemePref): void {
  localStorage.setItem(KEY, pref)
}

export function applyTheme(pref: ThemePref): void {
  const dark = pref === 'dark' || (pref === 'system' && darkQuery().matches)
  document.documentElement.classList.toggle('dark', dark)
}

/** Re-apply on OS theme changes while the pref is 'system'. */
export function watchSystemTheme(getPref: () => ThemePref): () => void {
  const query = darkQuery()
  const onChange = () => applyTheme(getPref())
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
