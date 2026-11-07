import {
  Building2,
  ChevronRight,
  Download,
  Info,
  KeyRound,
  LockKeyhole,
  LogOut,
  Monitor,
  Moon,
  Smartphone,
  Sun,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BrandMark } from '../components/BrandMark'
import { PageHeader } from '../components/PageHeader'
import { Sheet } from '../components/Sheet'
import {
  ensureOk,
  resetPassword,
  sendPasswordResetCode,
  updatePassword,
} from '../api/live'
import { clearCredentials } from '../lib/credentials'
import { encryptPassword, smsSecret } from '../lib/md5'
import { useInstallPrompt } from '../lib/hooks'
import { APP_VERSION } from '../lib/version'
import { useAppStore } from '../store/useAppStore'
import { useUiStore } from '../store/useUiStore'

export function ProfilePage() {
  const navigate = useNavigate()
  const user = useAppStore((state) => state.user)
  const mode = useAppStore((state) => state.mode)
  const currentProjectName = useAppStore((state) => state.currentProjectName)
  const activeOrder = useAppStore((state) => state.activeOrder)
  const auth = useAppStore((state) => state.auth)
  const settings = useAppStore((state) => state.settings)
  const setTheme = useAppStore((state) => state.setTheme)
  const logout = useAppStore((state) => state.logout)
  const showToast = useUiStore((state) => state.showToast)
  const { canInstall, installed, install, isIos } = useInstallPrompt()
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [passwordMode, setPasswordMode] = useState<'old' | 'sms'>('old')
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [pwdCode, setPwdCode] = useState('')
  const [pwdCountdown, setPwdCountdown] = useState(0)
  const [pwdSending, setPwdSending] = useState(false)
  const [pwdSubmitting, setPwdSubmitting] = useState(false)
  const [pwdError, setPwdError] = useState('')

  useEffect(() => {
    if (pwdCountdown <= 0) return
    const timer = window.setTimeout(() => setPwdCountdown((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [pwdCountdown])

  const openPasswordSheet = () => {
    if (mode !== 'live' || !auth) {
      showToast('当前模式不支持修改密码', 'danger')
      return
    }
    setPasswordMode('old')
    setOldPwd('')
    setNewPwd('')
    setConfirmPwd('')
    setPwdCode('')
    setPwdError('')
    setPasswordOpen(true)
  }

  const sendPasswordCode = async () => {
    if (!auth || pwdSending || pwdCountdown > 0) return
    setPwdSending(true)
    setPwdError('')
    try {
      ensureOk(
        await sendPasswordResetCode(auth.telephone, smsSecret(auth.telephone)),
      )
      setPwdCountdown(20)
      showToast('验证码已发送', 'success')
    } catch (error) {
      setPwdError(error instanceof Error ? error.message : '验证码发送失败')
    } finally {
      setPwdSending(false)
    }
  }

  const submitPassword = async () => {
    if (!auth || pwdSubmitting) return
    setPwdError('')
    if (newPwd.length < 6) {
      setPwdError('新密码至少 6 位')
      return
    }
    if (newPwd !== confirmPwd) {
      setPwdError('两次输入的新密码不一致')
      return
    }
    if (passwordMode === 'old' && oldPwd.length < 6) {
      setPwdError('请输入当前密码')
      return
    }
    if (passwordMode === 'sms' && pwdCode.length < 4) {
      setPwdError('请输入短信验证码')
      return
    }

    setPwdSubmitting(true)
    try {
      if (passwordMode === 'old') {
        ensureOk(
          await updatePassword(
            auth,
            encryptPassword(oldPwd),
            encryptPassword(newPwd),
          ),
        )
      } else {
        ensureOk(await resetPassword(auth, encryptPassword(newPwd), pwdCode))
      }
      // 旧密码已经变了，本机记住的 hash 不能再用于自动登录
      clearCredentials()
      showToast(passwordMode === 'old' ? '密码已修改' : '密码已设置', 'success')
      setPasswordOpen(false)
    } catch (error) {
      setPwdError(error instanceof Error ? error.message : '修改失败，请重试')
    } finally {
      setPwdSubmitting(false)
    }
  }

  const doLogout = () => {
    if (activeOrder) {
      showToast('请先结束用水再退出登录', 'danger')
      setLogoutOpen(false)
      return
    }
    logout()
    setLogoutOpen(false)
    navigate('/login', { replace: true })
  }

  return (
    <main className="page profile-page">
      <PageHeader title="我的" subtitle="设置与账号" />

      <section className="profile-hero">
        <div className="profile-hero__orb" />
        <div className="profile-hero__copy">
          <h1>{user?.phone ?? '同学'}</h1>
          <p>{user?.school ?? '校园热水'}</p>
          <span>手机号登录</span>
        </div>
      </section>

      <section className="settings-card">
        <div className="settings-group-label">账号</div>
        <div className="settings-row">
          <span className="settings-row__icon settings-row__icon--blue">
            <Building2 size={19} />
          </span>
          <span className="settings-row__copy">
            <strong>当前项目</strong>
            <small>{currentProjectName || '未选择'}</small>
          </span>
          {mode === 'live' && <span className="tag tag--muted">实时</span>}
        </div>
        <button className="settings-row" onClick={openPasswordSheet}>
          <span className="settings-row__icon">
            <KeyRound size={19} />
          </span>
          <span className="settings-row__copy">
            <strong>修改密码</strong>
            <small>设置新密码，或通过短信重置</small>
          </span>
          <ChevronRight size={17} />
        </button>
      </section>

      <section className="settings-card">
        <div className="settings-group-label">偏好</div>
        <div className="settings-row settings-row--theme">
          <span className="settings-row__icon settings-row__icon--blue">
            {settings.theme === 'dark' ? (
              <Moon size={19} />
            ) : settings.theme === 'system' ? (
              <Monitor size={19} />
            ) : (
              <Sun size={19} />
            )}
          </span>
          <span className="settings-row__copy">
            <strong>外观</strong>
            <small>浅色 / 深色 / 跟随系统</small>
          </span>
        </div>
        <div className="theme-choice" role="radiogroup" aria-label="外观">
          {(
            [
              { key: 'light', label: '浅色', icon: <Sun size={14} /> },
              { key: 'dark', label: '深色', icon: <Moon size={14} /> },
              { key: 'system', label: '跟随系统', icon: <Monitor size={14} /> },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              role="radio"
              aria-checked={settings.theme === item.key}
              className={settings.theme === item.key ? 'is-active' : ''}
              onClick={() => setTheme(item.key)}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-card">
        <div className="settings-group-label">应用</div>
        <div className="settings-row">
          <span className="settings-row__icon settings-row__icon--blue">
            <Smartphone size={19} />
          </span>
          <span className="settings-row__copy">
            <strong>安装到桌面</strong>
            <small>{installed ? '已安装为 PWA' : isIos ? 'Safari 分享 → 添加到主屏幕' : '像 App 一样使用'}</small>
          </span>
          {canInstall ? (
            <button className="mini-button" onClick={() => void install()}>
              <Download size={15} /> 一键安装
            </button>
          ) : (
            <span className="tag tag--muted">{installed ? '已完成' : '浏览器菜单'}</span>
          )}
        </div>
        <button className="settings-row" onClick={() => setAboutOpen(true)}>
          <span className="settings-row__icon settings-row__icon--gray">
            <Info size={19} />
          </span>
          <span className="settings-row__copy">
            <strong>关于淋浴</strong>
            <small>v{APP_VERSION}</small>
          </span>
          <ChevronRight size={17} />
        </button>
      </section>

      <button className="logout-button" onClick={() => setLogoutOpen(true)}>
        <LogOut size={18} /> 退出登录
      </button>
      <p className="page-footnote">
        <BrandMark size={20} /> 淋浴 No-Ads · 非官方校园工具
      </p>

      <Sheet open={passwordOpen} onClose={() => setPasswordOpen(false)} title="修改密码">
        <div className="password-sheet">
          <div className="password-modes" role="tablist" aria-label="修改方式">
            <button
              type="button"
              role="tab"
              aria-selected={passwordMode === 'old'}
              className={passwordMode === 'old' ? 'is-active' : ''}
              onClick={() => {
                setPasswordMode('old')
                setPwdError('')
              }}
            >
              旧密码修改
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={passwordMode === 'sms'}
              className={passwordMode === 'sms' ? 'is-active' : ''}
              onClick={() => {
                setPasswordMode('sms')
                setPwdError('')
              }}
            >
              短信验证
            </button>
          </div>

          <p className="password-hint">
            {passwordMode === 'old'
              ? '需要当前密码。密码会按趣智校园的规则加密后提交。'
              : `验证码会发送到当前账号 ${auth?.telephone ?? ''}；没设置过密码也能用。`}
          </p>

          {passwordMode === 'old' ? (
            <label className="field">
              <span className="field__label">当前密码</span>
              <span className="field__control">
                <LockKeyhole size={18} />
                <input
                  type="password"
                  value={oldPwd}
                  onChange={(event) => setOldPwd(event.target.value)}
                  placeholder="请输入当前密码"
                  autoComplete="current-password"
                />
              </span>
            </label>
          ) : (
            <div className="field">
              <span className="field__label">短信验证码</span>
              <span className="field__control password-code">
                <input
                  value={pwdCode}
                  onChange={(event) => setPwdCode(event.target.value)}
                  placeholder="请输入验证码"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
                <button
                  type="button"
                  className="field__action"
                  onClick={() => void sendPasswordCode()}
                  disabled={pwdSending || pwdCountdown > 0}
                >
                  {pwdCountdown > 0 ? `${pwdCountdown}s` : pwdSending ? '发送中' : '获取验证码'}
                </button>
              </span>
            </div>
          )}

          <label className="field">
            <span className="field__label">新密码</span>
            <span className="field__control">
              <LockKeyhole size={18} />
              <input
                type="password"
                value={newPwd}
                onChange={(event) => setNewPwd(event.target.value)}
                placeholder="至少 6 位"
                autoComplete="new-password"
              />
            </span>
          </label>

          <label className="field">
            <span className="field__label">确认新密码</span>
            <span className="field__control">
              <LockKeyhole size={18} />
              <input
                type="password"
                value={confirmPwd}
                onChange={(event) => setConfirmPwd(event.target.value)}
                placeholder="再输入一次新密码"
                autoComplete="new-password"
              />
            </span>
          </label>

          {pwdError && <p className="password-error">{pwdError}</p>}

          <button
            type="button"
            className="primary-button primary-button--full"
            onClick={() => void submitPassword()}
            disabled={pwdSubmitting}
          >
            {pwdSubmitting ? '提交中…' : '确认修改'}
          </button>
        </div>
      </Sheet>

      <Sheet open={logoutOpen} onClose={() => setLogoutOpen(false)} title="退出登录？">
        <div className="confirm-stack">
          <p>退出后需要重新登录才能使用扫码和开关水。本地登录信息会被清除。</p>
          <div className="sheet-actions">
            <button className="ghost-button" onClick={() => setLogoutOpen(false)}>
              取消
            </button>
            <button className="danger-button" onClick={doLogout}>
              退出
            </button>
          </div>
        </div>
      </Sheet>

      <Sheet open={aboutOpen} onClose={() => setAboutOpen(false)} title="关于淋浴">
        <div className="about-card">
          <BrandMark size={54} />
          <h2>淋浴 No-Ads</h2>
          <p>一个无广告的趣智校园 PWA 客户端。</p>
          <dl className="detail-list">
            <div>
              <dt>版本</dt>
              <dd>v{APP_VERSION}</dd>
            </div>
            <div>
              <dt>开源项目</dt>
              <dd>
                <ul className="oss-list">
                  <li><a href="https://github.com/facebook/react" target="_blank" rel="noreferrer">React</a></li>
                  <li><a href="https://github.com/remix-run/react-router" target="_blank" rel="noreferrer">React Router</a></li>
                  <li><a href="https://github.com/pmndrs/zustand" target="_blank" rel="noreferrer">Zustand</a></li>
                  <li><a href="https://github.com/vitejs/vite" target="_blank" rel="noreferrer">Vite</a></li>
                  <li><a href="https://github.com/vite-pwa/vite-plugin-pwa" target="_blank" rel="noreferrer">vite-plugin-pwa</a></li>
                  <li><a href="https://github.com/GoogleChrome/workbox" target="_blank" rel="noreferrer">Workbox</a></li>
                  <li><a href="https://github.com/lucide-icons/lucide" target="_blank" rel="noreferrer">lucide-react</a></li>
                  <li><a href="https://github.com/cozmo/jsQR" target="_blank" rel="noreferrer">jsQR</a></li>
                  <li><a href="https://github.com/yehu-imei/linyu" target="_blank" rel="noreferrer">淋浴（linyu）</a></li>
                </ul>
              </dd>
            </div>
          </dl>
          <div className="about-links">
            <Link to="/terms" onClick={() => setAboutOpen(false)}>用户协议</Link>
            <span>·</span>
            <Link to="/privacy" onClick={() => setAboutOpen(false)}>隐私政策</Link>
          </div>
        </div>
      </Sheet>
    </main>
  )
}
