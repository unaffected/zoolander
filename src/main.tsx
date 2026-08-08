import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyTheme, loadThemePref } from './lib/theme'

// Apply the stored theme before first paint to avoid a flash; App owns it after.
applyTheme(loadThemePref())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
