import { registerSW } from 'virtual:pwa-register'
import { useAppStore } from '../store/useAppStore'

type UpdateSW = (reloadPage?: boolean) => Promise<void>

let updateSW: UpdateSW | null = null
let registrationRef: ServiceWorkerRegistration | null = null
let pending = false
let checking = false
let applyTimer = 0

function canApplyNow(): boolean {
  const state = useAppStore.getState()
  if (state.activeOrder) return false
  // 洗澡页即使暂停也可能马上要继续开阀，不能在这里刷新
  if (window.location.hash.startsWith('#/shower')) return false
  return true
}

function applyIfSafe() {
  if (!pending || !updateSW || !canApplyNow()) return
  pending = false
  if (applyTimer) {
    window.clearInterval(applyTimer)
    applyTimer = 0
  }
  void updateSW(true)
}

/** 只有存在待应用更新时才轮询“是否安全刷新”，不重复请求在线版本 */
function scheduleApply() {
  if (applyTimer) return
  applyTimer = window.setInterval(() => {
    if (!pending) {
      window.clearInterval(applyTimer)
      applyTimer = 0
      return
    }
    applyIfSafe()
  }, 5000)
}

/**
 * 在线版本检测：只在 PWA 打开时检查一次。
 * 发现新版本后立刻 skipWaiting + reload；用水/洗澡中延后到安全时。
 */
export function setupPwaUpdates() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      pending = true
      scheduleApply()
      applyIfSafe()
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return
      registrationRef = registration
      void checkForUpdateNow()
    },
  })
}

/** 调试页手动检查；返回是否发现新版本 */
export async function checkForUpdateNow(): Promise<boolean> {
  const registration = registrationRef
  if (!registration) return false
  if (checking) return false
  checking = true
  try {
    await registration.update()
    if (registration.waiting) {
      pending = true
      scheduleApply()
      applyIfSafe()
      return true
    }
    return false
  } catch {
    return false
  } finally {
    checking = false
  }
}
