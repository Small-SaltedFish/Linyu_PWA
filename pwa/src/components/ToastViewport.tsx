import { CheckCircle2, Info, TriangleAlert } from 'lucide-react'
import { useEffect } from 'react'
import { useUiStore } from '../store/useUiStore'

export function ToastViewport() {
  const toast = useUiStore((state) => state.toast)
  const clear = useUiStore((state) => state.clearToast)

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(clear, 2600)
    return () => window.clearTimeout(timer)
  }, [toast, clear])

  if (!toast) return null
  const Icon = toast.tone === 'success' ? CheckCircle2 : toast.tone === 'danger' ? TriangleAlert : Info

  return (
    <div className={`toast toast--${toast.tone}`} role="status" aria-live="polite">
      <Icon size={18} />
      <span>{toast.message}</span>
    </div>
  )
}
