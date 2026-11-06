import { ArrowRight, LockKeyhole, Phone, ShieldCheck, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BrandMark } from '../components/BrandMark'
import {
  clearCredentials,
  readCredentials,
  saveCredentials,
} from '../lib/credentials'
import { encryptPassword } from '../lib/md5'
import { useAppStore } from '../store/useAppStore'
import { useUiStore } from '../store/useUiStore'

export function LoginPage() {
  const navigate = useNavigate()
  const loggedIn = useAppStore((state) => state.loggedIn)
  const loading = useAppStore((state) => state.loading)
  const sessionError = useAppStore((state) => state.sessionError)
  const loginLive = useAppStore((state) => state.loginLive)
  const sendCodeApi = useAppStore((state) => state.sendCode)
  const showToast = useUiStore((state) => state.showToast)

  const [saved] = useState(() => readCredentials())
  const [mode, setMode] = useState<'sms' | 'password'>('sms')
  const [phone, setPhone] = useState(saved?.phone ?? '')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [remember, setRemember] = useState(saved?.remember ?? false)
  const [autoLogin, setAutoLogin] = useState(saved?.autoLogin ?? false)
  const [savedHash, setSavedHash] = useState(saved?.passwordHash ?? '')
  const [savedPhone, setSavedPhone] = useState(saved?.phone ?? '')
  const [autoTrying, setAutoTrying] = useState(false)
  const autoTriedRef = useRef(false)

  const normalizedPhone = phone.replace(/\D/g, '')
  const usingSavedPassword =
    mode === 'password' &&
    remember &&
    Boolean(savedHash) &&
    normalizedPhone === savedPhone

  useEffect(() => {
    const stored = saved
    if (autoTriedRef.current || loggedIn || !stored?.autoLogin) return
    autoTriedRef.current = true
    setMode('password')
    setAutoTrying(true)
    void loginLive({
      phone: stored.phone,
      mode: 'password',
      passwordHash: stored.passwordHash,
    })
      .then(() => showToast('已自动登录', 'success'))
      .catch((error) => {
        setAutoLogin(false)
        saveCredentials({ ...stored, autoLogin: false })
        showToast(error instanceof Error ? error.message : '自动登录失败', 'danger')
      })
      .finally(() => setAutoTrying(false))
  }, [loggedIn, loginLive, saved, showToast])

  useEffect(() => {
    if (loggedIn) navigate('/', { replace: true })
  }, [loggedIn, navigate])

  useEffect(() => {
    if (countdown <= 0) return
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [countdown])

  const canSubmit =
    normalizedPhone.length >= 11 &&
    (mode === 'sms'
      ? code.length >= 4
      : password.length >= 6 || usingSavedPassword)

  const dismissKeyboard = () => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  }

  const submit = async () => {
    if (!canSubmit) {
      showToast(mode === 'sms' ? '请填写手机号和验证码' : '请填写手机号和密码', 'danger')
      return
    }
    dismissKeyboard()
    const useSaved = mode === 'password' && password.length === 0 && usingSavedPassword
    const passwordHash =
      mode === 'password'
        ? useSaved
          ? savedHash
          : encryptPassword(password)
        : undefined
    try {
      await loginLive({
        phone: normalizedPhone,
        mode,
        password: mode === 'password' && !useSaved ? password : undefined,
        passwordHash,
        code: mode === 'sms' ? code : undefined,
      })
      if (mode === 'password') {
        if (remember && passwordHash) {
          saveCredentials({
            phone: normalizedPhone,
            passwordHash,
            remember: true,
            autoLogin,
          })
          setSavedHash(passwordHash)
          setSavedPhone(normalizedPhone)
        } else {
          clearCredentials()
          setSavedHash('')
          setSavedPhone('')
        }
      }
      showToast('登录成功', 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '登录失败', 'danger')
    }
  }

  const sendCode = async () => {
    if (phone.replace(/\D/g, '').length !== 11) {
      showToast('请先填写 11 位手机号', 'danger')
      return
    }
    try {
      await sendCodeApi(phone)
      setCountdown(20)
      showToast('验证码已发送', 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '验证码发送失败', 'danger')
    }
  }

  return (
    <main className="login-page">
      <div className="login-page__glow" />
      <section className="login-hero">
        <BrandMark size={58} />
        <div className="login-hero__copy">
          <span className="eyebrow">LINYU · NO-ADS</span>
          <h1>淋浴</h1>
          <p>不烧心地洗个澡。</p>
        </div>
        <div className="login-hero__badges">
          <span className="soft-badge">
            <ShieldCheck size={14} /> NO-ADS
          </span>
          <span className="soft-badge">
            <Sparkles size={14} /> 仅限 4G 水表
          </span>
        </div>
      </section>

      <section className="login-card">
        <div className="segmented">
          <button
            className={mode === 'sms' ? 'is-active' : ''}
            onClick={() => setMode('sms')}
            type="button"
          >
            验证码登录
          </button>
          <button
            className={mode === 'password' ? 'is-active' : ''}
            onClick={() => setMode('password')}
            type="button"
          >
            密码登录
          </button>
        </div>

        <label className="field">
          <span className="field__label">手机号</span>
          <span className="field__control">
            <Phone size={18} />
            <span className="field__prefix">+86</span>
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              inputMode="tel"
              placeholder="请输入手机号"
              autoComplete="tel"
            />
          </span>
        </label>

        {mode === 'sms' ? (
          <label className="field">
            <span className="field__label">验证码</span>
            <span className="field__control">
              <ShieldCheck size={18} />
              <input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                inputMode="numeric"
                placeholder="请输入验证码"
                autoComplete="one-time-code"
              />
              <button
                type="button"
                className="field__action"
                onClick={sendCode}
                disabled={countdown > 0 || loading}
              >
                {countdown > 0 ? `${countdown}s` : '获取验证码'}
              </button>
            </span>
          </label>
        ) : (
          <label className="field">
            <span className="field__label">密码</span>
            <span className="field__control">
              <LockKeyhole size={18} />
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                placeholder={usingSavedPassword ? '已记住密码，可直接登录' : '请输入密码'}
                autoComplete="current-password"
              />
            </span>
          </label>
        )}

        {mode === 'password' && (
          <div className="login-options">
            <label>
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => {
                  const next = event.target.checked
                  setRemember(next)
                  if (!next) {
                    setAutoLogin(false)
                    clearCredentials()
                    setSavedHash('')
                    setSavedPhone('')
                  }
                }}
              />
              <span>记住密码</span>
            </label>
            <label className={remember ? '' : 'is-disabled'}>
              <input
                type="checkbox"
                checked={autoLogin}
                disabled={!remember}
                onChange={(event) => {
                  const next = event.target.checked
                  setAutoLogin(next)
                  if (next) setRemember(true)
                }}
              />
              <span>自动登录</span>
            </label>
          </div>
        )}

        {autoTrying && <p className="login-note">正在自动登录…</p>}

        <button
          className="primary-button"
          type="button"
          onClick={submit}
          disabled={!canSubmit || loading || autoTrying}
        >
          {autoTrying ? '自动登录中…' : loading ? '登录中…' : '登录'}
          <ArrowRight size={18} />
        </button>

        {sessionError && <p className="login-note login-note--danger">{sessionError}</p>}

        <p className="login-note">
          登录会直接请求趣智校园接口；本应用没有自建服务器，账号信息仅保存在本地。
        </p>
      </section>

      <p className="login-footer">
        <Link to="/terms">用户协议</Link>
        <span> · </span>
        <Link to="/privacy">隐私政策</Link>
        <br />
        第三方非官方 PWA · 使用前请阅读
      </p>
    </main>
  )
}
