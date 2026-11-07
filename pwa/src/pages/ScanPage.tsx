import jsQR from 'jsqr'
import {
  ArrowLeft,
  Camera,
  Check,
  Flashlight,
  Image as ImageIcon,
  Keyboard,
  RotateCcw,
  ScanLine,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DeviceGlyph } from '../components/DeviceGlyph'
import { Sheet } from '../components/Sheet'
import { demoDevices } from '../data/demo'
import {
  cancelAutoFlipOnStart,
  markMotionPermissionGranted,
  motionPermissionRequired,
  readAutoFlipPreference,
  requestAutoFlipOnStart,
  writeAutoFlipPreference,
} from '../lib/autoFlip'
import { DRYER_ENABLED } from '../lib/features'
import { formatMoney } from '../lib/format'
import { playScanOpenSound } from '../lib/sounds'
import { trackEvent } from '../lib/analytics'
import { findDemoDevice, normalizeMac, parseQr } from '../lib/qr'
import { useAppStore } from '../store/useAppStore'
import { useUiStore } from '../store/useUiStore'
import type { Device } from '../types'

export function ScanPage() {
  const navigate = useNavigate()
  const mode = useAppStore((state) => state.mode)
  const startOrder = useAppStore((state) => state.startOrder)
  const startWater = useAppStore((state) => state.startWater)
  const lookupDevice = useAppStore((state) => state.lookupDevice)
  const showToast = useUiStore((state) => state.showToast)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const detectedRef = useRef(false)
  /** 识别失败后的冷却截止时间（1 秒），冷却结束继续扫 */
  const cooldownUntilRef = useRef(0)
  /** 上一次提示过的原始内容，避免同一张码每帧都弹 toast */
  const lastRawRef = useRef('')

  const [cameraOn, setCameraOn] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [torchOn, setTorchOn] = useState(false)
  const [manual, setManual] = useState('')
  const [pending, setPending] = useState<Device | null>(null)
  const [looking, setLooking] = useState(false)
  const [starting, setStarting] = useState(false)
  const [autoFlip, setAutoFlip] = useState(() => readAutoFlipPreference())
  const [motionState, setMotionState] = useState<'unknown' | 'granted' | 'needed' | 'denied'>('unknown')
  const [motionRequesting, setMotionRequesting] = useState(false)
  const motionRequestRef = useRef(false)
  const immediateAttemptRef = useRef(false)
  const needsMotionPermission = autoFlip && motionPermissionRequired()
  const initialAutoFlipRef = useRef(autoFlip)

  const stopCamera = useCallback(() => {
    window.cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setCameraOn(false)
    setTorchOn(false)
  }, [])

  const handleAddress = useCallback(
    async (address: string) => {
      if (detectedRef.current) return
      detectedRef.current = true
      setLooking(true)
      try {
        const device =
          mode === 'live' ? await lookupDevice(address) : findDemoDevice(address)
        if (!device) {
          detectedRef.current = false
          cooldownUntilRef.current = Date.now() + 1000
          showToast(
            mode === 'live' ? '没有查到设备' : `没有找到 ${address} 对应的设备`,
            'danger',
          )
          return
        }
        setPending(device)
        stopCamera()
      } catch (error) {
        detectedRef.current = false
        cooldownUntilRef.current = Date.now() + 1000
        showToast(error instanceof Error ? error.message : '设备查询失败', 'danger')
      } finally {
        setLooking(false)
      }
    },
    [mode, lookupDevice, showToast, stopCamera],
  )

  const handleRaw = useCallback(
    (raw: string) => {
      if (detectedRef.current) return
      if (Date.now() < cooldownUntilRef.current) return

      const parsed = parseQr(raw)
      if (!parsed) {
        // 非趣智码：1 秒冷却后继续扫；同一张码不重复弹 toast
        cooldownUntilRef.current = Date.now() + 1000
        if (raw !== lastRawRef.current) {
          lastRawRef.current = raw
          showToast('不是可识别的趣智校园设备码', 'danger')
        }
        return
      }

      lastRawRef.current = ''
      void handleAddress(parsed.address)
    },
    [handleAddress, showToast],
  )

  useEffect(() => {
    if (!cameraOn) return
    let cancelled = false

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        detectedRef.current = false
        cooldownUntilRef.current = 0
        lastRawRef.current = ''
        setCameraError('')
        scanFrame()
      } catch {
        setCameraError('无法打开相机，请检查 HTTPS / 相机权限')
        setCameraOn(false)
      }
    }

    const scanFrame = () => {
      // stopCamera / 成功查到设备后不再继续
      if (cancelled || !streamRef.current) return
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || video.readyState < 2) {
        rafRef.current = window.requestAnimationFrame(scanFrame)
        return
      }
      const width = video.videoWidth
      const height = video.videoHeight
      if (!width || !height) {
        rafRef.current = window.requestAnimationFrame(scanFrame)
        return
      }
      if (canvas.width !== width) canvas.width = width
      if (canvas.height !== height) canvas.height = height
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) return
      context.drawImage(video, 0, 0, width, height)
      const image = context.getImageData(0, 0, width, height)
      const result = jsQR(image.data, width, height, { inversionAttempts: 'dontInvert' })
      if (result?.data) {
        handleRaw(result.data)
      }
      // 无论这次识别成功与否都继续下一帧：
      // 成功会 stopCamera 取消；失败/非趣智码由 1 秒冷却控制重试节奏
      rafRef.current = window.requestAnimationFrame(scanFrame)
    }

    void start()

    return () => {
      cancelled = true
      window.cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [cameraOn, handleRaw])

  useEffect(() => {
    document.body.classList.add('scan-lock')
    return () => document.body.classList.remove('scan-lock')
  }, [])

  useEffect(() => () => stopCamera(), [stopCamera])

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    try {
      const next = !torchOn
      await track.applyConstraints({
        advanced: [{ torch: next }],
      } as unknown as MediaTrackConstraints)
      setTorchOn(next)
    } catch {
      showToast('当前设备不支持手电筒', 'danger')
    }
  }

  const scanImage = async (file: File) => {
    const bitmap = await createImageBitmap(file)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return
    context.drawImage(bitmap, 0, 0)
    const image = context.getImageData(0, 0, canvas.width, canvas.height)
    const result = jsQR(image.data, canvas.width, canvas.height)
    if (result?.data) handleRaw(result.data)
    else showToast('图片里没有识别到二维码', 'danger')
  }

  const submitManual = () => {
    if (mode === 'live') {
      // 真实模式允许直接粘贴完整二维码，由 store 解析 MAC/变体
      if (!manual.trim()) {
        showToast('请输入设备码或二维码', 'danger')
        return
      }
      void handleAddress(manual.trim())
      return
    }
    const mac = normalizeMac(manual)
    if (!mac) {
      showToast('请输入 12 位十六进制设备码', 'danger')
      return
    }
    const device = findDemoDevice(mac)
    if (!device) {
      showToast('没有找到这台设备', 'danger')
      return
    }
    setPending(device)
  }

  const requestScanMotion = useCallback(async (fromGesture = false) => {
    if (!autoFlip || !motionPermissionRequired() || motionRequestRef.current) return
    motionRequestRef.current = true
    setMotionRequesting(true)
    try {
      const ctor = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
        requestPermission?: () => Promise<'granted' | 'denied' | 'default'>
      }
      if (typeof ctor.requestPermission !== 'function') {
        markMotionPermissionGranted()
        setMotionState('granted')
        return
      }
      const result = await ctor.requestPermission()
      if (result === 'granted') {
        markMotionPermissionGranted()
        setMotionState('granted')
      } else if (result === 'denied' && fromGesture) {
        setMotionState('denied')
      } else {
        // 自动尝试（无手势）失败时不要标成“已拒绝”，留给用户点一次
        setMotionState('needed')
      }
    } catch {
      // 页面刚打开时无用户手势，iOS 可能直接拒绝；此时才显示触摸条让用户点
      setMotionState(fromGesture ? 'denied' : 'needed')
    } finally {
      motionRequestRef.current = false
      setMotionRequesting(false)
    }
  }, [autoFlip])

  // 页面打开时先直接尝试一次。导航本身来自一次点击，部分浏览器会保留用户激活，
  // 能直接成功就不需要二次确认；失败才显示触摸条。
  useEffect(() => {
    if (!initialAutoFlipRef.current || !motionPermissionRequired()) return
    if (immediateAttemptRef.current) return
    immediateAttemptRef.current = true
    void requestScanMotion(false)
  }, [requestScanMotion])

  // 自动请求失败后，第一次触摸页面时再试一次。
  useEffect(() => {
    if (!autoFlip || !motionPermissionRequired() || motionState === 'granted') return
    if (motionState === 'unknown') return
    const onFirstPointer = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      // 开关自己会走 toggleAutoFlip 的授权流程，避免同一手势请求两次
      if (target?.closest('.scan-auto, .scan-permission')) return
      void requestScanMotion(true)
    }
    document.addEventListener('pointerdown', onFirstPointer, { capture: true })
    return () => document.removeEventListener('pointerdown', onFirstPointer, { capture: true })
  }, [autoFlip, motionState, requestScanMotion])

  const toggleAutoFlip = async () => {
    if (autoFlip) {
      setAutoFlip(false)
      writeAutoFlipPreference(false)
      return
    }
    if (typeof DeviceOrientationEvent === 'undefined' || !window.isSecureContext) {
      showToast('当前环境不支持方向传感器，需要 HTTPS', 'danger')
      return
    }
    const ctor = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<'granted' | 'denied' | 'default'>
    }
    if (motionPermissionRequired() && typeof ctor.requestPermission === 'function') {
      try {
        const result = await ctor.requestPermission()
        if (result !== 'granted') {
          setMotionState('denied')
          showToast('未获得方向传感器权限，自动模式未开启', 'danger')
          return
        }
        markMotionPermissionGranted()
        setMotionState('granted')
      } catch {
        setMotionState('denied')
        showToast('方向传感器授权失败，自动模式未开启', 'danger')
        return
      }
    }
    setAutoFlip(true)
    writeAutoFlipPreference(true)
  }

  const confirmStart = async () => {
    if (!pending) return
    setStarting(true)
    if (autoFlip) requestAutoFlipOnStart()
    else cancelAutoFlipOnStart()
    try {
      if (mode === 'live') await startWater(pending)
      else startOrder(pending)
      playScanOpenSound()
      trackEvent('water_start')
      showToast(pending.kind === 'dryer' ? '已开始固定时长吹风' : '已开始用水', 'success')
      navigate('/shower')
    } catch (error) {
      cancelAutoFlipOnStart()
      showToast(error instanceof Error ? error.message : '开阀失败', 'danger')
    } finally {
      setStarting(false)
    }
  }

  return (
    <main className="scan-page">
      <header className="scan-topbar">
        <button className="scan-icon-button" onClick={() => navigate(-1)} aria-label="返回">
          <ArrowLeft size={21} />
        </button>
        <span>扫码用水</span>
        <button
          className={`scan-icon-button ${torchOn ? 'is-active' : ''}`}
          onClick={toggleTorch}
          aria-label="手电筒"
          disabled={!cameraOn}
        >
          <Flashlight size={20} />
        </button>
      </header>

      <section className="scan-stage">
        <video ref={videoRef} className="scan-video" playsInline muted />
        <canvas ref={canvasRef} className="scan-canvas" />
        {!cameraOn && (
          <div className="scan-placeholder">
            <span className="scan-placeholder__icon">
              <ScanLine size={38} />
            </span>
            <h2>对准设备上的二维码</h2>
            <p>{DRYER_ENABLED ? '仅限 4G 水表和吹风机，识别后直接进入设备详情。' : '仅支持 4G 水表，识别后直接进入设备详情。'}</p>
            <button className="scan-start-button" onClick={() => setCameraOn(true)}>
              <Camera size={18} /> 打开相机
            </button>
            {cameraError && <small>{cameraError}</small>}
          </div>
        )}
        {cameraOn && (
          <>
            <div className="scan-frame">
              <span />
              <span />
              <span />
              <span />
              <div className="scan-line" />
            </div>
            <p className="scan-hint">将二维码放入框内，保持 1 秒</p>
          </>
        )}
      </section>

      <section className="scan-panel">
        <div className="scan-panel__actions">
          <button onClick={() => fileRef.current?.click()}>
            <ImageIcon size={19} />
            相册
          </button>
          <label className="scan-manual">
            <Keyboard size={19} />
            <input
              value={manual}
              onChange={(event) => setManual(event.target.value)}
              placeholder="手动输入设备 MAC"
              aria-label="手动输入设备 MAC"
            />
            <button onClick={submitManual}>识别</button>
          </label>
        </div>
        {needsMotionPermission && (motionState === 'needed' || motionState === 'denied') && (
          <div className="scan-permission">
            <span>
              自动翻转需要方向传感器权限
              {motionState === 'denied' ? '，当前已拒绝' : ''}
            </span>
            <button
              type="button"
              onClick={() => void requestScanMotion(true)}
              disabled={motionRequesting}
            >
              {motionRequesting ? '请求中…' : motionState === 'denied' ? '重试授权' : '立即授权'}
            </button>
          </div>
        )}

        <div className={`scan-auto ${autoFlip ? 'is-on' : ''}`}>
          <span className="scan-auto__icon">
            <RotateCcw size={17} />
          </span>
          <span className="scan-auto__copy">
            <strong>自动翻转控制</strong>
            <small>开阀后翻扣暂停，翻正面平放继续；最终结束仍需手动</small>
          </span>
          <button
            className={`switch ${autoFlip ? 'is-on' : ''}`}
            role="switch"
            aria-checked={autoFlip}
            aria-label="自动翻转控制"
            onClick={() => void toggleAutoFlip()}
          >
            <span />
          </button>
        </div>
        {mode === 'live' ? (
          <div className="scan-demo">
            <span>{looking ? '正在查询设备…' : '真实模式：扫设备二维码，或手动输入设备码'}</span>
          </div>
        ) : (
          <div className="scan-demo">
            <span>没有实体码？试试示例设备</span>
            <div>
              {demoDevices.map((device) => (
                <button key={device.id} onClick={() => setPending(device)}>
                  {device.kind === 'water' ? '水表' : '吹风机'}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void scanImage(file)
          event.currentTarget.value = ''
        }}
      />

      <Sheet open={Boolean(pending)} onClose={() => setPending(null)} title="设备详情">
        {pending && (
          <div className="scan-result">
            <div className="scan-result__hero">
              <DeviceGlyph kind={pending.kind} size="lg" />
              <div>
                <h2>{pending.name}</h2>
                <p>{pending.location}</p>
              </div>
            </div>
            <dl className="detail-list">
              <div>
                <dt>设备类型</dt>
                <dd>{pending.kind === 'water' ? '4G 热水表' : '4G 吹风机'}</dd>
              </div>
              <div>
                <dt>设备码</dt>
                <dd className="mono">{pending.mac}</dd>
              </div>
              <div>
                <dt>{pending.kind === 'water' ? '预扣金额' : '固定费用'}</dt>
                <dd>
                  {pending.kind === 'water'
                    ? formatMoney(pending.withhold)
                    : formatMoney(pending.fixedPrice ?? 3)}
                </dd>
              </div>
              {pending.kind === 'dryer' && (
                <div>
                  <dt>固定时长</dt>
                  <dd>{Math.round((pending.fixedDuration ?? 300) / 60)} 分钟</dd>
                </div>
              )}
            </dl>
            {pending.kind === 'dryer' && (
              <p className="notice">
                吹风机按固定时长计费；提前结束是否退费以服务端为准，当前示例按全额计。
              </p>
            )}
            {pending.online === false && (
              <p className="notice">设备当前离线，开阀可能失败。</p>
            )}
            <div className="sheet-actions">
              <button
                className="ghost-button"
                onClick={() => setPending(null)}
                disabled={starting}
              >
                <X size={17} /> 取消
              </button>
              <button
                className="primary-button"
                onClick={confirmStart}
                disabled={starting}
              >
                <Check size={17} /> {starting ? '开阀中…' : `开始${pending.kind === 'water' ? '用水' : '吹风'}`}
              </button>
            </div>
          </div>
        )}
      </Sheet>
    </main>
  )
}
