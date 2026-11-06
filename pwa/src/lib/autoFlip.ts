const COOKIE_NAME = 'linyu_auto_flip'
let pendingStart = false

export function readAutoFlipPreference(): boolean {
  try {
    return document.cookie
      .split(';')
      .map((part) => part.trim())
      .some((part) => part === `${COOKIE_NAME}=1`)
  } catch {
    return false
  }
}

export function writeAutoFlipPreference(enabled: boolean) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${COOKIE_NAME}=${enabled ? '1' : '0'}; Max-Age=${
    enabled ? 31536000 : 0
  }; Path=/; SameSite=Lax${secure}`
}

/** 扫码页确认开阀时调用，把“本次自动模式”带到使用页 */
export function requestAutoFlipOnStart() {
  // 只存在内存里：SPA 内从扫码页跳到使用页有效；
  // 刷新/重新打开 PWA 后失效，保证「恢复已有订单」默认手动模式。
  pendingStart = true
}

/** 只读，不清除；供 StrictMode 下 useState 初始化使用 */
export function peekAutoFlipOnStart(): boolean {
  return pendingStart
}

/** 使用页首次挂载后消费；重新进入已有订单不会走到这里 */
export function consumeAutoFlipOnStart(): boolean {
  const result = pendingStart
  pendingStart = false
  return result
}

export function cancelAutoFlipOnStart() {
  pendingStart = false
}

const MOTION_GRANTED_KEY = 'linyu_motion_granted'

export function markMotionPermissionGranted() {
  try {
    sessionStorage.setItem(MOTION_GRANTED_KEY, '1')
  } catch {
    // ignore
  }
}

export function hasMotionPermissionGranted(): boolean {
  try {
    return sessionStorage.getItem(MOTION_GRANTED_KEY) === '1'
  } catch {
    return false
  }
}

export function isIosLike(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

export function motionPermissionRequired(): boolean {
  if (!isIosLike() || typeof DeviceOrientationEvent === 'undefined') return false
  return (
    typeof (DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: unknown
    }).requestPermission === 'function'
  )
}
