import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { BottomNav } from './components/BottomNav'
import { ToastViewport } from './components/ToastViewport'
import { HelpPage } from './pages/HelpPage'
import { HomePage } from './pages/HomePage'
import { LegalPage } from './pages/LegalPage'
import { LoginPage } from './pages/LoginPage'
import { ProfilePage } from './pages/ProfilePage'
import { RecordsPage } from './pages/RecordsPage'
import { ScanPage } from './pages/ScanPage'
import { ShowerPage } from './pages/ShowerPage'
import { SpikePage } from './pages/SpikePage'
import { DebugPage } from './pages/DebugPage'
import { TiltDebugPage } from './pages/TiltDebugPage'
import { trackEvent, trackInstall } from './lib/analytics'
import { primeSounds } from './lib/sounds'
import { useAppStore } from './store/useAppStore'
import { useUiStore } from './store/useUiStore'
import { APP_VERSION } from './lib/version'

let restoredOnce = false

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    // 路由切换时清理可能残留的 sheet 状态，并处理 iOS 键盘收起后的 fixed 导航偏移
    document.body.classList.remove('sheet-open')
    const toTop = () => window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    toTop()
    const timer = window.setTimeout(toTop, 140)
    return () => window.clearTimeout(timer)
  }, [pathname])
  return null
}

function Protected({ children }: { children: React.ReactNode }) {
  const loggedIn = useAppStore((state) => state.loggedIn)
  if (!loggedIn) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const theme = useAppStore((state) => state.settings.theme)
  const restoreSession = useAppStore((state) => state.restoreSession)
  const showToast = useUiStore((state) => state.showToast)

  useEffect(() => {
    if (restoredOnce) return
    restoredOnce = true
    void restoreSession()
  }, [restoreSession])

  useEffect(() => {
    try {
      const updatedAt = Number(sessionStorage.getItem('linyu_updated_at') ?? 0)
      if (updatedAt && Date.now() - updatedAt < 5 * 60 * 1000) {
        sessionStorage.removeItem('linyu_updated_at')
        showToast(`已更新到 v${APP_VERSION}`, 'success')
      }
    } catch {
      // ignore
    }
  }, [showToast])

  // 首次触摸解锁音频
  useEffect(() => {
    trackEvent('app_open')
    const onInstalled = () => trackInstall()
    window.addEventListener('appinstalled', onInstalled)
    return () => window.removeEventListener('appinstalled', onInstalled)
  }, [])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      primeSounds()
      const target = event.target as HTMLElement | null
      const clickable = target?.closest('button, [role="button"]') as HTMLButtonElement | null
      if (!clickable || clickable.disabled) return
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') primeSounds()
    }
    document.addEventListener('pointerdown', onPointerDown, { passive: true })
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme
      document.documentElement.dataset.theme = resolved
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', resolved === 'dark' ? '#0f1422' : '#f4f6fb')
    }
    apply()
    if (theme !== 'system') return
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  return (
    <div className="app-shell">
      <ScrollToTop />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/terms" element={<LegalPage kind="terms" />} />
        <Route path="/privacy" element={<LegalPage kind="privacy" />} />
        <Route path="/spike" element={<SpikePage />} />
        <Route path="/debug" element={<DebugPage />} />
        <Route path="/tilt" element={<TiltDebugPage />} />
        <Route
          path="/"
          element={
            <Protected>
              <HomePage />
            </Protected>
          }
        />
        <Route
          path="/scan"
          element={
            <Protected>
              <ScanPage />
            </Protected>
          }
        />
        <Route
          path="/shower"
          element={
            <Protected>
              <ShowerPage />
            </Protected>
          }
        />
        <Route
          path="/records"
          element={
            <Protected>
              <RecordsPage />
            </Protected>
          }
        />
        <Route
          path="/profile"
          element={
            <Protected>
              <ProfilePage />
            </Protected>
          }
        />
        <Route
          path="/help"
          element={
            <Protected>
              <HelpPage />
            </Protected>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
      <ToastViewport />
    </div>
  )
}
