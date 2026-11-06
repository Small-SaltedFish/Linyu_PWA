import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.classList.add('sheet-open')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('sheet-open')
    }
  }, [open, onClose])

  if (!open) return null

  // Portal 到 body：页面本身有 animation/transform/overflow，
  // 放在页面里会让 fixed 的 Sheet 被底部导航盖住（退出登录弹窗的按钮被挡）。
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <section
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet__handle" />
        {title && (
          <div className="sheet__header">
            <h2>{title}</h2>
            <button className="icon-button" onClick={onClose} aria-label="关闭">
              <X size={20} />
            </button>
          </div>
        )}
        <div className="sheet__body">{children}</div>
      </section>
    </div>,
    document.body,
  )
}
