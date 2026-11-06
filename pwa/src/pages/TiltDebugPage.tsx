import { ArrowLeft, Compass, Download, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUiStore } from '../store/useUiStore'

type PermissionState = 'unsupported' | 'prompt' | 'granted' | 'denied'

interface OrientationSample {
  t: number
  alpha: number | null
  beta: number | null
  gamma: number | null
}

const FACE_DOWN_THRESHOLD = 160
const SAMPLE_LIMIT = 300

type OrientationCtor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>
}

export function TiltDebugPage() {
  const navigate = useNavigate()
  const showToast = useUiStore((state) => state.showToast)
  const supported = typeof DeviceOrientationEvent !== 'undefined'
  const secure = typeof window !== 'undefined' && window.isSecureContext
  const ctor = (supported ? DeviceOrientationEvent : null) as OrientationCtor | null
  const requiresPermission = typeof ctor?.requestPermission === 'function'

  const [permission, setPermission] = useState<PermissionState>(() => {
    if (!secure || !supported) return 'unsupported'
    if (requiresPermission) return 'prompt'
    return 'granted'
  })
  const [snapshot, setSnapshot] = useState<OrientationSample | null>(null)
  const [stats, setStats] = useState({ min: null as number | null, max: null as number | null, count: 0 })
  const [sampleCount, setSampleCount] = useState(0)
  const [lastAge, setLastAge] = useState(0)

  const latestRef = useRef<OrientationSample | null>(null)
  const minRef = useRef<number | null>(null)
  const maxRef = useRef<number | null>(null)
  const countRef = useRef(0)
  const samplesRef = useRef<OrientationSample[]>([])
  const listeningRef = useRef(false)

  const handleOrientation = useCallback((event: DeviceOrientationEvent) => {
    const alpha = typeof event.alpha === 'number' ? event.alpha : null
    const beta = typeof event.beta === 'number' ? event.beta : null
    const gamma = typeof event.gamma === 'number' ? event.gamma : null
    const sample: OrientationSample = { t: Date.now(), alpha, beta, gamma }
    latestRef.current = sample

    if (beta !== null) {
      minRef.current = minRef.current === null ? beta : Math.min(minRef.current, beta)
      maxRef.current = maxRef.current === null ? beta : Math.max(maxRef.current, beta)
      countRef.current += 1
    }

    samplesRef.current.push(sample)
    if (samplesRef.current.length > SAMPLE_LIMIT) samplesRef.current.shift()
  }, [])

  const startListening = useCallback(() => {
    if (listeningRef.current) return
    listeningRef.current = true
    window.addEventListener('deviceorientation', handleOrientation, true)
  }, [handleOrientation])

  const stopListening = useCallback(() => {
    if (!listeningRef.current) return
    listeningRef.current = false
    window.removeEventListener('deviceorientation', handleOrientation, true)
  }, [handleOrientation])

  useEffect(() => {
    if (permission !== 'granted') return
    startListening()
    return () => stopListening()
  }, [permission, startListening, stopListening])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const latest = latestRef.current
      if (latest) {
        setSnapshot(latest)
        setSampleCount(samplesRef.current.length)
        setLastAge(Math.max(0, Math.round((Date.now() - latest.t) / 1000)))
      }
      setStats({
        min: minRef.current,
        max: maxRef.current,
        count: countRef.current,
      })
    }, 100)
    return () => window.clearInterval(timer)
  }, [])

  const requestPermission = async () => {
    if (!secure || !supported) {
      setPermission('unsupported')
      return
    }
    if (!requiresPermission || !ctor?.requestPermission) {
      setPermission('granted')
      startListening()
      return
    }
    try {
      const result = await ctor.requestPermission()
      if (result === 'granted') {
        setPermission('granted')
        startListening()
      } else {
        setPermission('denied')
      }
    } catch {
      setPermission('denied')
    }
  }

  const reset = () => {
    minRef.current = null
    maxRef.current = null
    countRef.current = 0
    samplesRef.current = []
    latestRef.current = null
    setSnapshot(null)
    setStats({ min: null, max: null, count: 0 })
    setSampleCount(0)
    setLastAge(0)
  }

  const exportSamples = async () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      secureContext: secure,
      threshold: FACE_DOWN_THRESHOLD,
      stats: { min: minRef.current, max: maxRef.current, count: countRef.current },
      samples: samplesRef.current,
    }
    const text = JSON.stringify(payload, null, 2)
    try {
      await navigator.clipboard.writeText(text)
      showToast('采样 JSON 已复制', 'success')
    } catch {
      const blob = new Blob([text], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'tilt-samples.json'
      anchor.click()
      URL.revokeObjectURL(url)
    }
  }

  const beta = snapshot?.beta ?? null
  const faceDown = beta !== null && Math.abs(beta) >= FACE_DOWN_THRESHOLD
  const betaPercent = beta === null ? 50 : ((beta + 180) / 360) * 100
  const unsupportedReason = !secure
    ? '当前不是 HTTPS/localhost，浏览器不会给方向传感器数据'
    : !supported
      ? '当前浏览器没有 DeviceOrientationEvent'
      : ''

  return (
    <main className="page tilt-page">
      <header className="tilt-header">
        <button className="icon-button" onClick={() => navigate(-1)} aria-label="返回">
          <ArrowLeft size={20} />
        </button>
        <div>
          <span className="eyebrow">TILT DEBUG</span>
          <h1>翻转角度调试</h1>
        </div>
      </header>

      <section className="tilt-card">
        <p className="tilt-hint">
          把手机竖着拿 → 扣到桌面/翻转，观察 beta 范围。扣平通常接近{' '}
          <strong>±180°</strong>；扣下阈值 <strong>|beta| ≥ {FACE_DOWN_THRESHOLD}°</strong>，
          正面平放 <strong>|beta| ≤ 25°</strong>，拿起来看屏幕 <strong>75°–105°</strong>。
        </p>
        <div className="tilt-status-row">
          <span className={`tag ${faceDown ? 'tag--warn' : 'tag--muted'}`}>
            {faceDown ? '已朝下' : '未朝下'}
          </span>
          <span className="tag tag--muted">{permission === 'granted' ? '传感器已启用' : '传感器未启用'}</span>
          {lastAge > 2 && <span className="tag tag--danger">2 秒没有新数据</span>}
        </div>
        {unsupportedReason && <p className="tilt-error">{unsupportedReason}</p>}
        {permission === 'denied' && <p className="tilt-error">方向权限被拒绝，请在系统设置里允许后重试。</p>}
        {permission === 'prompt' && (
          <button className="primary-button primary-button--full" onClick={() => void requestPermission()}>
            <Compass size={18} /> 授权方向传感器
          </button>
        )}
      </section>

      <section className="tilt-card">
        <div className="tilt-values">
          <div>
            <small>beta（前后翻转）</small>
            <strong className={faceDown ? 'is-down' : ''}>{beta === null ? '—' : beta.toFixed(1)}°</strong>
          </div>
          <div>
            <small>|beta|</small>
            <strong>{beta === null ? '—' : Math.abs(beta).toFixed(1)}°</strong>
          </div>
          <div>
            <small>gamma（左右）</small>
            <strong>{snapshot?.gamma === null || snapshot?.gamma === undefined ? '—' : snapshot.gamma.toFixed(1)}°</strong>
          </div>
          <div>
            <small>alpha（朝向）</small>
            <strong>{snapshot?.alpha === null || snapshot?.alpha === undefined ? '—' : snapshot.alpha.toFixed(1)}°</strong>
          </div>
        </div>

        <div className="tilt-bar">
          <span className="tilt-bar__zone tilt-bar__zone--left" />
          <span className="tilt-bar__zone tilt-bar__zone--right" />
          <span className="tilt-bar__zero" />
          <span className="tilt-bar__marker" style={{ left: `${Math.min(100, Math.max(0, betaPercent))}%` }} />
        </div>
        <div className="tilt-bar__labels">
          <span>-180°</span>
          <span>0°</span>
          <span>180°</span>
        </div>

        <div className="tilt-stats">
          <span>
            min <strong>{stats.min === null ? '—' : stats.min.toFixed(1)}°</strong>
          </span>
          <span>
            max <strong>{stats.max === null ? '—' : stats.max.toFixed(1)}°</strong>
          </span>
          <span>
            样本 <strong>{stats.count}</strong>
          </span>
          <span>
            屏幕 <strong>{window.screen.orientation?.angle ?? 0}°</strong>
          </span>
        </div>

        <div className="tilt-actions">
          <button className="ghost-button" onClick={reset}>
            <RotateCcw size={16} /> 清零
          </button>
          <button className="ghost-button" onClick={() => void exportSamples()} disabled={!sampleCount}>
            <Download size={16} /> 复制采样 JSON
          </button>
        </div>
        <p className="tilt-hint">
          共 {sampleCount} 个采样（最多 {SAMPLE_LIMIT} 个）；扣下前先点「清零」，再翻转，然后复制 JSON 发我。
        </p>
      </section>

      <section className="tilt-card">
        <h2>怎么测</h2>
        <ol className="tilt-steps">
          <li>手机竖着拿在手里，看 beta 大约在 0~90°。</li>
          <li>点「清零」，然后像要停止用水一样把手机屏幕扣下。</li>
          <li>记录扣平后 beta 是 +180 还是 -180，以及握在手里时的范围。</li>
          <li>点「复制采样 JSON」，把内容发我；我按真实范围定阈值。</li>
        </ol>
        <p className="tilt-hint">
          必须 HTTPS 或 localhost；iOS 需要先点授权按钮。局域网 http 不会有传感器数据。
        </p>
      </section>
    </main>
  )
}
