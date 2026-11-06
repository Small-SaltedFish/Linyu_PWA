import { registerSW } from 'virtual:pwa-register'
import { useAppStore } from '../store/useAppStore'

type UpdateSW = (reloadPage?: boolean) => Promise<void>

let updateSW: UpdateSW | null = null
let registrationRef: ServiceWorkerRegistration | null = null
let pending = false
let checking = false

function canApplyNow(): boolean {
  const state = useAppStore.getState()
  if (state.activeOrder) return false
  // 洗澡页即使暂停也可能马上要继续开阀，不能在这里刷新
  if (window.location.hash.startsWith('#/shower')) return false
  return true
}

/**
 * 只做版本检测，不自动刷新。
 *
 * 之前 autoUpdate + 自定义 updateSW(true) 会在某些浏览器里反复 reload，
 * 最终出现 load failed。现在改为 prompt 模式：检测到新版本只记录 pending，
 * 由调试页手动应用，避免自动刷新循环。
 */
export function setupPwaUpdates() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      pending = true
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return
      registrationRef = registration
      // 每次打开 PWA 只检查一次
      void checkForUpdateNow()
    },
  })
}

/** 手动检查；只返回是否有新版本，不自动刷新 */
export async function checkForUpdateNow(): Promise<boolean> {
  const registration = registrationRef
  if (!registration) return false
  if (checking) return false
  checking = true
  try {
    await registration.update()
    if (registration.waiting) {
      pending = true
      return true
    }
    return false
  } catch {
    return false
  } finally {
    checking = false
  }
}

/** 用户在调试页确认后应用更新；只允许在安全页面执行 */
export async function applyPendingUpdate(): Promise<boolean> {
  if (!pending || !updateSW || !canApplyNow()) return false
  pending = false
  await updateSW(true)
  return true
}
