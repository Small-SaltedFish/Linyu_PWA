import { ExternalLink, Share } from 'lucide-react'
import { Sheet } from './Sheet'

export type InstallGuideMode =
  | 'ios-safari'
  | 'ios-chrome'
  | 'ios-other'
  | 'android'
  | 'android-other'
  | 'generic'

const MODE_COPY: Record<InstallGuideMode, { eyebrow: string; steps: { title: string; text: string }[] }> =
  {
    'ios-safari': {
      eyebrow: 'iOS',
      steps: [
        {
          title: '点左下角的三条横线',
          text: '在屏幕左下角、地址栏左边，点三条横线，再点「共享」。',
        },
        {
          title: '点「查看更多」',
          text: '在共享菜单里点「查看更多」，展开全部操作。',
        },
        {
          title: '点「添加到主屏幕」',
          text: '向下找到「添加到主屏幕」，再点右上角「添加」。',
        },
      ],
    },
    'ios-chrome': {
      eyebrow: 'Chrome · iOS',
      steps: [
        {
          title: '点右上角的共享按钮',
          text: '在屏幕右上角、地址栏右边，点共享。',
        },
        {
          title: '点「查看更多」',
          text: '在共享菜单里点「查看更多」，展开全部操作。',
        },
        {
          title: '点「添加到主屏幕」',
          text: '向下找到「添加到主屏幕」，再点右上角「添加」。',
        },
      ],
    },
    'ios-other': {
      eyebrow: 'iOS · 其他浏览器',
      steps: [
        {
          title: '用 Safari 打开本页',
          text: 'iPhone 上建议用 Safari 安装；Safari 在屏幕左下角有三条横线。',
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
    'android-other': {
      eyebrow: 'Android · 其他浏览器',
      steps: [
        {
          title: '打开浏览器菜单',
          text: '不同浏览器入口不同，找「添加到主屏幕」「添加到桌面」或「快捷方式」。',
        },
        {
          title: '创建快捷方式',
          text: '这只是桌面快捷方式，打开后仍在浏览器中，不是独立 PWA。',
        },
        {
          title: '也可以不安装',
          text: '找不到入口就直接用浏览器访问，不影响扫码和开关水。',
        },
      ],
    },
    android: {
      eyebrow: 'Chrome · Android',
      steps: [
        {
          title: '点右上角的三个点',
          text: '打开 Chrome 右上角的菜单。',
        },
        {
          title: '下滑，点「安装并创建快捷方式」',
          text: '在菜单里向下滑，找到「安装并创建快捷方式」。不同版本可能叫「安装应用」。',
        },
        {
          title: '点「安装」',
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
  const copy = MODE_COPY[mode]
  const isIos = mode.startsWith('ios-')
  const isAndroid = mode === 'android'

  return (
    <Sheet open={open} onClose={onClose} title="添加到主屏幕">
      <div className="safari-guide">
        {mode === 'ios-other' && (
          <div className="safari-guide__warning">
            <ExternalLink size={17} />
            <span>当前不是 Safari / Chrome，请用 Safari 或 Chrome 打开后再添加。</span>
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

        {mode === 'android' && (
          <div className="safari-guide__note">
            <strong>小提示</strong>
            <p>
              Google Play 连不上时可能需要魔法上网；不想折腾的话，也可以点「添加到主屏幕」当快捷方式，
              继续在浏览器里使用。
            </p>
          </div>
        )}

        {mode === 'android-other' && (
          <div className="safari-guide__warning">
            <ExternalLink size={17} />
            <span>其他 Android 浏览器没有统一安装入口，能在菜单里找到「添加到主屏幕」就当快捷方式用。</span>
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
                : mode === 'android-other'
                  ? '这只是快捷方式，不是独立 PWA；能正常扫码用水就够了。'
                  : '不同浏览器的安装入口名称可能不同，以实际菜单为准。'}
        </p>

        {mode === 'android' && (
          <div className="safari-guide__trouble">
            <strong>卡在通知栏「正在安装」？</strong>
            <p>
              先下拉通知栏取消，完全关闭 Chrome 再重开；确认 Google Play 服务可用。大陆网络下 WebAPK
              可能连不上 Google 的安装服务，会一直卡住。
            </p>
            <p>
              解决顺序：改用菜单里的「添加到主屏幕」创建快捷方式 → 换 Edge / Samsung Internet 试一次
              → 仍然不行就继续浏览器使用，或安装单独的 APK / TWA 壳。
            </p>
          </div>
        )}
      </div>
    </Sheet>
  )
}
