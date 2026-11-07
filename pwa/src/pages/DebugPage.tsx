import { ArrowLeft, Bug, Compass, Cookie, FlaskConical, RefreshCw, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { applyPendingUpdate, checkForUpdateNow } from '../lib/pwaUpdates'
import { useAppStore } from '../store/useAppStore'
import { useUiStore } from '../store/useUiStore'

export function DebugPage() {
  const navigate = useNavigate()
  const loginDemo = useAppStore((state) => state.loginDemo)
  const showToast = useUiStore((state) => state.showToast)
  const [checking, setChecking] = useState(false)

  const enterDemo = () => {
    loginDemo()
    showToast('已进入演示模式', 'success')
    navigate('/', { replace: true })
  }

  const clearCookies = () => {
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    const names = document.cookie
      .split(';')
      .map((part) => part.split('=')[0]?.trim())
      .filter(Boolean)
    for (const name of names) {
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${secure}`
    }
    showToast('已清除本站 Cookie', 'success')
  }

  const checkUpdate = async () => {
    setChecking(true)
    try {
      const found = await checkForUpdateNow()
      if (!found) {
        showToast('当前已是最新版本', 'default')
        return
      }
      const applied = await applyPendingUpdate()
      if (!applied) {
        showToast('发现新版本，但当前有进行中用水，请结束后再更新', 'danger')
        return
      }
      showToast('正在应用更新…', 'success')
    } catch {
      showToast('检查更新失败，请稍后再试', 'danger')
    } finally {
      setChecking(false)
    }
  }

  return (
    <main className="page debug-page">
      <header className="debug-header">
        <button className="icon-button" onClick={() => navigate(-1)} aria-label="返回">
          <ArrowLeft size={20} />
        </button>
        <div>
          <span className="eyebrow">DEBUG</span>
          <h1>调试工具</h1>
        </div>
      </header>

      <section className="debug-card">
        <div className="debug-card__head">
          <span className="debug-card__icon">
            <FlaskConical size={19} />
          </span>
          <div>
            <strong>演示模式</strong>
            <small>使用本地演示数据进入首页，不发送真实请求</small>
          </div>
        </div>
        <button className="primary-button primary-button--full" onClick={enterDemo}>
          进入演示模式
        </button>
      </section>

      <section className="debug-card">
        <div className="debug-card__head">
          <span className="debug-card__icon">
            <Compass size={19} />
          </span>
          <div>
            <strong>姿态调试</strong>
            <small>查看 beta / gamma / alpha 与扣平判定</small>
          </div>
        </div>
        <button className="ghost-button" onClick={() => navigate('/tilt')}>
          打开翻转角度调试
        </button>
      </section>

      <section className="debug-card">
        <div className="debug-card__head">
          <span className="debug-card__icon">
            <Bug size={19} />
          </span>
          <div>
            <strong>API 联调</strong>
            <small>真实登录、设备、开关阀、账单与预扣退款测试</small>
          </div>
        </div>
        <button className="ghost-button" onClick={() => navigate('/spike')}>
          打开 Spike 工具
        </button>
      </section>

      <section className="debug-card">
        <div className="debug-card__head">
          <span className="debug-card__icon">
            <Cookie size={19} />
          </span>
          <div>
            <strong>清除所有 Cookie</strong>
            <small>清除自动翻转、教程提示、充值直跳等站点 Cookie；不会退出账号</small>
          </div>
        </div>
        <button className="ghost-button" onClick={clearCookies}>
          <Cookie size={15} /> 清除 Cookie
        </button>
      </section>

      <section className="debug-card">
        <div className="debug-card__head">
          <span className="debug-card__icon">
            <RotateCcw size={19} />
          </span>
          <div>
            <strong>PWA 更新</strong>
            <small>启动时会自动检查一次；也可以在这里手动检查</small>
          </div>
        </div>
        <button className="ghost-button" onClick={() => void checkUpdate()} disabled={checking}>
          <RefreshCw size={15} /> {checking ? '检查中…' : '检查更新'}
        </button>
      </section>

      <p className="debug-footnote">
        调试页面不在一级导航中显示，直接访问 <code>/#/debug</code>。
      </p>
    </main>
  )
}
