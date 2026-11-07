import { X } from 'lucide-react'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import tutorialHtml from '../../tutorial-demo.html?raw'

/**
 * 首次启动的自动控水教程。
 * 用一次性的 iframe 承载独立的 CSS/JS 动画，避免把教程动画的样式
 * 和正式页面互相污染；教程本身不读取账号或设备数据。
 */
export function AutoTutorial({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    document.body.classList.add('tutorial-open')
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('tutorial-open')
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="tutorial-overlay" role="dialog" aria-modal="true" aria-label="自动控水教程">
      <iframe
        className="tutorial-frame"
        title="自动控水教程"
        srcDoc={tutorialHtml}
        sandbox="allow-scripts"
      />
      <button type="button" className="tutorial-close" onClick={onClose} aria-label="关闭教程">
        <X size={18} />
        <span>关闭</span>
      </button>
    </div>,
    document.body,
  )
}
