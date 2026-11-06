import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  MapPin,
  Pause,
  Power,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { DeviceGlyph } from '../components/DeviceGlyph'
import { Sheet } from '../components/Sheet'
import {
  consumeAutoFlipOnStart,
  hasMotionPermissionGranted,
  markMotionPermissionGranted,
  peekAutoFlipOnStart,
} from '../lib/autoFlip'
import { formatDuration, formatMoney, formatShortDuration } from '../lib/format'
import { trackEvent } from '../lib/analytics'
import { useElapsed } from '../lib/hooks'
import {
  playCloseSound,
  playFinishSound,
  playOpenSound,
  playTickSound,
  primeSounds,
} from '../lib/sounds'
import { useFlipZones } from '../lib/useFlipZones'
import { useWakeLock } from '../lib/useWakeLock'
import { useAppStore } from '../store/useAppStore'
import { useUiStore } from '../store/useUiStore'
import type { Bill, Device } from '../types'

const HOLD_MS = 5000
const FLIP_COOLDOWN_MS = 3000
const LOOK_END_MS = 3000
const LOOK_GRACE_MS = 15000

type Phase = 'running' | 'closing' | 'paused' | 'opening'

type SessionSummary = {
  amount: number
  duration: number
  count: number
}

const summarize = (bills: Bill[]): SessionSummary => ({
  amount: bills.reduce((sum, bill) => sum + bill.amount, 0),
  duration: bills.reduce((sum, bill) => sum + bill.duration, 0),
  count: bills.length,
})

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

export function ShowerPage() {
  const navigate = useNavigate()
  const mode = useAppStore((state) => state.mode)
  const activeOrder = useAppStore((state) => state.activeOrder)
  const stopOrder = useAppStore((state) => state.stopOrder)
  const stopWater = useAppStore((state) => state.stopWater)
  const startWater = useAppStore((state) => state.startWater)
  const balance = useAppStore((state) => state.balance)
  const showToast = useUiStore((state) => state.showToast)

  const elapsed = useElapsed(activeOrder?.startedAt)

  const [summary, setSummary] = useState<SessionSummary | null>(null)
  const [stopping, setStopping] = useState(false)
  const [phase, setPhase] = useState<Phase>('running')
  // 暂停时 activeOrder 已清空，但自动模式仍需要屏幕常亮，否则息屏会直接退出自动模式
  const wakeLock = useWakeLock(Boolean(activeOrder) || phase !== 'running')
  const [pausedDevice, setPausedDevice] = useState<Device | null>(null)
  const [autoMode, setAutoMode] = useState(
    () => Boolean(activeOrder) && peekAutoFlipOnStart(),
  )
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [cooldownTick, setCooldownTick] = useState(0)
  const [lookActive, setLookActive] = useState(false)
  const [lookLeft, setLookLeft] = useState(LOOK_END_MS / 1000)
  const [lookGraceUntil, setLookGraceUntil] = useState(Number.POSITIVE_INFINITY)
  const [graceTick, setGraceTick] = useState(0)
  const [sessionBills, setSessionBills] = useState<Bill[]>([])
  const [allowScroll, setAllowScroll] = useState(false)
  const pageRef = useRef<HTMLElement | null>(null)

  const holdRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    until: 0,
    lastHaptic: 5,
    lastSound: 5,
  })
  const holdTimerRef = useRef(0)
  const holdTickRef = useRef(0)

  const autoModeRef = useRef(autoMode)
  const phaseRef = useRef<Phase>('running')
  const cooldownRef = useRef(0)
  const pausedDeviceRef = useRef<Device | null>(null)
  const armedRef = useRef(false)
  const lookGraceSetRef = useRef(false)
  const lastLookTickRef = useRef(0)
  const actionsRef = useRef({
    pause: () => {},
    resume: () => {},
    endLook: () => {},
    finish: () => {},
  })

  const flip = useFlipZones({
    enabled: autoMode,
    assumeGranted: hasMotionPermissionGranted(),
  })
  const resetFlipZones = flip.reset

  const [holding, setHolding] = useState(false)
  const [holdLeft, setHoldLeft] = useState(HOLD_MS / 1000)

  const stopHoldTimers = () => {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current)
      holdTimerRef.current = 0
    }
    if (holdTickRef.current) {
      window.clearInterval(holdTickRef.current)
      holdTickRef.current = 0
    }
  }

  const resetHold = () => {
    stopHoldTimers()
    holdRef.current.active = false
    setHolding(false)
    setHoldLeft(HOLD_MS / 1000)
  }

  const finish = async () => {
    if (stopping || phaseRef.current === 'closing' || phaseRef.current === 'opening') return
    setAutoMode(false)
    autoModeRef.current = false
    setLookActive(false)
    resetHold()

    if (!activeOrder) {
      if (sessionBills.length > 0) {
        playFinishSound()
        const result = summarize(sessionBills)
        trackEvent('water_end', { durationSec: result.duration })
        setSummary(result)
      } else {
        showToast('已结束用水', 'success')
        navigate('/', { replace: true })
      }
      return
    }

    setStopping(true)
    try {
      const bill = mode === 'live' ? await stopWater() : stopOrder()
      if (bill) {
        playFinishSound()
        const allBills = [bill, ...sessionBills]
        const result = summarize(allBills)
        setSessionBills(allBills)
        trackEvent('water_end', { durationSec: result.duration })
        setSummary(result)
        showToast('已结束，账单已生成', 'success')
      } else {
        navigate('/', { replace: true })
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : '结束失败，请重试', 'danger')
    } finally {
      setStopping(false)
    }
  }

  /** 翻扣下：暂停（closeOrder + 结算），失败重试 3 次 */
  const pauseByFlip = async () => {
    if (!autoModeRef.current || phaseRef.current !== 'running') return
    if (Date.now() < cooldownRef.current || !armedRef.current) return
    const order = useAppStore.getState().activeOrder
    if (!order) return

    const device = order.device
    setPhase('closing')
    phaseRef.current = 'closing'

    let lastError: unknown = null
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const bill = mode === 'live' ? await stopWater() : stopOrder()
        if (!bill) throw new Error('关阀结果未确认')
        setPausedDevice(device)
        pausedDeviceRef.current = device
        setSessionBills((prev) => [bill, ...prev])
        setPhase('paused')
        phaseRef.current = 'paused'
        const until = Date.now() + FLIP_COOLDOWN_MS
        setCooldownUntil(until)
        cooldownRef.current = until
        playCloseSound()
        showToast('已暂停，翻正面平放继续', 'success')
        return
      } catch (error) {
        lastError = error
        if (attempt < 2) await sleep(700)
      }
    }

    setAutoMode(false)
    autoModeRef.current = false
    setPhase('running')
    phaseRef.current = 'running'
    showToast(
      `${lastError instanceof Error ? lastError.message : '关阀失败'}，已退出自动模式，请手动结束`,
      'danger',
    )
  }

  /** 翻正面：重新开阀（新订单），失败立即退出自动模式 */
  const resumeByFlip = async () => {
    if (!autoModeRef.current || phaseRef.current !== 'paused') return
    const device = pausedDeviceRef.current
    if (!device || Date.now() < cooldownRef.current) return

    const wallet = Number(useAppStore.getState().walletMoney)
    const required = device.withhold ?? 5
    if (Number.isFinite(wallet) && wallet < required) {
      setAutoMode(false)
      autoModeRef.current = false
      showToast(
        `余额 ¥${wallet.toFixed(2)} 低于预扣 ¥${required.toFixed(2)}，自动模式已退出`,
        'danger',
      )
      return
    }

    setPhase('opening')
    phaseRef.current = 'opening'
    try {
      if (mode === 'live') await startWater(device)
      else useAppStore.getState().startOrder(device)

      setPhase('running')
      phaseRef.current = 'running'
      setPausedDevice(null)
      pausedDeviceRef.current = null
      const until = Date.now() + FLIP_COOLDOWN_MS
      setCooldownUntil(until)
      cooldownRef.current = until
      playOpenSound()
      showToast('已继续用水', 'success')
    } catch (error) {
      setAutoMode(false)
      autoModeRef.current = false
      setPhase('paused')
      phaseRef.current = 'paused'
      showToast(
        `${error instanceof Error ? error.message : '开阀失败'}，已退出自动模式`,
        'danger',
      )
    }
  }

  const endByLook = async () => {
    if (!autoModeRef.current) return
    setAutoMode(false)
    autoModeRef.current = false
    setLookActive(false)
    showToast('检测到拿起手机，已结束用水', 'success')
    // 水已经关掉（paused）时也要走 finish()，这样会汇总本次所有账单并弹结算页，
    // 不能直接 navigate('/')。
    await finish()
  }

  const armLookGrace = () => {
    if (lookGraceSetRef.current) return
    lookGraceSetRef.current = true
    setLookGraceUntil(Date.now() + LOOK_GRACE_MS)
  }

  const authorizeAuto = async () => {
    const ok = await flip.requestPermission()
    if (!ok) {
      setAutoMode(false)
      autoModeRef.current = false
      showToast(
        flip.permission === 'unsupported'
          ? '当前环境不支持方向传感器，需要 HTTPS'
          : '未获得方向传感器权限',
        'danger',
      )
      return
    }
    markMotionPermissionGranted()
    armedRef.current = false
    armLookGrace()
  }

  const toggleAutoMode = async () => {
    if (autoMode) {
      setAutoMode(false)
      autoModeRef.current = false
      setLookActive(false)
      flip.reset()
      return
    }
    if (phase === 'closing' || phase === 'opening') {
      showToast('正在处理开关阀，请稍候', 'danger')
      return
    }
    flip.reset()
    const ok = await flip.requestPermission()
    if (!ok) {
      showToast(
        flip.permission === 'unsupported'
          ? '当前环境不支持方向传感器，需要 HTTPS'
          : '未获得方向传感器权限',
        'danger',
      )
      return
    }
    markMotionPermissionGranted()
    setAutoMode(true)
    autoModeRef.current = true
    armedRef.current = false
    armLookGrace()
    showToast('自动模式已开启', 'success')
  }

  // 每次渲染同步最新状态/动作到 ref，供传感器回调和定时器使用
  useEffect(() => {
    autoModeRef.current = autoMode
    phaseRef.current = phase
    cooldownRef.current = cooldownUntil
    pausedDeviceRef.current = pausedDevice
    actionsRef.current = {
      pause: () => void pauseByFlip(),
      resume: () => void resumeByFlip(),
      endLook: () => void endByLook(),
      finish: () => void finish(),
    }
  })

  useEffect(() => {
    consumeAutoFlipOnStart()
    // 路由切换后如果 AudioContext 被挂起，进页面时再尝试唤醒一次
    primeSounds()
  }, [])

  useEffect(() => {
    if (autoMode && flip.permission === 'ready') armLookGrace()
    // armLookGrace uses a ref guard; only the first enable starts the 15s grace
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMode, flip.permission])

  // 页面隐藏/被挂起：只退出自动模式，不动阀门
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden') {
        setAutoMode(false)
        autoModeRef.current = false
        setLookActive(false)
        armedRef.current = false
        resetFlipZones()
      }
    }
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('pagehide', onHidden)
    return () => {
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('pagehide', onHidden)
    }
  }, [resetFlipZones])

  // 洗澡页默认锁住页面级滚动；只有内容确实装不下时才开放内部滚动
  useEffect(() => {
    document.body.classList.add('shower-lock')
    return () => document.body.classList.remove('shower-lock')
  }, [])

  useEffect(() => {
    const page = pageRef.current
    if (!page) return
    const check = () => {
      setAllowScroll(page.scrollHeight > page.clientHeight + 2)
    }
    check()
    const observer = new ResizeObserver(check)
    observer.observe(page)
    const hero = page.querySelector('.shower-hero')
    if (hero) observer.observe(hero)
    window.addEventListener('resize', check)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', check)
    }
  }, [phase, autoMode, flip.permission, lookActive, summary])

  // 冷却结束触发一次重新评估
  useEffect(() => {
    if (!autoMode) return
    const wait = cooldownUntil - Date.now()
    if (wait <= 0) return
    const timer = window.setTimeout(() => setCooldownTick((value) => value + 1), wait + 30)
    return () => window.clearTimeout(timer)
  }, [autoMode, cooldownUntil])

  // 姿态动作：扣下暂停、正面平放继续；冷却中不响应
  useEffect(() => {
    if (!autoMode) return
    if (flip.hasStable && flip.zone !== 'faceDown') armedRef.current = true
    if (phase === 'closing' || phase === 'opening' || stopping) return
    if (Date.now() < cooldownUntil) return

    if (phase === 'running' && flip.zone === 'faceDown' && armedRef.current) {
      actionsRef.current.pause()
    } else if (phase === 'paused' && flip.zone === 'faceUp') {
      actionsRef.current.resume()
    }
  }, [autoMode, flip.zone, flip.hasStable, phase, cooldownUntil, cooldownTick, stopping])

  // 15 秒保护结束后重新评估
  useEffect(() => {
    if (!autoMode || !Number.isFinite(lookGraceUntil)) return
    const wait = lookGraceUntil - Date.now()
    if (wait <= 0) return
    const timer = window.setTimeout(() => setGraceTick((value) => value + 1), wait + 30)
    return () => window.clearTimeout(timer)
  }, [autoMode, lookGraceUntil])

  // 拿起手机（垂直地面 ±15°）持续 3 秒 → 最终结束
  useEffect(() => {
    if (
      !autoMode ||
      flip.zone !== 'upright' ||
      phase === 'closing' ||
      phase === 'opening' ||
      Date.now() < lookGraceUntil
    ) {
      setLookActive(false)
      setLookLeft(LOOK_END_MS / 1000)
      return
    }

    setLookActive(true)
    setLookLeft(LOOK_END_MS / 1000)
    const startedAt = Date.now()
    const tick = window.setInterval(() => {
      setLookLeft(Math.max(0, LOOK_END_MS / 1000 - (Date.now() - startedAt) / 1000))
    }, 80)
    const timer = window.setTimeout(() => {
      window.clearInterval(tick)
      setLookActive(false)
      actionsRef.current.endLook()
    }, LOOK_END_MS)

    return () => {
      window.clearInterval(tick)
      window.clearTimeout(timer)
      setLookActive(false)
    }
  }, [autoMode, flip.zone, phase, lookGraceUntil, graceTick])

  useEffect(() => {
    if (!lookActive) {
      lastLookTickRef.current = 0
      return
    }
    const second = Math.ceil(lookLeft)
    if (second > 0 && second !== lastLookTickRef.current) {
      lastLookTickRef.current = second
      playTickSound()
    }
  }, [lookActive, lookLeft])

  useEffect(
    () => () => {
      stopHoldTimers()
    },
    [],
  )

  if (!activeOrder && phase === 'running' && !summary && !stopping) {
    return <Navigate to="/" replace />
  }

  const device = activeOrder?.device ?? pausedDevice
  const liveOrder = activeOrder?.mode === 'live'
  const amount = liveOrder
    ? activeOrder?.preDeduct ?? device?.withhold ?? 0
    : Math.max(0.1, Math.round(elapsed * (activeOrder?.pricePerSecond ?? 0.01) * 100) / 100)
  const progress = Math.min(100, (elapsed / 600) * 100)
  const sessionAmount = sessionBills.reduce((sum, bill) => sum + bill.amount, 0)
  const phaseLabel =
    phase === 'running'
      ? '正在用水'
      : phase === 'closing'
        ? '关阀中'
        : phase === 'paused'
          ? '暂停用水'
          : '开阀中'

  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    if (stopping || phase === 'closing' || phase === 'opening' || holdRef.current.active) return
    const target = event.target as HTMLElement
    if (target.closest('button, a, input, [role="button"], label')) return

    holdRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      until: Date.now() + HOLD_MS,
      lastHaptic: 5,
      lastSound: 5,
    }
    setHolding(true)
    setHoldLeft(HOLD_MS / 1000)

    holdTimerRef.current = window.setTimeout(() => {
      if (!holdRef.current.active) return
      stopHoldTimers()
      holdRef.current.active = false
      setHolding(false)
      void finish()
    }, HOLD_MS)

    holdTickRef.current = window.setInterval(() => {
      if (!holdRef.current.active) return
      const left = Math.max(0, Math.ceil((holdRef.current.until - Date.now()) / 1000))
      setHoldLeft(left)
      if (left > 0 && left !== holdRef.current.lastSound) {
        holdRef.current.lastSound = left
        playTickSound()
      }
      if (left > 0 && left <= 3 && left !== holdRef.current.lastHaptic) {
        holdRef.current.lastHaptic = left
      }
    }, 100)
  }

  const cancelHold = () => {
    if (!holdRef.current.active) return
    resetHold()
  }

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    if (!holdRef.current.active) return
    const dx = event.clientX - holdRef.current.startX
    const dy = event.clientY - holdRef.current.startY
    if (Math.hypot(dx, dy) > 18) resetHold()
  }

  return (
    <main
      ref={pageRef}
      className={`shower-page ${allowScroll ? 'shower-page--scroll' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerUp={cancelHold}
      onPointerCancel={cancelHold}
      onPointerLeave={cancelHold}
      onPointerMove={handlePointerMove}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="shower-page__orb shower-page__orb--one" />
      <div className="shower-page__orb shower-page__orb--two" />

      <header className="shower-topbar">
        <button className="shower-icon-button" onClick={() => navigate('/')} aria-label="返回首页">
          <ArrowLeft size={21} />
        </button>
        <span className="shower-topbar__status">
          <span className="live-dot" /> {phaseLabel}
        </span>
        <span className="shower-topbar__spacer" />
      </header>

      <div className={`shower-modebar ${autoMode ? 'is-auto' : 'is-manual'}`}>
        <div className="shower-modebar__left">
          <span className="shower-modebar__mode">{autoMode ? '自动模式' : '手动模式'}</span>
          <span className={`shower-modebar__phase phase-${phase}`}>{phaseLabel}</span>
        </div>
        <label className="shower-modebar__toggle">
          <span>自动翻转</span>
          <button
            type="button"
            className={`switch ${autoMode ? 'is-on' : ''}`}
            role="switch"
            aria-checked={autoMode}
            aria-label="自动翻转控制"
            disabled={phase === 'closing' || phase === 'opening'}
            onClick={() => void toggleAutoMode()}
          >
            <span />
          </button>
        </label>
      </div>

      {autoMode && flip.permission === 'permission' && (
        <div className="shower-auth">
          <span>自动模式需要方向传感器权限</span>
          <button type="button" onClick={() => void authorizeAuto()}>
            授权
          </button>
        </div>
      )}
      {autoMode && flip.permission === 'unsupported' && (
        <div className="shower-auth is-error">
          当前环境不支持方向传感器；请用 HTTPS 打开，或关闭自动模式
        </div>
      )}

      <section className="shower-hero">
        <div className="shower-device">
          <DeviceGlyph kind={device?.kind ?? 'water'} size="lg" />
          <div>
            <span className="eyebrow">HOT WATER</span>
            <h1>{device?.name ?? '设备'}</h1>
            <p>
              <MapPin size={14} /> {device?.location ?? ''}
            </p>
          </div>
        </div>

        <div className="shower-timer">
          <span className="shower-timer__label">
            <Clock3 size={15} /> {phase === 'paused' ? '已暂停' : '已用时间'}
          </span>
          <strong>{formatDuration(elapsed)}</strong>
        </div>

        <div className="shower-progress">
          <span style={{ width: `${progress}%` }} />
        </div>

        <div className="shower-amount">
          <div>
            <small>{phase === 'paused' ? '本次已结算' : liveOrder ? '预扣金额' : '预估消费'}</small>
            <strong>{formatMoney(phase === 'paused' ? sessionAmount : amount)}</strong>
          </div>
          <span>
            {phase === 'paused'
              ? `共 ${sessionBills.length} 笔`
              : liveOrder
                ? '结算后多退少补'
                : `预扣 ${formatMoney(device?.withhold ?? 5)}`}
          </span>
        </div>

        <div className="shower-note">
          <ShieldCheck size={16} />
          {autoMode
            ? '自动模式：扣下暂停，正面平放继续；拿起手机 3 秒结束。最终结束仍以按钮为准。'
            : '手动模式：轻触下方按钮，或长按空白处 5 秒结束用水。'}
        </div>

        {phase === 'paused' && (
          <div className="shower-paused">
            <span className="shower-paused__icon">
              <Pause size={20} />
            </span>
            <div>
              <strong>已暂停</strong>
              <p>{autoMode ? '把手机翻正面平放在台面上，继续用水' : '点击下方按钮结束本次用水'}</p>
            </div>
          </div>
        )}

        <button
          className="shower-stop"
          type="button"
          onClick={() => void finish()}
          disabled={stopping || phase === 'closing' || phase === 'opening'}
        >
          <span className="shower-stop__icon">
            <Power size={26} />
          </span>
          <span className="shower-stop__copy">
            <strong>结束用水</strong>
            <small>
              {phase === 'closing'
                ? '正在关阀…'
                : phase === 'opening'
                  ? '正在开阀…'
                  : phase === 'paused'
                    ? '退出本次用水'
                    : autoMode
                      ? '结束并退出洗澡'
                      : '轻触一次立即结束'}
            </small>
          </span>
        </button>

        <p className="shower-tap-hint">
          {autoMode
            ? '扣下暂停 · 正面平放继续 · 拿起 3 秒结束'
            : '或按住空白处 5 秒结束，松手取消'}
        </p>

        <p className="shower-hint">
          <Clock3 size={13} />{' '}
          {wakeLock === 'active'
            ? '已保持屏幕常亮，结束后自动释放'
            : wakeLock === 'unsupported'
              ? '浏览器不支持屏幕常亮，请手动延长息屏时间'
              : wakeLock === 'error'
                ? '屏幕常亮申请失败，请手动延长息屏时间'
                : wakeLock === 'released'
                  ? '屏幕常亮已释放，切回前台会自动重新申请'
                  : '正在申请屏幕常亮…'}
        </p>
      </section>

      {lookActive && (
        <div className="look-stop" role="status" aria-live="polite">
          <span className="look-stop__icon">
            <RotateCcw size={24} />
          </span>
          <div className="look-stop__copy">
            <strong>拿起了手机</strong>
            <p>{lookLeft.toFixed(1)} 秒后结束用水</p>
          </div>
          <span className="look-stop__bar">
            <span style={{ width: `${(lookLeft / (LOOK_END_MS / 1000)) * 100}%` }} />
          </span>
          <small>放平可取消</small>
        </div>
      )}

      {holding && (
        <div className="tap-stop" role="status" aria-live="polite">
          <div className="tap-stop__count">{holdLeft}</div>
          <div className="tap-stop__copy">
            继续按住
            <br />
            <strong>{holdLeft} 秒</strong>后结束
          </div>
          <span className="tap-stop__bar tap-stop__bar--hold" />
          <small>松手取消</small>
        </div>
      )}

      <Sheet open={Boolean(summary)} onClose={() => navigate('/', { replace: true })} title="本次完成">
        {summary && (
          <div className="finish-card">
            <span className="finish-card__icon">
              <CheckCircle2 size={34} />
            </span>
            <h2>本次洗澡汇总</h2>
            <p>{summary.count} 笔账单 · 共 {formatShortDuration(summary.duration)}</p>
            <strong>{formatMoney(summary.amount)}</strong>
            <dl className="finish-summary">
              <div>
                <dt>用水时间</dt>
                <dd>{formatShortDuration(summary.duration)}</dd>
              </div>
              <div>
                <dt>账单笔数</dt>
                <dd>{summary.count} 笔</dd>
              </div>
              <div>
                <dt>合计金额</dt>
                <dd>{formatMoney(summary.amount)}</dd>
              </div>
              <div>
                <dt>剩余余额</dt>
                <dd>{formatMoney(balance)}</dd>
              </div>
            </dl>
            <button className="primary-button primary-button--full" onClick={() => navigate('/records')}>
              查看记录
            </button>
            <button className="ghost-button" onClick={() => navigate('/', { replace: true })}>
              回到首页
            </button>
          </div>
        )}
      </Sheet>
    </main>
  )
}
