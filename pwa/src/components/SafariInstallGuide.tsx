import { Copy, ExternalLink, Share } from 'lucide-react'
import { Sheet } from './Sheet'
import { useUiStore } from '../store/useUiStore'

export function SafariInstallGuide({
  open,
  onClose,
  isSafari,
}: {
  open: boolean
  onClose: () => void
  isSafari: boolean
}) {
  const showToast = useUiStore((state) => state.showToast)

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      showToast('链接已复制，请用 Safari 打开', 'success')
    } catch {
      showToast('复制失败，请手动复制地址栏链接', 'danger')
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="添加到主屏幕">
      <div className="safari-guide">
        {!isSafari && (
          <div className="safari-guide__warning">
            <ExternalLink size={17} />
            <span>
              当前不是 Safari。iPhone 只有 Safari 能创建桌面 Web App；请复制链接，用 Safari 打开后再添加。
            </span>
          </div>
        )}

        <div className="safari-demo" aria-hidden="true">
          <div className="safari-demo__page">
            <span className="safari-demo__url">shower.ssf.moe</span>
            <span className="safari-demo__toolbar">
              <span className="safari-demo__more">⋯</span>
              <span className="safari-demo__share"><b>↑</b></span>
            </span>
            <span className="safari-demo__sheet">
              <i className="safari-demo__handle" />
              <span className="safari-demo__row">拷贝</span>
              <span className="safari-demo__row safari-demo__row--target">＋ 添加到主屏幕</span>
              <span className="safari-demo__row">编辑操作</span>
            </span>
            <span className="safari-demo__hint">先点分享，再向下滑</span>
          </div>
        </div>

        <div className="safari-guide__copy">
          <div>
            <strong>最新版 Safari 的操作</strong>
            <p>iOS 26/27 的 Safari 可能把分享按钮收在「⋯」里。</p>
          </div>
          <button type="button" className="ghost-button" onClick={() => void copyLink()}>
            <Copy size={15} /> 复制链接
          </button>
        </div>

        <ol className="safari-steps">
          <li>
            <span><Share size={15} /></span>
            <div>
              <strong>打开分享菜单</strong>
              <p>在 Safari 里点工具栏的「⋯」，再点「分享」；如果标签栏有分享按钮，直接点它。</p>
            </div>
          </li>
          <li>
            <span><b>＋</b></span>
            <div>
              <strong>向下滑，点「添加到主屏幕」</strong>
              <p>如果没看到，滑到最底部点「编辑操作」，把「添加到主屏幕」加回来。</p>
            </div>
          </li>
          <li>
            <span><b>✓</b></span>
            <div>
              <strong>点右上角「添加」</strong>
              <p>桌面会出现「淋浴」图标，打开后就是独立窗口，不再有 Safari 地址栏。</p>
            </div>
          </li>
        </ol>

        <p className="safari-guide__foot">
          微信、Chrome、Edge 等 iPhone 浏览器不能创建真正的桌面 PWA，只能打开网页。
        </p>
      </div>
    </Sheet>
  )
}
