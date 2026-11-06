import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  Droplets,
  KeyRound,
  LockKeyhole,
  Play,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Square,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DEFAULT_BASE_URL,
  asRecord,
  asString,
  classifyUsing,
  closeWater,
  extractBills,
  extractConsumeLi,
  extractDeviceSummary,
  extractModes,
  extractLoginAuth,
  extractProjects,
  extractSwitchAuth,
  extractWalletMoney,
  getAccountInfo,
  getBills,
  getDeviceInfo,
  getProjectInfo,
  getModeList,
  getProjectList,
  getWallet,
  isCloseAccepted,
  liToYuan,
  loginWithPassword,
  loginWithSmsCode,
  maskPhone,
  maskToken,
  queryConsumeResult,
  queryDownRateResult,
  queryUsing,
  sendSmsCode,
  startWater,
  switchProject,
  type SpikeAuth,
  type SpikeBill,
  type SpikeMode,
  type SpikeCall,
  type SpikeProject,
  type UsingResult,
} from '../api/spike'
import { PageHeader } from '../components/PageHeader'
import { DRYER_ENABLED } from '../lib/features'
import { macVariants, normalizeMac, parseQr } from '../lib/qr'
import { useUiStore } from '../store/useUiStore'

const AUTH_KEY = 'linyu-spike-auth'
const MAC_KEY = 'linyu-spike-mac'
const BASE_KEY = 'linyu-spike-base'
const REMIND_KEY = 'linyu-spike-remind'
const AUTO_CLOSE_KEY = 'linyu-spike-autoclose'

/**
 * 开发阶段保留自动关阀，避免调试时忘关水；
 * 正式构建（production）自动改为「只提醒、不自动关阀」。
 *
 * 这是刻意的策略：自动关阀只应存在于调试工具里，不能带进正式应用。
 */
const AUTO_CLOSE_ENABLED = import.meta.env.DEV
const TIMER_KEY = AUTO_CLOSE_ENABLED ? AUTO_CLOSE_KEY : REMIND_KEY

/** StrictMode 下 effect 会跑两次，避免恢复会话时重复拉一轮接口。 */
let bootKey: string | null = null

function readAuth(): SpikeAuth | null {
  try {
    const raw = sessionStorage.getItem(AUTH_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SpikeAuth
    return parsed.loginCode ? parsed : null
  } catch {
    return null
  }
}

function readNumber(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    const value = Number(raw)
    return Number.isFinite(value) ? value : fallback
  } catch {
    return fallback
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

type Notice = { text: string; tone: 'info' | 'success' | 'danger' }

type RefundRow = {
  label: string
  at: number
  money: string | null
  extra?: string
}

export function SpikePage() {
  const showToast = useUiStore((state) => state.showToast)
  const [baseUrl, setBaseUrl] = useState(
    () => localStorage.getItem(BASE_KEY) || DEFAULT_BASE_URL,
  )
  const [mode, setMode] = useState<'password' | 'sms'>('password')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [smsCode, setSmsCode] = useState('')
  const [countdown, setCountdown] = useState(0)

  const [auth, setAuth] = useState<SpikeAuth | null>(readAuth)
  const [projects, setProjects] = useState<SpikeProject[]>([])
  const [projectsLoaded, setProjectsLoaded] = useState(false)
  const [projectPicker, setProjectPicker] = useState(false)
  const [currentProjectName, setCurrentProjectName] = useState('')
  const [accountName, setAccountName] = useState<string | null>(null)
  const [walletMoney, setWalletMoney] = useState<string | null>(null)
  const [bills, setBills] = useState<SpikeBill[]>([])
  const [billCount, setBillCount] = useState<number | null>(null)

  const [macInput, setMacInput] = useState(() => sessionStorage.getItem(MAC_KEY) ?? '')
  const [device, setDevice] = useState<Record<string, string> | null>(null)
  const [modes, setModes] = useState<SpikeMode[]>([])
  const [modesLoaded, setModesLoaded] = useState(false)
  const [using, setUsing] = useState<UsingResult | null>(null)
  const [orderNo, setOrderNo] = useState('')
  const [lastOrderNo, setLastOrderNo] = useState('')
  const [closeDiag, setCloseDiag] = useState<string | null>(null)
  const [confirmStart, setConfirmStart] = useState(false)
  const [timerSeconds, setTimerSeconds] = useState(() =>
    Math.min(3600, Math.max(0, readNumber(TIMER_KEY, 180))),
  )
  const [remaining, setRemaining] = useState<number | null>(null)
  const [timerFired, setTimerFired] = useState(false)
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>(
    () => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission),
  )
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  const [calls, setCalls] = useState<SpikeCall[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [showAllCalls, setShowAllCalls] = useState(false)
  const [refundRows, setRefundRows] = useState<RefundRow[]>([])

  const busyRef = useRef(false)
  const stopRef = useRef<(auto: boolean) => void>(() => {})
  const orderNoRef = useRef(orderNo)
  orderNoRef.current = orderNo

  const push = (call: SpikeCall) => {
    setCalls((previous) => [...previous, call])
    return call
  }

  const begin = (key: string): boolean => {
    if (busyRef.current) return false
    busyRef.current = true
    setBusy(key)
    return true
  }

  const end = () => {
    busyRef.current = false
    setBusy(null)
  }

  const persistAuth = (next: SpikeAuth | null) => {
    setAuth(next)
    try {
      if (next) sessionStorage.setItem(AUTH_KEY, JSON.stringify(next))
      else sessionStorage.removeItem(AUTH_KEY)
    } catch {
      // 隐私模式可能禁用 sessionStorage，内存态仍然可用
    }
  }

  const rememberOrder = (value: string) => {
    setOrderNo(value)
    if (value) setLastOrderNo(value)
  }

  const resetOrderState = () => {
    setOrderNo('')
    setUsing(null)
    setConfirmStart(false)
    setRemaining(null)
    setTimerFired(false)
  }

  /**
   * 浏览器通知。优先走 Service Worker（Android Chrome 不允许直接 new Notification），
   * 没有再退回 new Notification（桌面 Chrome）。
   *
   * 限制：只在页面还开着时由定时器触发；关页/锁屏后没有后台任务，
   * 需要 HTTPS/localhost（安全上下文）并且用户允许通知。
   */
  const sendNotification = useCallback(async (body: string): Promise<boolean> => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false
    const options: NotificationOptions = {
      body,
      tag: 'linyu-shower-reminder',
      icon: '/icons/icon-192.png',
    }
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration()
        if (registration) {
          await registration.showNotification('淋浴 No-Ads', options)
          return true
        }
      }
      new Notification('淋浴 No-Ads', options)
      return true
    } catch {
      return false
    }
  }, [])

  const requestNotifications = async () => {
    if (typeof Notification === 'undefined') {
      setNotice({ text: '当前浏览器不支持通知 API，只能用页面内提醒', tone: 'danger' })
      return
    }
    if (!window.isSecureContext) {
      setNotice({
        text: '当前不是安全上下文（需要 https 或 localhost），Chrome 不会允许通知',
        tone: 'danger',
      })
      return
    }
    if (Notification.permission === 'granted') {
      const sent = await sendNotification('这是一条测试通知：到点会这样提醒你')
      setNotifPermission('granted')
      setNotice({
        text: sent ? '测试通知已发送' : '测试通知发送失败：浏览器可能要求安装 PWA 后才能通知',
        tone: sent ? 'success' : 'danger',
      })
      return
    }
    try {
      const permission = await Notification.requestPermission()
      setNotifPermission(permission)
      if (permission === 'granted') {
        const sent = await sendNotification('通知已开启：水开超过设定时间会提醒你')
        setNotice({
          text: sent ? '通知已开启' : '通知权限已允许，但发送失败（可能需要安装 PWA）',
          tone: sent ? 'success' : 'danger',
        })
      } else {
        setNotice({ text: '通知未授权，提醒只会显示在页面里', tone: 'danger' })
      }
    } catch (error) {
      setNotice({
        text: `请求通知权限失败：${error instanceof Error ? error.message : String(error)}`,
        tone: 'danger',
      })
    }
  }

  const loadProjects = async (current: SpikeAuth) => {
    const call = await getProjectList(baseUrl, current)
    push(call)
    if (call.ok) {
      const list = extractProjects(call)
      setProjects(list)
      const match = list.find((project) => project.projectId === current.projectId)
      if (match) setCurrentProjectName(match.projectName)
      if (!list.length) setNotice({ text: '项目列表为空：可能账号只绑定了一个项目', tone: 'info' })
    } else {
      setNotice({ text: call.error ?? '项目列表加载失败', tone: 'danger' })
    }
    setProjectsLoaded(true)
  }

  const loadAccountSummary = async (current: SpikeAuth) => {
    const projectCall = await getProjectInfo(baseUrl, current)
    push(projectCall)
    const projectData = asRecord(projectCall.envelope?.data)
    const projectName = asString(projectData?.projectName)
    // 项目列表里的名字比 /project/info/triple 的学校名更贴近「当前项目」，
    // 已有名字时不要被覆盖。
    if (projectCall.ok && projectName) {
      setCurrentProjectName((previous) => previous || projectName)
    }

    const accountCall = await getAccountInfo(baseUrl, current)
    push(accountCall)
    if (accountCall.ok) {
      const data = asRecord(accountCall.envelope?.data)
      setAccountName(asString(data?.name))
    } else {
      setAccountName(null)
    }
  }

  const refreshWallet = async (current: SpikeAuth) => {
    const call = await getWallet(baseUrl, current)
    push(call)
    if (call.ok) {
      const money = extractWalletMoney(call)
      setWalletMoney(money)
      return money
    }
    setNotice({ text: call.error ?? '余额读取失败', tone: 'danger' })
    return null
  }

  const bootstrap = async (current: SpikeAuth) => {
    await loadProjects(current)
    await loadAccountSummary(current)
    await refreshWallet(current)
  }

  useEffect(() => {
    if (!auth) return
    const key = `${auth.loginCode}:${auth.projectId}`
    if (bootKey === key) return
    bootKey = key
    void bootstrap(auth)
    // 只在首次挂载时恢复一次会话
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (countdown <= 0) return
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [countdown])

  useEffect(() => {
    if (!orderNo || timerSeconds <= 0) {
      setRemaining(null)
      setTimerFired(false)
      return
    }
    const deadline = Date.now() + timerSeconds * 1000
    setRemaining(timerSeconds)
    setTimerFired(false)

    const fire = async () => {
      setTimerFired(true)
      if (AUTO_CLOSE_ENABLED) {
        // 开发阶段：到点直接走关阀 + 结算；结果会再发一条浏览器通知。
        setNotice({ text: `自动关阀保护触发（${timerSeconds} 秒），正在结束用水…`, tone: 'info' })
        stopRef.current(true)
        return
      }
      // 正式阶段：只提醒，绝不自动关阀。
      const minutes = Math.max(1, Math.round(timerSeconds / 60))
      const body = `水已经开了 ${minutes} 分钟以上，还没结束用水。`
      const sent = await sendNotification(body)
      setNotice({
        text: sent ? `${body}（已发浏览器通知）` : `${body}（浏览器通知未发送，仅页面内提醒）`,
        tone: sent ? 'info' : 'danger',
      })
      showToast('水还在开，记得结束用水', 'danger')
      if ('vibrate' in navigator) navigator.vibrate([200, 100, 200])
    }

    const timer = window.setInterval(() => {
      const left = Math.ceil((deadline - Date.now()) / 1000)
      if (left > 0) {
        setRemaining(left)
        return
      }
      window.clearInterval(timer)
      setRemaining(0)
      void fire()
    }, 1000)
    return () => window.clearInterval(timer)
  }, [orderNo, timerSeconds, showToast, sendNotification])

  /* ───────────────────────── 登录 ───────────────────────── */

  const doSendCode = async () => {
    if (phone.replace(/\D/g, '').length !== 11) {
      setNotice({ text: '请输入 11 位手机号', tone: 'danger' })
      return
    }
    if (!begin('sms')) return
    try {
      const call = await sendSmsCode(baseUrl, phone)
      push(call)
      if (call.ok) {
        setCountdown(20)
        setNotice({ text: '验证码已发送；短信内容里的 secret 由手机号本地推导', tone: 'success' })
      } else {
        setNotice({ text: call.error ?? '验证码发送失败', tone: 'danger' })
      }
    } finally {
      end()
    }
  }

  const doLogin = async () => {
    const digits = phone.replace(/\D/g, '')
    if (digits.length !== 11) {
      setNotice({ text: '请输入 11 位手机号', tone: 'danger' })
      return
    }
    if (mode === 'password' && password.length < 6) {
      setNotice({ text: '密码至少 6 位', tone: 'danger' })
      return
    }
    if (mode === 'sms' && smsCode.replace(/\D/g, '').length < 4) {
      setNotice({ text: '请输入短信验证码', tone: 'danger' })
      return
    }
    if (!begin('login')) return
    try {
      const call =
        mode === 'password'
          ? await loginWithPassword(baseUrl, phone, password)
          : await loginWithSmsCode(baseUrl, phone, smsCode)
      push(call)
      if (!call.ok) {
        setNotice({ text: call.error ?? '登录失败', tone: 'danger' })
        return
      }
      const next = extractLoginAuth(call, digits)
      if (!next) {
        setNotice({ text: '登录成功但响应里没有 loginCode，无法继续', tone: 'danger' })
        return
      }
      persistAuth(next)
      setPassword('')
      setSmsCode('')
      setDevice(null)
      setProjects([])
      setProjectsLoaded(false)
      setOrderNo('')
      setUsing(null)
      setAccountName(null)
      setWalletMoney(null)
      setBillCount(null)
      await bootstrap(next)
      setNotice({
        text: next.accountId
          ? '登录成功，已拉取项目/账号/余额'
          : '登录成功，但缺少 accountId；切换项目可能失败',
        tone: next.accountId ? 'success' : 'danger',
      })
    } finally {
      end()
    }
  }

  const doLogout = () => {
    if (orderNoRef.current) {
      setNotice({ text: '先结束用水再退出：退出会拿不到 orderNo，无法关阀', tone: 'danger' })
      return
    }
    persistAuth(null)
    setProjects([])
    setProjectsLoaded(false)
    setDevice(null)
    resetOrderState()
    setAccountName(null)
    setWalletMoney(null)
    setBills([])
    setBillCount(null)
    setProjects([])
    setNotice({ text: '已退出并清空本标签页的登录态', tone: 'info' })
  }

  /* ───────────────────────── 项目 ───────────────────────── */

  const doSwitchProject = async (project: SpikeProject) => {
    if (!auth) return
    if (orderNoRef.current) {
      setNotice({ text: '设备运行中，先结束用水再切换项目', tone: 'danger' })
      return
    }
    if (!begin('switch')) return
    try {
      const call = await switchProject(baseUrl, auth, project.projectId)
      push(call)
      if (!call.ok) {
        setNotice({ text: call.error ?? '切换项目失败，已保留当前项目', tone: 'danger' })
        return
      }
      const { auth: next, projectName } = extractSwitchAuth(call, auth, project)
      persistAuth(next)
      setCurrentProjectName(projectName)
      setProjects((previous) =>
        previous.map((item) =>
          item.projectId === project.projectId ? { ...item, projectName } : item,
        ),
      )
      setProjectPicker(false)
      setDevice(null)
      setModes([])
      setModesLoaded(false)
      resetOrderState()
      setAccountName(null)
      setWalletMoney(null)
      setBills([])
      setBillCount(null)

      await loadAccountSummary(next)
      await refreshWallet(next)
      setNotice({
        text: `已切换到「${projectName}」。钱包/账单/设备已按新项目重新加载。`,
        tone: 'success',
      })
    } finally {
      end()
    }
  }

  /* ───────────────────────── 设备 ───────────────────────── */

  const lookupDevice = async () => {
    if (!auth) return
    if (orderNoRef.current) {
      setNotice({ text: '设备运行中，先结束用水再换设备', tone: 'danger' })
      return
    }
    const raw = macInput.trim()
    if (!raw) return

    let address = ''
    if (raw.toUpperCase().startsWith('KLCXKJ')) {
      const parsed = parseQr(raw)
      if (!parsed) {
        setNotice({ text: '二维码格式不对，应为 KLCXKJ-Water,<字段>,<12 位 hex>', tone: 'danger' })
        return
      }
      address = parsed.address
    } else {
      const normalized = normalizeMac(raw)
      if (!normalized) {
        setNotice({ text: '请输入 12 位 MAC 或完整二维码', tone: 'danger' })
        return
      }
      address = normalized
    }

    try {
      sessionStorage.setItem(MAC_KEY, macInput)
    } catch {
      // ignore
    }

    if (!begin('device')) return
    try {
      let found: Record<string, string> | null = null
      const variants = macVariants(address)
      for (const variant of variants) {
        const call = await getDeviceInfo(baseUrl, auth, variant)
        push(call)
        const summary = extractDeviceSummary(call)
        if (call.ok && summary.snCode) {
          found = summary
          break
        }
        if (Number(call.envelope?.errorCode) === 8) {
          setNotice({ text: '登录已失效（errorCode 8），请重新登录', tone: 'danger' })
          break
        }
      }
      setDevice(found)
      setModes([])
      setModesLoaded(false)
      resetOrderState()
      setCloseDiag(null)
      if (found) {
        setNotice({
          text: `找到设备：${found.deviceName ?? found.snCode}${found.isBle === 'true' ? '（服务端标记 isBle，本 PWA 不支持蓝牙表）' : ''}`,
          tone: found.isBle === 'true' ? 'danger' : 'success',
        })
      } else {
        setNotice({
          text: `没查到设备（尝试 ${variants.join(' / ')}）：确认项目、MAC 变体与登录态`,
          tone: 'danger',
        })
      }
    } finally {
      end()
    }
  }

  const loadModes = async () => {
    if (!auth || !device?.smallTypeId) return
    if (!begin('modes')) return
    try {
      const call = await getModeList(baseUrl, auth, device.smallTypeId)
      push(call)
      if (!call.ok) {
        setNotice({ text: call.error ?? '模式/套餐列表读取失败', tone: 'danger' })
        return
      }
      const list = extractModes(call)
      setModes(list)
      setModesLoaded(true)
      setNotice({
        text: list.length
          ? `模式/套餐列表：${list.length} 条`
          : '模式列表为空：该接口可能不适用于这台设备（或需要按 bigTypeId 走官方流程）',
        tone: list.length ? 'success' : 'info',
      })
    } finally {
      end()
    }
  }

  const deviceIsBleOnly = device?.isBle === 'true'
  // 只在服务端明确返回了 onlineStatusId 且不是 1 时判离线；
  // 字段缺失不能当成离线，否则老接口/部分学校会被误挡。
  const deviceOffline =
    Boolean(device?.onlineStatusId) && String(device?.onlineStatusId) !== '1'
  const deviceIsDryer =
    device?.bigTypeId === '7' ||
    (device?.smallTypeName ?? '').includes('吹风') ||
    (device?.bigTypeName ?? '').includes('吹风')
  const deviceUnavailable = deviceIsBleOnly || deviceOffline || deviceIsDryer
  const activeOwnership = using?.verdict === 'has-order' ? using.ownership : null
  const hasActiveOrder = Boolean(orderNo) || activeOwnership !== null

  /* ───────────────────────── 订单 ───────────────────────── */

  const findOwnOrder = async (snCode: string): Promise<UsingResult | null> => {
    if (!auth) return null
    const call = await queryUsing(baseUrl, auth, snCode)
    push(call)
    const result = classifyUsing(call, auth?.accountId)
    setUsing(result)
    if (result.verdict === 'has-order' && result.owned && result.orderNo) {
      rememberOrder(result.orderNo)
    }
    return result
  }

  const refreshUsing = async () => {
    if (!auth || !device?.snCode) return
    if (!begin('using')) return
    try {
      const call = await queryUsing(baseUrl, auth, device.snCode)
      push(call)
      const result = classifyUsing(call, auth?.accountId)
      setUsing(result)
      if (result.verdict === 'has-order' && result.owned && result.orderNo) {
        rememberOrder(result.orderNo)
      }
      setNotice({ text: result.detail, tone: result.verdict === 'uncertain' ? 'danger' : 'info' })
    } finally {
      end()
    }
  }

  const doStart = async () => {
    if (!auth || !device?.snCode || !confirmStart || orderNo) return
    if (deviceIsBleOnly) {
      setNotice({ text: '该设备是蓝牙表，本 PWA 不支持', tone: 'danger' })
      return
    }
    if (deviceOffline) {
      setNotice({ text: '设备离线（onlineStatusId 不是 1），指令下发不了，先别开阀', tone: 'danger' })
      return
    }
    if (deviceIsDryer) {
      setNotice({
        text: '吹风机流程还没验证（设备信息里没有价格/时长）：先看模式列表或抓官方 App，不要用开水表的方式开阀',
        tone: 'danger',
      })
      return
    }
    if (!begin('start')) return
    try {
      const snCode = device.snCode
      // 开阀前必须查占用：自己的单要恢复，别人的单绝不能开
      const pre = await findOwnOrder(snCode)
      if (pre?.verdict === 'has-order') {
        if (pre.owned && pre.orderNo) {
          setNotice({
            text: `已有你的进行中订单 ${pre.orderNo}，已恢复，不重复开阀`,
            tone: 'info',
          })
        } else {
          setNotice({
            text: '设备被他人占用（isOwner=false），不能开阀，也不能拿别人的订单号去关阀',
            tone: 'danger',
          })
        }
        return
      }
      if (pre?.verdict === 'uncertain') {
        setNotice({
          text: '占用查询失败（三态=不确定），仍按你的确认继续开阀；若失败请看日志',
          tone: 'info',
        })
      }
      const startCall = await startWater(baseUrl, auth, snCode)
      push(startCall)
      if (!startCall.ok) {
        setNotice({ text: startCall.error ?? '开阀请求失败', tone: 'danger' })
        return
      }

      let found = ''
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const resultCall = await queryDownRateResult(baseUrl, auth, snCode)
        push(resultCall)
        const data = asRecord(resultCall.envelope?.data)
        const number = asString(data?.orderNo)
        if (number) {
          found = number
          break
        }
        if (resultCall.error && !resultCall.envelope) break
        await delay(1000)
      }

      if (found) {
        rememberOrder(found)
        setConfirmStart(false)
        setNotice({
          text: `已开阀，orderNo = ${found}；${
            timerSeconds > 0
              ? `${timerSeconds} 秒后${AUTO_CLOSE_ENABLED ? '自动关阀' : '提醒（不会自动关阀）'}`
              : `未启用${AUTO_CLOSE_ENABLED ? '自动关阀' : '提醒'}，请手动结束`
          }`,
          tone: 'success',
        })
        // 用 queryUsing 再确认一次三态，让「进行中订单」卡片反映真实状态
        const usingCall = await queryUsing(baseUrl, auth, snCode)
        push(usingCall)
        setUsing(classifyUsing(usingCall, auth?.accountId))
      } else {
        setNotice({
          text: 'downRate 成功但没从 downRateResult 拿到 orderNo；先查进行中订单确认，不要重复开阀',
          tone: 'danger',
        })
        const call = await queryUsing(baseUrl, auth, snCode)
        push(call)
        const result = classifyUsing(call, auth?.accountId)
        setUsing(result)
        if (result.verdict === 'has-order' && result.owned && result.orderNo) {
          rememberOrder(result.orderNo)
        }
      }
    } finally {
      end()
    }
  }

  const doStop = async (auto = false) => {
    if (!auth || !device?.snCode) return
    if (!begin('stop')) return
    try {
      const snCode = device.snCode
      let currentOrderNo = orderNoRef.current
      if (!currentOrderNo) {
        const found = await findOwnOrder(snCode)
        currentOrderNo =
          found?.verdict === 'has-order' && found.owned ? found.orderNo : ''
        if (!currentOrderNo) {
          setNotice({
            text:
              found?.verdict === 'has-order'
                ? '设备上是别人的订单（isOwner=false），不能关阀'
                : '没有可用的 orderNo，无法关阀',
            tone: 'danger',
          })
          if (auto) {
            void sendNotification('自动关阀失败：没有可用的 orderNo，请手动检查设备')
          }
          return
        }
      }

      const closeCall = await closeWater(baseUrl, auth, snCode, currentOrderNo)
      push(closeCall)
      const accepted = isCloseAccepted(closeCall)
      setCloseDiag(
        `closeOrder：HTTP ${closeCall.httpStatus ?? '—'} · ${accepted ? '已受理' : '未受理'}` +
          `${closeCall.envelope?.errorCode !== undefined ? ` · errorCode ${closeCall.envelope.errorCode}` : ''}` +
          `${closeCall.error ? ` · ${closeCall.error}` : ''} · orderNo=${currentOrderNo}`,
      )
      if (!accepted) {
        setNotice({ text: closeCall.error ?? '关阀请求未被服务端接受', tone: 'danger' })
        // 仍然轮询 queryUsing，交给三态判定
      }

      // 307 = 还有订单，不是查询失败；继续等它变成「无订单」。
      // 4G 指令有延迟，给 12 秒；网络错误则提前结束，避免空等超时。
      let verdict: UsingResult | null = null
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const call = await queryUsing(baseUrl, auth, snCode)
        push(call)
        verdict = classifyUsing(call, auth?.accountId)
        setUsing(verdict)
        if (verdict.verdict === 'no-order') break
        if (call.httpStatus === null) break
        await delay(1000)
      }

      if (verdict?.verdict === 'no-order') {
        setOrderNo('')
        const first = await queryConsumeResult(baseUrl, auth, snCode, currentOrderNo)
        push(first)
        let li = extractConsumeLi(first)
        if (li === 0) {
          await delay(1200)
          const second = await queryConsumeResult(baseUrl, auth, snCode, currentOrderNo)
          push(second)
          li = extractConsumeLi(second)
        }
        const money = await refreshWallet(auth)
        setNotice({
          text: `已确认关阀。结算：${li === null ? '暂无金额' : `${li} 厘 = ¥${liToYuan(li).toFixed(3)}`}${money ? `；余额 ¥${money}` : ''}`,
          tone: 'success',
        })
        if (auto) {
          void sendNotification(
            `自动关阀已执行：${li === null ? '金额待结算' : `结算 ¥${liToYuan(li).toFixed(3)}`}${money ? `，余额 ¥${money}` : ''}`,
          )
        }
      } else if (accepted && verdict?.verdict === 'has-order') {
        setNotice({
          text: '关阀请求已受理，但 queryUsing 仍显示有订单（可能正在关闭）。订单号已保留：稍后再查一次，或再点结束重试；不要重复开阀。',
          tone: 'info',
        })
        if (auto) {
          void sendNotification('自动关阀已受理，但服务端仍显示订单，可能正在关闭')
        }
      } else {
        setNotice({
          text: `关阀未成功：${closeCall.error ?? 'closeOrder 未被接受'}。设备可能还在出水，请用官方 App 关闭，或再点一次结束。`,
          tone: 'danger',
        })
        if (auto) {
          void sendNotification('自动关阀失败：服务端未接受 closeOrder，请检查设备是否还在出水')
        }
      }
    } finally {
      end()
    }
  }

  /** 预扣/退款测试：开阀 → 查余额 → 关阀 → 连续查余额，观察 10 元预扣何时释放 */
  const runRefundTest = async () => {
    if (!auth || !device?.snCode) {
      setNotice({ text: '先登录并查询一台水表，再做预扣测试', tone: 'danger' })
      return
    }
    if (
      !window.confirm(
        '会真实开阀并关阀（使用当前设备），请确认设备旁有人、可以安全出水。继续？',
      )
    ) {
      return
    }
    if (!begin('refund')) return

    const snCode = device.snCode
    const rows: RefundRow[] = []
    const startedAt = Date.now()
    const snapshot = async (label: string, extra?: string) => {
      const call = await getWallet(baseUrl, auth)
      push(call)
      const money = call.ok ? extractWalletMoney(call) : null
      rows.push({ label, at: Date.now(), money, extra })
      setRefundRows([...rows])
      return money
    }

    try {
      setRefundRows([])
      const pre = await findOwnOrder(snCode)
      if (pre?.verdict !== 'no-order') {
        setNotice({
          text:
            pre?.verdict === 'has-order'
              ? '设备上已有订单，预扣测试会中止；请先结束当前订单'
              : '无法确认设备空闲，预扣测试中止',
          tone: 'danger',
        })
        return
      }

      await snapshot('开阀前')
      const startCall = await startWater(baseUrl, auth, snCode)
      push(startCall)
      if (!startCall.ok) {
        setNotice({ text: startCall.error ?? '开阀失败，测试中止', tone: 'danger' })
        return
      }

      let currentOrderNo = ''
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const resultCall = await queryDownRateResult(baseUrl, auth, snCode)
        push(resultCall)
        const data = asRecord(resultCall.envelope?.data)
        const number = asString(data?.orderNo)
        if (number) {
          currentOrderNo = number
          break
        }
        if (resultCall.error && !resultCall.envelope) break
        await delay(1000)
      }
      await snapshot('开阀后（拿到 orderNo）', currentOrderNo || '未拿到 orderNo')
      if (!currentOrderNo) {
        setNotice({ text: '未拿到 orderNo，测试中止；不要重复开阀', tone: 'danger' })
        return
      }

      const closeCall = await closeWater(baseUrl, auth, snCode, currentOrderNo)
      push(closeCall)
      await snapshot('closeOrder 返回')

      let verdict: UsingResult | null = null
      for (let attempt = 0; attempt < 15; attempt += 1) {
        const call = await queryUsing(baseUrl, auth, snCode)
        push(call)
        verdict = classifyUsing(call, auth.accountId)
        if (verdict.verdict === 'no-order') break
        await delay(1000)
      }
      await snapshot('queryUsing 确认无订单', verdict?.verdict ?? 'unknown')

      const consumeCall = await queryConsumeResult(baseUrl, auth, snCode, currentOrderNo)
      push(consumeCall)
      const li = extractConsumeLi(consumeCall)
      await snapshot(
        'consume 查询后',
        li === null ? '金额待结算' : `${li} 厘 = ¥${liToYuan(li).toFixed(3)}`,
      )

      for (const waitMs of [3000, 7000, 20000]) {
        await delay(waitMs)
        await snapshot(`+${(Date.now() - startedAt) / 1000 | 0}s`, `距开始约 ${waitMs / 1000}s`)
      }
      setNotice({ text: '预扣退款测试完成，把下面的时间点结果发我', tone: 'success' })
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : '预扣测试失败', tone: 'danger' })
    } finally {
      end()
    }
  }

  stopRef.current = (auto) => {
    void doStop(auto)
  }

  const loadBills = async () => {
    if (!auth) return
    if (!begin('bills')) return
    try {
      const call = await getBills(baseUrl, auth, month)
      push(call)
      const list = extractBills(call)
      setBills(list)
      setBillCount(list.length)
      if (!call.ok) {
        setNotice({ text: call.error ?? '账单加载失败', tone: 'danger' })
        return
      }
      if (list.length === 0) {
        setNotice({
          text: `账单 ${month}：该项目本月没有账单（账单按项目隔离，当前项目 ${currentProjectName || auth.projectId}）`,
          tone: 'info',
        })
      } else {
        setNotice({ text: `账单 ${month}：${list.length} 条`, tone: 'success' })
      }
    } finally {
      end()
    }
  }

  /* ───────────────────────── 报告 ───────────────────────── */

  const buildReport = () => {
    const last = (key: string) => [...calls].reverse().find((call) => call.key === key)
    const consumeCall = last('consume')
    const li = consumeCall ? extractConsumeLi(consumeCall) : null
    const deviceCall = last('device')
    const lastUsing = last('using')

    return {
      app: 'linyu-pwa-spike',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      baseUrl,
      auth: auth
        ? {
            userId: auth.userId,
            accountId: auth.accountId,
            projectId: auth.projectId,
            projectName: currentProjectName,
            telephone: maskPhone(auth.telephone),
            loginCode: maskToken(auth.loginCode),
          }
        : null,
      account: {
        name: accountName === null ? '(未拉取)' : accountName || '(服务端未返回 name)',
        walletMoney,
      },
      projects,
      device: device ?? (deviceCall ? extractDeviceSummary(deviceCall) : null),
      findings: {
        loginOk: last('login')?.ok ?? null,
        projectCount: projects.length,
        walletMoney,
        usingLast: lastUsing ? (lastUsing.safe?.data ?? null) : null,
        using307Count: calls.filter(
          (call) => call.key === 'using' && Number(call.envelope?.errorCode) === 307,
        ).length,
        orderNo: orderNo || null,
        lastOrderNo: lastOrderNo || null,
        closeDiagnostic: closeDiag,
        timerMode: AUTO_CLOSE_ENABLED ? 'auto-close(dev)' : 'remind(prod)',
        timerSeconds,
        timerFired,
        notificationPermission: notifPermission,
        consumeLi: li,
        consumeYuan: li === null ? null : liToYuan(li),
        billsCount: billCount,
        billsPreview: bills.slice(0, 10),
      },
      calls: calls.map((call) => ({
        key: call.key,
        label: call.label,
        method: call.method,
        url: call.url,
        form: call.form,
        httpStatus: call.httpStatus,
        durationMs: call.durationMs,
        ok: call.ok,
        error: call.error,
        at: new Date(call.at).toISOString(),
        response: call.safe ?? call.safeText.slice(0, 2000),
      })),
    }
  }

  const copyReport = async () => {
    const text = JSON.stringify(buildReport(), null, 2)
    try {
      await navigator.clipboard.writeText(text)
      showToast('报告已复制（已脱敏）', 'success')
    } catch {
      setNotice({ text: '剪贴板不可用，请用「下载 JSON」', tone: 'danger' })
    }
  }

  const downloadReport = () => {
    const report = buildReport()
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `linyu-spike-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const busyNow = busy !== null
  const visibleCalls = showAllCalls ? [...calls].reverse() : [...calls].reverse().slice(0, 12)

  return (
    <main className="page spike-page">
      <PageHeader title="M0 接口联调" subtitle="真实 API · 会真的开关水" back />

      <section className="spike-alert">
        <AlertTriangle size={18} />
        <div>
          <strong>这是真机联调页，不是演示</strong>
          <p>
            开阀会真的放水、真的扣费。凭据只存在本标签页 sessionStorage；报告导出时 loginCode /
            手机号 / 密码自动脱敏。
            {AUTO_CLOSE_ENABLED
              ? '开发阶段默认到点自动关阀（防止调试时忘关水）；正式构建会自动改为只提醒。'
              : '不会自动关阀；到点只发提醒。'}
            关页、断网或锁屏后定时器不会执行，请自己确认结束用水。
          </p>
        </div>
      </section>

      {notice && (
        <button
          type="button"
          className={`spike-notice spike-notice--${notice.tone}`}
          onClick={() => setNotice(null)}
          title="点击关闭"
        >
          {notice.text}
        </button>
      )}

      {/* 1 登录 */}
      <section className="spike-card">
        <div className="spike-card__head">
          <span className="spike-step">1</span>
          <h2>登录</h2>
          {auth ? (
            <span className="tag tag--green">
              <CheckCircle2 size={12} /> 已登录
            </span>
          ) : (
            <span className="tag tag--muted">未登录</span>
          )}
        </div>

        {auth ? (
          <>
            <div className="spike-kv">
              <span>手机号</span>
              <strong>{maskPhone(auth.telephone)}</strong>
            </div>
            <div className="spike-kv">
              <span>姓名</span>
              <strong>
                {accountName === null
                  ? '未拉取'
                  : accountName || '服务端未返回（界面用手机号）'}
              </strong>
            </div>
            <div className="spike-kv">
              <span>userId</span>
              <code>{auth.userId || '—'}</code>
            </div>
            <div className="spike-kv">
              <span>accountId</span>
              <code>{auth.accountId || '—'}</code>
            </div>
            <div className="spike-kv">
              <span>loginCode</span>
              <code>{maskToken(auth.loginCode)}</code>
            </div>
            <div className="spike-kv">
              <span>余额</span>
              <strong>{walletMoney === null ? '—' : `¥${walletMoney}`}</strong>
            </div>
            <button className="ghost-button" type="button" onClick={doLogout} disabled={busyNow}>
              退出并清空本标签页
            </button>
          </>
        ) : (
          <>
            <div className="segmented">
              <button
                type="button"
                className={mode === 'password' ? 'is-active' : ''}
                onClick={() => setMode('password')}
              >
                密码登录
              </button>
              <button
                type="button"
                className={mode === 'sms' ? 'is-active' : ''}
                onClick={() => setMode('sms')}
              >
                验证码登录
              </button>
            </div>

            <label className="field">
              <span className="field__label">手机号</span>
              <span className="field__control">
                <Smartphone size={18} />
                <input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="11 位手机号"
                />
              </span>
            </label>

            {mode === 'password' ? (
              <label className="field">
                <span className="field__label">密码（本地 MD5 后 10 位大写）</span>
                <span className="field__control">
                  <LockKeyhole size={18} />
                  <input
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    type="password"
                    autoComplete="current-password"
                    placeholder="登录密码"
                  />
                </span>
              </label>
            ) : (
              <label className="field">
                <span className="field__label">短信验证码</span>
                <span className="field__control">
                  <KeyRound size={18} />
                  <input
                    value={smsCode}
                    onChange={(event) => setSmsCode(event.target.value)}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="6 位验证码"
                  />
                  <button
                    type="button"
                    className="field__action"
                    onClick={doSendCode}
                    disabled={countdown > 0 || busyNow}
                  >
                    {countdown > 0 ? `${countdown}s` : '获取验证码'}
                  </button>
                </span>
              </label>
            )}

            <button
              className="primary-button primary-button--full"
              type="button"
              onClick={doLogin}
              disabled={busyNow}
            >
              <ShieldCheck size={18} />
              登录真实账号
            </button>

            <details className="spike-advanced">
              <summary>高级：API 地址</summary>
              <label className="field">
                <span className="field__label">Base URL</span>
                <span className="field__control">
                  <input
                    value={baseUrl}
                    onChange={(event) => {
                      const value = event.target.value
                      setBaseUrl(value)
                      try {
                        localStorage.setItem(BASE_KEY, value)
                      } catch {
                        // ignore
                      }
                    }}
                    placeholder="https://v3-api.china-qzxy.cn"
                  />
                </span>
              </label>
              <p>直连被 CORS/WAF 拦时，改成你的同源反代地址（例如 https://你的域名/api）。</p>
            </details>
          </>
        )}
      </section>

      {auth && (
        <>
          {/* 2 项目 */}
          <section className="spike-card">
            <div className="spike-card__head">
              <span className="spike-step">2</span>
              <h2>项目</h2>
              <span className="tag tag--muted">{projectsLoaded ? `${projects.length} 个` : '加载中'}</span>
            </div>

            <div className="spike-project">
              <div>
                <small>当前项目</small>
                <strong>
                  {currentProjectName || `项目 ${auth.projectId}`}
                  <span className="spike-project__id">#{auth.projectId}</span>
                </strong>
              </div>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setProjectPicker((value) => !value)}
                disabled={busyNow || Boolean(orderNo)}
              >
                {orderNo ? '用水结束后可切换' : '切换项目'}
              </button>
            </div>

            {projectPicker && (
              <div className="spike-project-list">
                {projects.length === 0 && (
                  <p className="spike-hint">
                    项目列表为空或未加载。切项目会改变钱包、账单、设备与 Config-Project。
                  </p>
                )}
                {projects.map((project) => {
                  const active = project.projectId === auth.projectId
                  return (
                    <button
                      key={project.projectId}
                      type="button"
                      className={`spike-project-item ${active ? 'is-active' : ''}`}
                      onClick={() => void doSwitchProject(project)}
                      disabled={busyNow || active}
                    >
                      <span>
                        <strong>{project.projectName}</strong>
                        <small>
                          #{project.projectId}
                          {project.projectDescript ? ` · ${project.projectDescript}` : ''}
                        </small>
                      </span>
                      {active ? <CheckCircle2 size={16} /> : <span>切换</span>}
                    </button>
                  )
                })}
              </div>
            )}

            <p className="spike-hint">
              切项目时 `Config-Project` 与认证参数都用目标项目；返回里的 accountId / loginCode
              会覆盖本地。运行中的订单不能切项目。
            </p>
          </section>

          {/* 3 设备 */}
          <section className="spike-card">
            <div className="spike-card__head">
              <span className="spike-step">3</span>
              <h2>设备</h2>
              <span className="tag tag--muted">/device/info/mac</span>
            </div>

            <label className="field">
              <span className="field__label">MAC 或完整二维码</span>
              <span className="field__control">
                <Droplets size={18} />
                <input
                  value={macInput}
                  onChange={(event) => setMacInput(event.target.value)}
                  placeholder="KLCXKJ-Water,M,A1B2C3D4E5F6"
                />
              </span>
            </label>
            <div className="spike-quick">
              <button type="button" onClick={() => setMacInput('A1B2C3D4E5F6')}>
                水表 C47F…
              </button>
              {DRYER_ENABLED && (
                <button type="button" onClick={() => setMacInput('001583CC0CFE')}>
                  吹风机 0015…
                </button>
              )}
            </div>
            <button
              className="ghost-button"
              type="button"
              onClick={lookupDevice}
              disabled={busyNow || !macInput.trim() || Boolean(orderNo)}
            >
              <RefreshCw size={17} />
              查询设备
            </button>

            {device && (
              <div className="spike-device">
                <strong>{device.deviceName ?? '未命名设备'}</strong>
                <div className="spike-kv">
                  <span>snCode</span>
                  <code>{device.snCode}</code>
                </div>
                <div className="spike-kv">
                  <span>类型</span>
                  <span>
                    bigTypeId {device.bigTypeId ?? '—'} / smallTypeId {device.smallTypeId ?? '—'}
                    {device.bigTypeName ? ` · ${device.bigTypeName}` : ''}
                  </span>
                </div>
                <div className="spike-kv">
                  <span>isBle</span>
                  <strong>{device.isBle ?? '未返回'}</strong>
                </div>
                <div className="spike-kv">
                  <span>预扣 / 在线</span>
                  <span>
                    {device.withholdMoney ?? '—'} 元 / onlineStatusId {device.onlineStatusId ?? '—'}
                  </span>
                </div>
                <div className="spike-kv">
                  <span>通信 / 扣款</span>
                  <span>
                    communicationTypeId {device.communicationTypeId ?? '—'} · deductionMethod{' '}
                    {device.deductionMethod ?? '—'} · chargeMode {device.chargeMode ?? '—'}
                  </span>
                </div>
                {(device.modeId || device.modeTime) && (
                  <div className="spike-kv">
                    <span>modeId / modeTime</span>
                    <span>
                      {device.modeId ?? '—'} / {device.modeTime ?? '—'}
                    </span>
                  </div>
                )}
                {deviceIsBleOnly && (
                  <p className="spike-error">服务端标记 isBle=true：蓝牙表不在 PWA 范围，别开阀。</p>
                )}
                {deviceOffline && !deviceIsBleOnly && (
                  <p className="spike-error">
                    设备离线（onlineStatusId={device.onlineStatusId ?? '—'}）：指令可能下发失败，先别开阀。
                  </p>
                )}
                {deviceIsDryer && (
                  <p className="spike-error">
                    吹风机流程未验证：设备信息里没有价格/时长（withholdMoney=
                    {device.withholdMoney ?? '—'}，modeId/modeTime 为空），不能直接用开水表的
                    downRate。先查模式/套餐列表，或抓官方 App 的下单请求。
                  </p>
                )}

                <button
                  className="ghost-button"
                  type="button"
                  onClick={loadModes}
                  disabled={busyNow || !device.smallTypeId}
                >
                  <RefreshCw size={16} />
                  查模式/套餐列表（只读）
                </button>

                {modesLoaded && modes.length === 0 && (
                  <p className="spike-hint">
                    模式列表为空。`/device/mode/list` 在本地代码里只验证过洗衣机
                    （bigTypeId=6）；吹风机（bigTypeId=7）需要抓官方 App 确认。
                  </p>
                )}

                {modes.length > 0 && (
                  <div className="spike-modes">
                    {modes.map((mode) => (
                      <div className="spike-mode" key={`${mode.typeId}-${mode.positionId}`}>
                        <div>
                          <strong>{mode.typeName || `模式 ${mode.typeId}`}</strong>
                          <small>
                            typeId {mode.typeId}
                            {mode.positionId ? ` · positionId ${mode.positionId}` : ''}
                          </small>
                        </div>
                        <span>
                          {mode.moneyYuan
                            ? `¥${mode.moneyYuan}`
                            : mode.money
                              ? `${mode.money} 厘`
                              : '—'}
                          {' · '}
                          {mode.timesMinute
                            ? `${mode.timesMinute} 分钟`
                            : mode.times
                              ? `${mode.times} 秒`
                              : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* 4 进行中订单 */}
          <section className="spike-card">
            <div className="spike-card__head">
              <span className="spike-step">4</span>
              <h2>进行中订单</h2>
              {using && (
                <span
                  className={`tag ${
                    using.verdict === 'no-order'
                      ? 'tag--green'
                      : using.ownership === 'own'
                        ? 'tag--warn'
                        : 'tag--danger'
                  }`}
                >
                  {using.verdict === 'no-order'
                    ? '无订单'
                    : using.ownership === 'own'
                      ? '你的订单'
                      : using.ownership === 'other'
                        ? '他人使用中'
                        : '归属未知'}
                </span>
              )}
            </div>
            <button
              className="ghost-button"
              type="button"
              onClick={refreshUsing}
              disabled={busyNow || !device?.snCode}
            >
              查询 queryUsing（三态）
            </button>
            {using && (
              <div className="spike-using">
                <p>{using.detail}</p>
                {using.orderNo && (
                  <div className="spike-kv">
                    <span>orderNo</span>
                    <code>{using.orderNo}</code>
                  </div>
                )}
                {using.preDeductMoney !== undefined && using.preDeductMoney !== null && (
                  <div className="spike-kv">
                    <span>preDeductMoney</span>
                    <code>{String(using.preDeductMoney)} 厘</code>
                  </div>
                )}
                {using.verdict === 'has-order' && using.ownership === 'other' && (
                  <p className="spike-error">
                    isOwner=false：这是别人的订单，绝不能开阀、也不能拿别人的 orderNo 去关阀。
                  </p>
                )}
                {using.verdict === 'has-order' && using.ownership === 'unknown' && (
                  <p className="spike-error">
                    服务端没给 isOwner，也没有可对比的 accountId，无法判断归属；为安全起见不要操作。
                  </p>
                )}
                {using.verdict === 'has-order' && using.ownership === 'own' && (
                  <button
                    type="button"
                    className="primary-button primary-button--full"
                    onClick={() => void doStop()}
                    disabled={busyNow}
                  >
                    <Square size={16} />
                    结束这单并结算（自己的订单）
                  </button>
                )}
              </div>
            )}
          </section>

          {/* 5 开阀 */}
          <section className="spike-card spike-card--danger">
            <div className="spike-card__head">
              <span className="spike-step">5</span>
              <h2>开阀</h2>
              <span className="tag tag--muted">真实放水</span>
            </div>

            {hasActiveOrder ? (
              <p className="spike-hint">
                {activeOwnership === 'other'
                  ? '设备正在被他人使用（isOwner=false），不能开阀。'
                  : activeOwnership === 'unknown'
                    ? '服务端没给订单归属，先别开阀；等查清或问服务端。'
                    : `你先有一单没结束${orderNo ? `（${orderNo}）` : ''}，点上面第 4 步的「结束这单并结算」，不要重复开阀。`}
              </p>
            ) : deviceUnavailable ? (
              <p className="spike-hint">
                {deviceIsDryer
                  ? '吹风机流程未验证，暂时禁止开阀。先查上面的模式/套餐列表，或抓官方 App。'
                  : deviceOffline
                    ? '设备离线，等 onlineStatusId=1 再开。'
                    : '蓝牙表不在 PWA 范围。'}
              </p>
            ) : (
              <>
                <label className="spike-check">
                  <input
                    type="checkbox"
                    checked={confirmStart}
                    onChange={(event) => setConfirmStart(event.target.checked)}
                  />
                  <span>我确认设备旁无人使用，开阀会真的放水并扣费</span>
                </label>

                <div className="spike-inline">
                  <span>{AUTO_CLOSE_ENABLED ? '自动关阀' : '未关阀提醒'}</span>
                  <input
                    type="number"
                    min={0}
                    max={3600}
                    value={timerSeconds}
                    onChange={(event) => {
                      const value = Math.min(3600, Math.max(0, Number(event.target.value) || 0))
                      setTimerSeconds(value)
                      try {
                        localStorage.setItem(TIMER_KEY, String(value))
                      } catch {
                        // ignore
                      }
                    }}
                  />
                  <span>{AUTO_CLOSE_ENABLED ? '秒（0 = 不自动关）' : '秒（0 = 不提醒）'}</span>
                </div>

                <div className="spike-notify">
                  <button className="ghost-button" type="button" onClick={requestNotifications} disabled={busyNow}>
                    <Bell size={16} />
                    {notifPermission === 'granted' ? '发送测试通知' : '开启浏览器通知'}
                  </button>
                  <span className="spike-notify__state">
                    {notifPermission === 'unsupported'
                      ? '浏览器不支持通知'
                      : notifPermission === 'granted'
                        ? '已允许'
                        : notifPermission === 'denied'
                          ? '已拒绝，仅页面内提醒'
                          : '未授权'}
                  </span>
                </div>
                <p className="spike-hint">
                  {AUTO_CLOSE_ENABLED
                    ? '开发阶段保护：到点自动 closeOrder 并结算，防止调试时忘关水。正式构建会自动切换成「只提醒、不自动关阀」。'
                    : '正式模式：到点只发提醒，不会自动关阀。'}
                  通知只在本页打开时有效，且需要 HTTPS/localhost；手机用局域网 http 打开时 Chrome
                  不允许通知，只能用页面内提醒。
                </p>

                <button
                  className="danger-button"
                  type="button"
                  onClick={doStart}
                  disabled={busyNow || !confirmStart || !device?.snCode || deviceUnavailable}
                >
                  <Play size={18} />
                  开阀 downRate
                </button>
                <p className="spike-hint">
                  开阀前会先 queryUsing：自己的单→恢复；别人的单→直接拒绝；无单→才 downRate。
                </p>
              </>
            )}

            {remaining !== null && orderNo && (
              <p className="spike-countdown">
                {timerFired ? (
                  AUTO_CLOSE_ENABLED ? (
                    '自动关阀已触发：正在确认关阀结果…'
                  ) : (
                    '已提醒：水还在开，请结束用水'
                  )
                ) : AUTO_CLOSE_ENABLED ? (
                  <>
                    自动关阀倒计时 <strong>{remaining}s</strong>
                  </>
                ) : (
                  <>
                    距提醒还有 <strong>{remaining}s</strong>（不会自动关阀）
                  </>
                )}
              </p>
            )}
          </section>

          {/* 6 结束并结算 */}
          <section className="spike-card">
            <div className="spike-card__head">
              <span className="spike-step">6</span>
              <h2>结束并结算</h2>
              <span className="tag tag--muted">closeOrder → queryUsing → consume</span>
            </div>
            <button
              className="primary-button primary-button--full"
              type="button"
              onClick={() => void doStop()}
              disabled={
                busyNow ||
                !device?.snCode ||
                (using?.verdict === 'has-order' && using.ownership !== 'own')
              }
            >
              <Square size={17} />
              结束用水并结算
            </button>
            {closeDiag && <p className="spike-hint">{closeDiag}</p>}
            <p className="spike-hint">
              关阀只信 queryUsing 三态；closeOrderResult 的 data 恒为 null，不能当已关证据。结算金额单位是厘。
            </p>
          </section>

          {/* 7 账单 */}
          <section className="spike-card">
            <div className="spike-card__head">
              <span className="spike-step">7</span>
              <h2>账单</h2>
              {billCount !== null && <span className="tag tag--muted">{billCount} 条</span>}
            </div>
            <div className="spike-inline">
              <input
                type="month"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
              />
              <button className="ghost-button" type="button" onClick={loadBills} disabled={busyNow}>
                拉取账单
              </button>
            </div>

            {bills.length > 0 && (
              <div className="spike-bills">
                {bills.map((bill) => (
                  <div className="spike-bill" key={`${bill.orderId}-${bill.consumeDate}`}>
                    <div className="spike-bill__main">
                      <strong>{bill.description || '(无描述)'}</strong>
                      <small>
                        {bill.consumeDate || '—'}
                        {bill.orderNo ? ` · ${bill.orderNo}` : bill.orderId ? ` · #${bill.orderId}` : ''}
                      </small>
                    </div>
                    <strong className="spike-bill__money">¥{bill.consumeMoney || '0.000'}</strong>
                  </div>
                ))}
              </div>
            )}

            {billCount === 0 && (
              <p className="spike-hint">
                该项目本月没有账单。注意：账单、钱包、设备都按项目隔离——不同项目的账单和钱包是隔离的。
              </p>
            )}

            <p className="spike-hint">账单金额是字符串、单位元；结算接口 consumeMoney 是数字、单位厘。</p>
          </section>

          {/* 预扣退款测试 */}
          <section className="spike-card">
            <div className="spike-card__head">
              <span className="spike-step">T</span>
              <h2>预扣退款测试</h2>
            </div>
            <p className="spike-hint">
              使用当前查询到的设备，真实开阀 → 查余额 → 关阀 → 连续查余额。
              用来观察 10 元预扣多久释放；开始前确认水表旁安全。
            </p>
            <button
              className="ghost-button"
              type="button"
              onClick={() => void runRefundTest()}
              disabled={busyNow || !device?.snCode}
            >
              开始预扣/退款测试
            </button>
            {refundRows.length > 0 && (
              <div className="spike-refund">
                <div className="spike-refund__head">
                  <span>时间点</span>
                  <span>余额</span>
                  <span>备注</span>
                </div>
                {refundRows.map((row, index) => (
                  <div className="spike-refund__row" key={`${row.at}-${index}`}>
                    <span>
                      +{Math.round((row.at - refundRows[0].at) / 100) / 10}s
                    </span>
                    <strong>{row.money === null ? '—' : `¥${row.money}`}</strong>
                    <small>
                      {row.label}
                      {row.extra ? ` · ${row.extra}` : ''}
                    </small>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 8 报告 */}
          <section className="spike-card">
            <div className="spike-card__head">
              <span className="spike-step">8</span>
              <h2>M0 报告</h2>
              <span className="tag tag--muted">{calls.length} 次调用</span>
            </div>
            <div className="spike-report-actions">
              <button className="ghost-button" type="button" onClick={copyReport}>
                <Copy size={16} />
                复制 JSON
              </button>
              <button className="ghost-button" type="button" onClick={downloadReport}>
                <Download size={16} />
                下载 JSON
              </button>
              <button
                className="ghost-button"
                type="button"
                onClick={() => {
                  setCalls([])
                  setBillCount(null)
                  setNotice({ text: '调用记录已清空', tone: 'info' })
                }}
              >
                <Trash2 size={16} />
                清空记录
              </button>
            </div>
            <p className="spike-hint">
              报告包含每次请求的 URL、HTTP 状态、耗时与脱敏响应，可直接贴回会话。
            </p>
          </section>

          {/* 9 调用日志 */}
          <section className="spike-card">
            <div className="spike-card__head">
              <span className="spike-step">9</span>
              <h2>调用日志</h2>
              {calls.length > 12 && (
                <button className="text-button" type="button" onClick={() => setShowAllCalls((v) => !v)}>
                  {showAllCalls ? '只看最近 12 条' : `展开全部 ${calls.length} 条`}
                </button>
              )}
            </div>

            {calls.length === 0 && <p className="spike-hint">还没有请求。</p>}

            {visibleCalls.map((call) => (
              <details key={call.id} className={`spike-call ${call.ok ? 'is-ok' : 'is-bad'}`}>
                <summary>
                  <ChevronDown size={14} />
                  <strong>{call.label}</strong>
                  <span className="spike-call__meta">
                    {call.httpStatus ?? '—'} · {call.durationMs}ms
                  </span>
                </summary>
                <div className="spike-call__body">
                  <code className="spike-call__url">{call.url}</code>
                  {call.form && (
                    <pre>{JSON.stringify(call.form, null, 2)}</pre>
                  )}
                  {call.error && <p className="spike-error">{call.error}</p>}
                  <pre>{call.safe ? JSON.stringify(call.safe, null, 2) : call.safeText || '(空响应)'}</pre>
                </div>
              </details>
            ))}
          </section>
        </>
      )}

      <p className="spike-footer">
        M0 目标：登录 → 项目列表/切换 → 钱包 → 设备 → queryUsing → downRate → closeOrder →
        queryUsing 三态 → consume → 账单。所有写操作只在真机上由你手动触发。
      </p>
    </main>
  )
}
