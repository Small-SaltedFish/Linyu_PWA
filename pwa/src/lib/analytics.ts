import { useAppStore } from '../store/useAppStore'

const INSTALL_KEY = 'linyu_install_id'
const RUNTIME_BASE =
  typeof window !== 'undefined' ? window.__LINYU_STATS_URL__ ?? '' : ''
const BASE = (RUNTIME_BASE || import.meta.env.VITE_STATS_URL || '')
  .trim()
  .replace(/\/+$/, '')
const VERSION = '0.1.0'
const MAX_QUEUE = 100

interface EventPayload {
  installId: string
  event: string
  projectId?: string
  projectName?: string
  appVersion: string
  durationSec?: number
}

let queue: EventPayload[] = []
let timer = 0
let installIdCache = ''

function installId(): string {
  if (installIdCache) return installIdCache
  try {
    const existing = localStorage.getItem(INSTALL_KEY)
    if (existing) {
      installIdCache = existing
      return existing
    }
    const created =
      typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `inst-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
    localStorage.setItem(INSTALL_KEY, created)
    installIdCache = created
    return created
  } catch {
    installIdCache = `inst-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
    return installIdCache
  }
}

function enabled(): boolean {
  return Boolean(BASE)
}

function flush(keepalive = false) {
  if (!BASE || queue.length === 0) return
  const batch = queue.slice(0, 50)
  queue = queue.slice(batch.length)
  try {
    void fetch(`${BASE}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: batch }),
      keepalive,
      credentials: 'omit',
    }).catch(() => {
      // 不无限重试，避免离线时堆积；最多保留一小段
      queue = [...batch, ...queue].slice(0, MAX_QUEUE)
    })
  } catch {
    queue = [...batch, ...queue].slice(0, MAX_QUEUE)
  }
}

function schedule() {
  if (timer) return
  timer = window.setTimeout(() => {
    timer = 0
    flush()
  }, 12000)
  if (queue.length >= 8) {
    window.clearTimeout(timer)
    timer = 0
    flush()
  }
}

/**
 * 只上报匿名使用事件：
 * - 随机 installId
 * - 事件名 / 项目 id + 名称 / 时长
 * 绝不包含手机号、accountId、loginCode、密码、设备 MAC、订单号。
 */
export function trackEvent(
  event: string,
  data: { projectId?: string; projectName?: string; durationSec?: number } = {},
) {
  if (!enabled()) return
  const state = useAppStore.getState()
  queue.push({
    installId: installId(),
    event,
    projectId: data.projectId ?? state.currentProjectId ?? undefined,
    projectName: data.projectName ?? state.currentProjectName ?? undefined,
    appVersion: VERSION,
    durationSec: data.durationSec,
  })
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE)
  schedule()
}

export function trackInstall() {
  trackEvent('install')
}

export function flushAnalytics() {
  if (timer) {
    window.clearTimeout(timer)
    timer = 0
  }
  flush(true)
}

if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAnalytics()
  })
  window.addEventListener('pagehide', () => flushAnalytics())
}
