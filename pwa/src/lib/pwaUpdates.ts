import { registerSW } from 'virtual:pwa-register'
import { useAppStore } from '../store/useAppStore'

type UpdateSW = (reloadPage?: boolean) => Promise<void>

const RELOAD_GUARD_KEY = 'linyu_sw_reload_at'
const GUARD_MS = 5 * 60 * 1000

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

function recentReload(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0)
    return Number.isFinite(last) && Date.now() - last < GUARD_MS
  } catch {
    return false
  }
}

function markReload() {
  try {
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()))
  } catch {
    // ignore
  }
}

/**
 * 应用更新。
 *
 * 自动模式只允许 5 分钟内刷新一次：上一次 reload 后如果 waiting SW 仍然存在，
 * 绝不能再次自动 reload，否则会陷入“刷新 → 旧 SW 仍在 → 再刷新”的 loop。
 * 调试页手动更新不受这个保护限制。
 */
async function applyUpdate(manual: boolean): Promise<boolean> {
  if (!updateSW || !canApplyNow()) return false
  if (!manual && recentReload()) return false
  if (manual) markReload()
  else markReload()
  pending = false
  await updateSW(true)
  return true
}

/** 有 pending 时每 5 秒检查一次是否到了安全页面；不会重复请求在线版本 */
function scheduleApply() {
  if (applyTimer) return
  applyTimer = window.setInterval(() => {
    if (!pending) {
      window.clearInterval(applyTimer)
      applyTimer = 0
      return
    }
    if (!canApplyNow()) return
    if (recentReload()) {
      // 已经自动刷过一次但 waiting 还在：停止自动尝试，留给调试页手动处理
      window.clearInterval(applyTimer)
      applyTimer = 0
      return
    }
    void applyUpdate(false)
  }, 5000)
}

/**
 * 在线版本检测：PWA 打开时检查一次。
 * 有更新时自动刷新，但用 sessionStorage 防止无限循环；用水/洗澡中延后。
 */
export function setupPwaUpdates() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      pending = true
      // 不立刻 reload，给首屏一点时间，也避免更新检查与首屏资源竞争
      window.setTimeout(() => {
        if (pending && canApplyNow() && !recentReload()) void applyUpdate(false)
        else scheduleApply()
      }, 1500)
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return
      registrationRef = registration
      void checkForUpdateNow().then((found) => {
        if (!found || !pending) return
        // onNeedRefresh 不一定在所有浏览器触发；startup 检查到 waiting 也要走自动更新
        if (canApplyNow() && !recentReload()) void applyUpdate(false)
        else scheduleApply()
      })
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

/** 调试页“检查更新”确认后调用；手动更新 */
export async function applyPendingUpdate(): Promise<boolean> {
  if (!pending && !registrationRef?.waiting) return false
  pending = true
  return applyUpdate(true)
}
