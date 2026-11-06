import { useEffect, useRef, useState } from 'react'

export type WakeLockState =
  | 'idle'
  | 'requesting'
  | 'active'
  | 'released'
  | 'unsupported'
  | 'error'

interface WakeLockSentinelLike {
  release: () => Promise<void>
  addEventListener: (type: 'release', listener: () => void) => void
}

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockSentinelLike>
  }
}

/**
 * 开阀/使用页保持屏幕常亮。
 *
 * 限制：
 * - 需要安全上下文（https 或 localhost），局域网 http 打不开；
 * - 页面切到后台会被系统释放，回到前台要重新申请；
 * - iOS 16.4 以下不支持。
 */
export function useWakeLock(enabled: boolean): WakeLockState {
  const [state, setState] = useState<WakeLockState>('idle')
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null)

  useEffect(() => {
    if (!enabled) {
      void sentinelRef.current?.release()
      sentinelRef.current = null
      return
    }

    let cancelled = false
    const nav = navigator as WakeLockNavigator

    const request = async () => {
      if (!nav.wakeLock) {
        if (!cancelled) setState('unsupported')
        return
      }
      if (!window.isSecureContext) {
        if (!cancelled) setState('unsupported')
        return
      }
      if (sentinelRef.current) {
        if (!cancelled) setState('active')
        return
      }
      if (!cancelled) setState('requesting')
      try {
        const sentinel = await nav.wakeLock.request('screen')
        if (cancelled) {
          void sentinel.release()
          return
        }
        sentinelRef.current = sentinel
        setState('active')
        sentinel.addEventListener('release', () => {
          sentinelRef.current = null
          if (!cancelled) setState('released')
        })
      } catch {
        if (!cancelled) setState('error')
      }
    }

    void request()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void request()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      void sentinelRef.current?.release()
      sentinelRef.current = null
    }
  }, [enabled])

  return enabled ? state : 'idle'
}
