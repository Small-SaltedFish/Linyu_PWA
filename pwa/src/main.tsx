import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App.tsx'
import { setupPwaUpdates } from './lib/pwaUpdates'
import './styles.css'

/**
 * 禁止双指缩放。
 * - viewport 的 user-scalable=no 在 iOS Safari 上会被忽略，所以补 gesture 事件；
 * - touchmove 只在多指时 preventDefault，不影响单指滚动。
 */
function lockPageZoom() {
  const prevent = (event: Event) => {
    if (event.cancelable) event.preventDefault()
  }
  document.addEventListener('gesturestart', prevent, { passive: false })
  document.addEventListener('gesturechange', prevent, { passive: false })
  document.addEventListener('gestureend', prevent, { passive: false })
  document.addEventListener(
    'touchmove',
    (event) => {
      if (event.touches.length > 1 && event.cancelable) event.preventDefault()
    },
    { passive: false },
  )
}

lockPageZoom()

setupPwaUpdates()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
