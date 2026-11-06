import { useCallback, useEffect, useRef, useState } from 'react'
import { isIosLike } from './autoFlip'

export type FlipZone = 'faceDown' | 'faceUp' | 'upright' | 'other'
export type FlipPermission = 'off' | 'unsupported' | 'permission' | 'denied' | 'ready'

type OrientationPermissionCtor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>
}

const FACE_DOWN_ENTER = 160
const FACE_DOWN_EXIT = 140
const FACE_UP_ENTER = 25
const FACE_UP_EXIT = 40
const UPRIGHT_MIN = 75
const UPRIGHT_MAX = 105
const UPRIGHT_EXIT_MIN = 70
const UPRIGHT_EXIT_MAX = 110
/** 姿态稳定时间，过滤抖动；比 1 秒快，响应优先 */
const STABLE_MS = 250

function rawZone(beta: number, current: FlipZone): FlipZone {
  const abs = Math.abs(beta)

  if (current === 'faceDown') {
    if (abs > FACE_DOWN_EXIT) return 'faceDown'
    if (abs <= FACE_UP_ENTER) return 'faceUp'
    if (abs >= UPRIGHT_MIN && abs <= UPRIGHT_MAX) return 'upright'
    return 'other'
  }
  if (current === 'faceUp') {
    if (abs < FACE_UP_EXIT) return 'faceUp'
    if (abs >= FACE_DOWN_ENTER) return 'faceDown'
    if (abs >= UPRIGHT_MIN && abs <= UPRIGHT_MAX) return 'upright'
    return 'other'
  }
  if (current === 'upright') {
    if (abs >= FACE_DOWN_ENTER) return 'faceDown'
    if (abs <= FACE_UP_ENTER) return 'faceUp'
    if (abs >= UPRIGHT_EXIT_MIN && abs <= UPRIGHT_EXIT_MAX) return 'upright'
    return 'other'
  }

  if (abs >= FACE_DOWN_ENTER) return 'faceDown'
  if (abs <= FACE_UP_ENTER) return 'faceUp'
  if (abs >= UPRIGHT_MIN && abs <= UPRIGHT_MAX) return 'upright'
  return 'other'
}

interface Options {
  enabled: boolean
  /** 扫码页已经授权过，避免使用页再弹一次 */
  assumeGranted?: boolean
}

export interface FlipZonesResult {
  zone: FlipZone
  /** 至少拿到过一次稳定姿态，用于避免刚开启时用初始 other 误武装 */
  hasStable: boolean
  permission: FlipPermission
  requestPermission: () => Promise<boolean>
  reset: () => void
}

/**
 * 只负责姿态检测，不做任何 API 调用。
 *
 * - 扣下：|beta| >= 160，退出 140
 * - 正面平放：|beta| <= 25，退出 40（摄像头凸起留余量）
 * - 拿起看屏幕：75~105（垂直地面 ±15°）
 * - 每种姿态稳定 250ms 才切换，消除抖动
 */
export function useFlipZones({ enabled, assumeGranted = false }: Options): FlipZonesResult {
  const supported =
    typeof window !== 'undefined' &&
    typeof DeviceOrientationEvent !== 'undefined' &&
    window.isSecureContext
  const ctor = (
    typeof DeviceOrientationEvent !== 'undefined' ? DeviceOrientationEvent : null
  ) as OrientationPermissionCtor | null
  const requiresPermission =
    isIosLike() && typeof ctor?.requestPermission === 'function'

  const [zone, setZone] = useState<FlipZone>('other')
  const [hasStable, setHasStable] = useState(false)
  const [permission, setPermission] = useState<FlipPermission>(() => {
    if (!supported) return 'unsupported'
    if (requiresPermission && !assumeGranted) return 'permission'
    return 'ready'
  })

  const zoneRef = useRef<FlipZone>('other')
  const candidateRef = useRef<FlipZone>('other')
  const stableTimerRef = useRef(0)
  const listeningRef = useRef(false)
  const grantedRef = useRef(assumeGranted)

  const clearStable = () => {
    if (stableTimerRef.current) {
      window.clearTimeout(stableTimerRef.current)
      stableTimerRef.current = 0
    }
  }

  const handleOrientation = useCallback((event: DeviceOrientationEvent) => {
    const beta = event.beta
    if (beta === null || beta === undefined || !Number.isFinite(beta)) return

    const next = rawZone(beta, zoneRef.current)
    if (next === zoneRef.current) {
      candidateRef.current = next
      clearStable()
      return
    }
    if (next !== candidateRef.current) {
      candidateRef.current = next
      clearStable()
    }
    if (stableTimerRef.current) return

    stableTimerRef.current = window.setTimeout(() => {
      stableTimerRef.current = 0
      const stable = candidateRef.current
      if (stable === zoneRef.current) return
      zoneRef.current = stable
      setZone(stable)
      setHasStable(true)
    }, STABLE_MS)
  }, [])
  const stopListening = useCallback(() => {
    if (listeningRef.current) {
      listeningRef.current = false
      window.removeEventListener('deviceorientation', handleOrientation, true)
    }
    clearStable()
    zoneRef.current = 'other'
    candidateRef.current = 'other'
  }, [handleOrientation])

  const reset = useCallback(() => {
    stopListening()
    zoneRef.current = 'other'
    candidateRef.current = 'other'
    setZone('other')
    setHasStable(false)
  }, [stopListening])

  const startListening = useCallback(() => {
    if (listeningRef.current) return
    listeningRef.current = true
    window.addEventListener('deviceorientation', handleOrientation, true)
  }, [handleOrientation])

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (grantedRef.current) {
      startListening()
      setPermission('ready')
      return true
    }
    if (!supported) {
      setPermission('unsupported')
      return false
    }
    if (!requiresPermission || !ctor?.requestPermission) {
      grantedRef.current = true
      setPermission('ready')
      startListening()
      return true
    }
    try {
      const result = await ctor.requestPermission()
      if (result === 'granted') {
        grantedRef.current = true
        setPermission('ready')
        startListening()
        return true
      }
      setPermission('denied')
      return false
    } catch {
      setPermission('denied')
      return false
    }
  }, [supported, requiresPermission, ctor, startListening])

  useEffect(() => {
    if (!enabled || !supported) {
      stopListening()
      return
    }
    if (requiresPermission && !grantedRef.current) return
    startListening()
    return () => stopListening()
  }, [enabled, supported, requiresPermission, startListening, stopListening])

  return { zone, hasStable, permission, requestPermission, reset }
}
