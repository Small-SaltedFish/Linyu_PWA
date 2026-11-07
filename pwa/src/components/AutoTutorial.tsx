import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import tutorialHtml from '../../tutorial-demo.html?raw'

/**
 * 首次启动的自动控水教程。
 * 用一次性的 iframe 承载独立的 CSS/JS 动画，避免把教程动画的样式
 * 和正式页面互相污染；教程本身不读取账号或设备数据。
 *
 * iframe 的 srcDoc 首帧可能先绘制白底，所以先盖一层深色 loading，
 * 等 iframe onLoad 并让内容完成一次绘制后再淡入，避免打开时闪白。
 */
export function AutoTutorial({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return <TutorialDialog onClose={onClose} />
}

function TutorialDialog({ onClose }: { onClose: () => void }) {
  const [ready, setReady] = useState(false)
  const readyTimerRef = useRef(0)

  useEffect(() => {
    document.body.classList.add('tutorial-open')
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('tutorial-open')
      window.clearTimeout(readyTimerRef.current)
    }
  }, [onClose])

  return createPortal(
    <div
      className={`tutorial-overlay ${ready ? 'is-ready' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="自动控水教程"
    >
      <div className="tutorial-loading" aria-hidden={ready}>
        <span className="tutorial-loading__spinner" />
        <span>正在准备教程…</span>
      </div>
      <iframe
        className="tutorial-frame"
        title="自动控水教程"
        srcDoc={tutorialHtml}
        sandbox="allow-scripts"
        onLoad={() => {
          // 等一帧，确保 iframe 里的深色背景已经绘制出来
          readyTimerRef.current = window.setTimeout(() => setReady(true), 80)
        }}
      />
      <button type="button" className="tutorial-close" onClick={onClose} aria-label="关闭教程">
        <X size={18} />
        <span>关闭</span>
      </button>
    </div>,
    document.body,
  )
}
