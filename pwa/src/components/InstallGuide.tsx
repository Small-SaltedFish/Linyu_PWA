import { Copy, ExternalLink, Share } from 'lucide-react'
import { Sheet } from './Sheet'
import { useUiStore } from '../store/useUiStore'

export type InstallGuideMode =
  | 'ios-safari'
  | 'ios-chrome'
  | 'ios-other'
  | 'android'
  | 'generic'

const MODE_COPY: Record<InstallGuideMode, { eyebrow: string; steps: { title: string; text: string }[] }> =
  {
    'ios-safari': {
      eyebrow: 'Safari · 最新版',
      steps: [
        {
          title: '点地址栏左边的三条横线',
          text: '最新版 Safari 的页面菜单在链接左边，图标是三条横线；点开后再点「分享」。如果直接看到分享图标，也可以直接点。',
        },
        {
          title: '向下滑，点「添加到主屏幕」',
          text: '如果没看到，滑到最底部点「编辑操作」，把「添加到主屏幕」加回来。',
        },
        {
          title: '点右上角「添加」',
          text: '桌面会出现「淋浴」图标，打开后就是独立窗口，不再有 Safari 地址栏。',
        },
      ],
    },
    'ios-chrome': {
      eyebrow: 'Chrome · iOS',
      steps: [
        {
          title: '点右上角的分享按钮',
          text: 'Chrome 在 iPhone 上也可以把网页加到主屏幕。',
        },
        {
          title: '点「添加到主屏幕」',
          text: '在分享菜单里向下找，点击「添加到主屏幕」。',
        },
        {
          title: '点右上角「添加」',
          text: '桌面会出现「淋浴」图标；如果没有，请先把 Chrome 更新到最新版。',
        },
      ],
    },
    'ios-other': {
      eyebrow: 'iOS 浏览器',
      steps: [
        {
          title: '换用 Safari 或 Chrome',
          text: 'iPhone 上不同浏览器的安装入口不同。建议用 Safari 或 Chrome 打开本页。',
        },
        {
          title: '点浏览器的分享按钮',
          text: '在分享菜单里找到「添加到主屏幕」。',
        },
        {
          title: '点右上角「添加」',
          text: '添加后从桌面图标打开，就是独立窗口。',
        },
      ],
    },
    android: {
      eyebrow: 'Chrome · Android',
      steps: [
        {
          title: '点右上角的三个点',
          text: 'Chrome 的安装入口在右上角菜单里。某些版本会直接显示「安装应用」。',
        },
        {
          title: '点「安装应用」或「添加到主屏幕」',
          text: '不同 Chrome 版本名称不同。没有「安装应用」时，选「添加到主屏幕」也可以。',
        },
        {
          title: '确认安装',
          text: '完成后桌面会出现「淋浴」图标；从图标打开才是独立 PWA 窗口。',
        },
      ],
    },
    generic: {
      eyebrow: '浏览器安装',
      steps: [
        {
          title: '打开浏览器菜单',
          text: '在浏览器右上角或底部找到菜单。',
        },
        {
          title: '选择安装或添加到主屏幕',
          text: '不同浏览器的名称可能是「安装应用」「添加到主屏幕」「添加到桌面」。',
        },
        {
          title: '确认',
          text: '完成后从桌面图标打开。',
        },
      ],
    },
  }

export function InstallGuide({
  open,
  onClose,
  mode,
}: {
  open: boolean
  onClose: () => void
  mode: InstallGuideMode
}) {
  const showToast = useUiStore((state) => state.showToast)
  const copy = MODE_COPY[mode]
  const isIos = mode.startsWith('ios-')
  const isAndroid = mode === 'android'

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      showToast('链接已复制，请在浏览器中打开', 'success')
    } catch {
      showToast('复制失败，请手动复制地址栏链接', 'danger')
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="添加到主屏幕">
      <div className="safari-guide">
        {mode === 'ios-other' && (
          <div className="safari-guide__warning">
            <ExternalLink size={17} />
            <span>当前不是 Safari / Chrome，建议复制链接，用 Safari 或 Chrome 打开后再添加。</span>
          </div>
        )}
        {mode === 'android' && (
          <div className="safari-guide__warning">
            <ExternalLink size={17} />
            <span>
              Chrome 有时不会自动弹安装框；没关系，用右上角菜单也能安装。
            </span>
          </div>
        )}

        <div className={`safari-demo safari-demo--${mode}`} aria-hidden="true">
          <div className="safari-demo__page">
            <span className="safari-demo__url">
              {isIos && mode === 'ios-safari' && <b className="safari-demo__lines">☰</b>}
              <span>shower.ssf.moe</span>
              {isIos && mode === 'ios-safari' && <b className="safari-demo__share-inline">↑</b>}
              {mode === 'ios-chrome' && <b className="safari-demo__share-inline">↑</b>}
              {isAndroid && <b className="safari-demo__more-inline">⋮</b>}
            </span>
            <span className="safari-demo__sheet">
              <i className="safari-demo__handle" />
              <span className="safari-demo__row">拷贝</span>
              <span className="safari-demo__row safari-demo__row--target">
                ＋ {isAndroid ? '安装应用' : '添加到主屏幕'}
              </span>
              <span className="safari-demo__row">编辑操作</span>
            </span>
            <span className="safari-demo__hint">
              {mode === 'ios-safari' ? '三条横线 → 分享' : isAndroid ? '右上角菜单' : '点分享'}
            </span>
          </div>
        </div>

        <div className="safari-guide__copy">
          <div>
            <strong>{copy.eyebrow} 的操作</strong>
            <p>{mode === 'ios-safari' ? '菜单在链接左边，是三条横线。' : '不同版本入口位置可能略有不同。'}</p>
          </div>
          <button type="button" className="ghost-button" onClick={() => void copyLink()}>
            <Copy size={15} /> 复制链接
          </button>
        </div>

        <ol className="safari-steps">
          {copy.steps.map((step, index) => (
            <li key={step.title}>
              <span>
                {index === 0 ? <Share size={15} /> : index === 1 ? <b>＋</b> : <b>✓</b>}
              </span>
              <div>
                <strong>{step.title}</strong>
                <p>{step.text}</p>
              </div>
            </li>
          ))}
        </ol>

        <p className="safari-guide__foot">
          {mode === 'ios-safari'
            ? 'Safari 不支持网页主动弹安装框，所以需要手动添加。'
            : mode === 'ios-chrome'
              ? 'iOS Chrome 也可以创建桌面 PWA；如果菜单里没有，请更新 Chrome。'
              : mode === 'android'
                ? '从桌面图标打开后才是独立 PWA；浏览器标签页不算安装。'
                : '不同浏览器的安装入口名称可能不同，以实际菜单为准。'}
        </p>
      </div>
    </Sheet>
  )
}
