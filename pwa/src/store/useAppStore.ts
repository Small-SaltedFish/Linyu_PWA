import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  asRecord,
  asString,
  classifyUsing,
  closeWater,
  ensureOk,
  getAccountInfo,
  getBills,
  getDeviceInfo,
  getProjectInfo,
  getProjects,
  getWallet,
  isAuthError,
  isCloseAccepted,
  LiveApiError,
  loginWithPassword,
  loginWithSms,
  parseAccountName,
  parseBills,
  parseConsumeYuan,
  parseDevice,
  parseLoginAuth,
  parseProjectName,
  parseProjects,
  parseSwitchAuth,
  parseWallet,
  queryConsumeResult,
  queryDownRateResult,
  queryUsing,
  sendSmsCode as sendSmsCodeApi,
  startWater as startWaterApi,
  switchProject as switchProjectApi,
  type LiveAuth,
  type LiveBill,
  type LiveProject,
  type LiveUsing,
} from '../api/live'
import { demoBills, demoDevices, demoUser } from '../data/demo'
import { clearCredentials } from '../lib/credentials'
import { DRYER_ENABLED } from '../lib/features'
import { demoOrderNo, maskPhone } from '../lib/format'
import { encryptPassword, smsSecret } from '../lib/md5'
import { macVariants, normalizeMac, parseQr } from '../lib/qr'
import type { ActiveOrder, Bill, Device, Settings, ThemeMode, User } from '../types'

export type SessionMode = 'demo' | 'live'

export interface LiveLoginInput {
  phone: string
  mode: 'password' | 'sms'
  password?: string
  /** 已经算好的 MD5 后 10 位；自动登录/记住密码时直接传，避免重复加密 */
  passwordHash?: string
  code?: string
}

interface AppState {
  mode: SessionMode
  user: User | null
  loggedIn: boolean
  auth: LiveAuth | null
  projects: LiveProject[]
  currentProjectId: string
  currentProjectName: string
  schoolName: string
  walletMoney: string
  balance: number
  lastDevice: Device | null
  activeOrder: ActiveOrder | null
  bills: Bill[]
  settings: Settings
  loading: boolean
  sessionChecked: boolean
  sessionError: string | null

  login: (phone?: string) => void
  loginDemo: (phone?: string) => void
  loginLive: (input: LiveLoginInput) => Promise<void>
  sendCode: (phone: string) => Promise<void>
  restoreSession: () => Promise<void>
  switchProject: (project: LiveProject) => Promise<void>
  refreshProjects: () => Promise<void>
  refreshWallet: () => Promise<void>
  refreshBills: () => Promise<void>
  lookupDevice: (input: string) => Promise<Device>
  startWater: (device: Device) => Promise<void>
  stopWater: () => Promise<Bill | null>
  refreshUsing: () => Promise<LiveUsing | null>

  logout: () => void
  setLastDevice: (device: Device) => void
  startOrder: (device: Device) => void
  stopOrder: () => Bill | null
  setTheme: (theme: ThemeMode) => void
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void
}

function createDemoOrder(device: Device): ActiveOrder {
  return {
    device,
    orderNo: demoOrderNo(),
    startedAt: Date.now(),
    pricePerSecond: device.kind === 'water' ? 0.01 : 0,
    mode: 'demo',
  }
}

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function parseDate(value: string): number {
  if (!value) return 0
  const time = new Date(value.replace(' ', 'T')).getTime()
  return Number.isFinite(time) ? time : 0
}

function cleanBillName(description: string): string {
  const index = description.indexOf(':')
  return (index >= 0 ? description.slice(index + 1) : description) || description
}

function mapBill(bill: LiveBill): Bill {
  return {
    id: `live-${bill.orderId || bill.orderNo}`,
    deviceName: cleanBillName(bill.description) || '热水表',
    kind: 'water',
    amount: Number(bill.consumeMoney) || 0,
    duration: 0,
    createdAt: parseDate(bill.consumeDate) || Date.now(),
    orderNo: bill.orderNo || bill.orderId,
    source: 'live',
  }
}

function mapDevice(info: NonNullable<ReturnType<typeof parseDevice>>): Device {
  const isDryer =
    info.bigTypeId === '7' ||
    info.smallTypeName.includes('吹风') ||
    info.bigTypeName.includes('吹风')
  return {
    id: info.deviceId || info.snCode,
    kind: isDryer ? 'dryer' : 'water',
    name: info.deviceName,
    location: info.location || '校园热水',
    mac: info.macAddress || info.snCode,
    snCode: info.snCode,
    withhold: info.withholdMoney,
    projectId: info.projectId,
    online:
      info.onlineStatusId === null ? undefined : info.onlineStatusId === 1,
    bigTypeId: info.bigTypeId,
    smallTypeId: info.smallTypeId,
  }
}

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => {
      const expire = () => {
        set({
          mode: 'demo',
          loggedIn: false,
          auth: null,
          user: null,
          projects: [],
          currentProjectId: '',
          currentProjectName: '',
          schoolName: '',
          walletMoney: '0.000',
          balance: 0,
          lastDevice: null,
          activeOrder: null,
          bills: [],
          sessionError: '登录已失效，请重新登录',
        })
      }

      const rethrow = (error: unknown): never => {
        if (isAuthError(error)) {
          expire()
          throw new LiveApiError(8, '登录已失效，请重新登录')
        }
        throw error
      }

      const call = async <T>(fn: () => Promise<{ success: boolean; data: T }>): Promise<T> => {
        try {
          return ensureOk(await fn())
        } catch (error) {
          return rethrow(error)
        }
      }

      /**
       * 趣智校园的登录失效经常是 HTTP 200 + `success:false + errorCode:8`
       * （甚至只在 errorMessage 里写「请重新登录」）。所以 envelope 也要检查，
       * 不能只依赖 HTTP 401/403。
       */
      const checkAuthEnvelope = <T extends { success: boolean; errorCode?: number; errorMessage?: string }>(
        value: T,
      ): T => {
        if (value?.success === false) {
          const error = new LiveApiError(
            value.errorCode ?? 'business',
            value.errorMessage ?? '',
          )
          if (isAuthError(error)) {
            expire()
            throw new LiveApiError(8, '登录已失效，请重新登录')
          }
        }
        return value
      }

      const raw = async <T extends { success: boolean; errorCode?: number; errorMessage?: string }>(
        fn: () => Promise<T>,
      ): Promise<T> => {
        try {
          return checkAuthEnvelope(await fn())
        } catch (error) {
          return rethrow(error)
        }
      }

      const loadLiveContext = async (auth: LiveAuth) => {
        const projectEnv = await raw(() => getProjects(auth))
        const projects = projectEnv.success ? parseProjects(projectEnv.data) : []

        const infoEnv = await raw(() => getProjectInfo(auth))
        const school = infoEnv.success ? parseProjectName(infoEnv.data) : ''

        const accountEnv = await raw(() => getAccountInfo(auth))
        const name = accountEnv.success ? parseAccountName(accountEnv.data) : ''

        const walletEnv = await raw(() => getWallet(auth))
        const wallet = walletEnv.success
          ? parseWallet(walletEnv.data)
          : { money: '0.000', balance: 0 }

        const billEnv = await raw(() => getBills(auth, currentMonth()))
        const bills = billEnv.success ? parseBills(billEnv.data).map(mapBill) : []

        // 上次设备可能属于旧项目，切换/恢复后不能直接拿来开阀
        const previousDevice = get().lastDevice
        if (
          previousDevice?.projectId &&
          previousDevice.projectId !== auth.projectId
        ) {
          set({ lastDevice: null })
        }

        const currentName =
          projects.find((project) => project.projectId === auth.projectId)?.projectName ||
          get().currentProjectName ||
          school ||
          `项目 ${auth.projectId}`

        set({
          projects,
          currentProjectId: auth.projectId,
          currentProjectName: currentName,
          schoolName: school || currentName,
          user: {
            phone: maskPhone(auth.telephone),
            name: name || undefined,
            school: school || currentName,
          },
          walletMoney: wallet.money,
          balance: wallet.balance,
          bills,
        })
      }

      return {
        mode: 'demo',
        user: null,
        loggedIn: false,
        auth: null,
        projects: [],
        currentProjectId: '',
        currentProjectName: '',
        schoolName: '',
        walletMoney: '0.000',
        balance: 36.8,
        lastDevice: demoDevices[0] ?? null,
        activeOrder: null,
        bills: demoBills,
        settings: { theme: 'system', motionHints: true, flipToStop: false },
        loading: false,
        sessionChecked: false,
        sessionError: null,

        login: (phone) => get().loginDemo(phone),

        loginDemo: (phone) => {
          set({
            mode: 'demo',
            loggedIn: true,
            auth: null,
            user: {
              ...demoUser,
              phone: phone ? maskPhone(phone) : demoUser.phone,
            },
            balance: 36.8,
            walletMoney: '36.800',
            projects: [],
            currentProjectId: '',
            currentProjectName: '演示项目',
            schoolName: demoUser.school,
            lastDevice: demoDevices[0] ?? null,
            activeOrder: null,
            bills: demoBills,
            sessionError: null,
            sessionChecked: true,
          })
        },

        loginLive: async (input) => {
          set({ loading: true, sessionError: null })
          try {
            const phone = input.phone.replace(/\D/g, '')
            const envelope =
              input.mode === 'password'
                ? await loginWithPassword(
                    phone,
                    input.passwordHash ?? encryptPassword(input.password ?? ''),
                  )
                : await loginWithSms(phone, input.code ?? '')
            if (!envelope.success) {
              throw new LiveApiError(
                envelope.errorCode ?? 'login',
                envelope.errorMessage ?? '登录失败',
              )
            }
            const auth = parseLoginAuth(envelope.data, phone)
            if (!auth || !auth.accountId || !auth.projectId) {
              throw new LiveApiError('login', '登录成功但缺少账号/项目信息')
            }
            set({
              mode: 'live',
              loggedIn: true,
              auth,
              user: { phone: maskPhone(phone), school: '' },
              projects: [],
              currentProjectId: auth.projectId,
              currentProjectName: '',
              schoolName: '',
              walletMoney: '0.000',
              balance: 0,
              lastDevice: null,
              activeOrder: null,
              bills: [],
              sessionError: null,
            })
            await loadLiveContext(auth)
          } finally {
            set({ loading: false })
          }
        },

        sendCode: async (phone) => {
          const digits = phone.replace(/\D/g, '')
          if (digits.length !== 11) throw new LiveApiError('phone', '请输入 11 位手机号')
          await call(() => sendSmsCodeApi(digits, smsSecret(digits)))
        },

        restoreSession: async () => {
          const { mode, auth, activeOrder } = get()
          if (mode !== 'live' || !auth) {
            set({ sessionChecked: true })
            return
          }
          try {
            await loadLiveContext(auth)
            if (activeOrder) {
              const envelope = await raw(() => queryUsing(auth, activeOrder.device.snCode))
              const using = classifyUsing(envelope, auth.accountId)
              if (using.verdict === 'no-order' || using.ownership === 'other') {
                set({ activeOrder: null })
              } else if (
                using.verdict === 'has-order' &&
                using.ownership === 'own' &&
                using.orderNo
              ) {
                set({ activeOrder: { ...activeOrder, orderNo: using.orderNo } })
              }
            }
            set({ sessionChecked: true, sessionError: null })
          } catch (error) {
            if (isAuthError(error)) {
              expire()
              set({ sessionChecked: true })
            } else {
              set({
                sessionChecked: true,
                sessionError:
                  error instanceof Error ? error.message : '网络异常，数据可能不是最新',
              })
            }
          }
        },

        switchProject: async (project) => {
          const { auth, activeOrder } = get()
          if (!auth) throw new LiveApiError(8, '请先登录')
          if (activeOrder) throw new LiveApiError('busy', '请先结束用水再切换项目')
          const envelope = await raw(() => switchProjectApi(auth, project.projectId))
          if (!envelope.success) {
            throw new LiveApiError(
              envelope.errorCode ?? 'switch',
              envelope.errorMessage ?? '切换项目失败',
            )
          }
          const { auth: nextAuth, projectName } = parseSwitchAuth(
            envelope.data,
            auth,
            project.projectId,
          )
          set({
            auth: nextAuth,
            currentProjectId: nextAuth.projectId,
            currentProjectName: projectName || project.projectName,
            lastDevice: null,
            activeOrder: null,
            bills: [],
          })
          await loadLiveContext(nextAuth)
        },

        refreshProjects: async () => {
          const auth = get().auth
          if (!auth) throw new LiveApiError(8, '请先登录')
          const envelope = await raw(() => getProjects(auth))
          if (!envelope.success) {
            throw new LiveApiError(
              envelope.errorCode ?? 'projects',
              envelope.errorMessage ?? '项目列表加载失败',
            )
          }
          const projects = parseProjects(envelope.data)
          if (!projects.length) throw new LiveApiError('projects', '项目列表为空')
          set({ projects })
        },

        refreshWallet: async () => {
          const auth = get().auth
          if (!auth) return
          const wallet = await call(() => getWallet(auth))
          const parsed = parseWallet(wallet)
          set({ walletMoney: parsed.money, balance: parsed.balance })
        },

        refreshBills: async () => {
          const auth = get().auth
          if (!auth) return
          const envelope = await raw(() => getBills(auth, currentMonth()))
          if (envelope.success) {
            set({ bills: parseBills(envelope.data).map(mapBill) })
          }
        },

        lookupDevice: async (input) => {
          const auth = get().auth
          if (!auth) throw new LiveApiError(8, '请先登录')
          const value = input.trim()
          let address = ''
          if (value.toUpperCase().startsWith('KLCXKJ')) {
            const parsed = parseQr(value)
            if (!parsed) throw new LiveApiError('qr', '不是有效的趣智校园设备码')
            address = parsed.address
          } else {
            const mac = normalizeMac(value)
            if (!mac) throw new LiveApiError('mac', '请输入 12 位设备码')
            address = mac
          }

          for (const variant of macVariants(address)) {
            const envelope = await raw(() => getDeviceInfo(auth, variant))
            if (!envelope.success) {
              const error = new LiveApiError(
                envelope.errorCode ?? '',
                envelope.errorMessage ?? '',
              )
              if (isAuthError(error)) {
                expire()
                throw new LiveApiError(8, '登录已失效，请重新登录')
              }
              continue
            }
            const info = parseDevice(envelope.data)
            if (!info) continue
            if (info.isBle) throw new LiveApiError('ble', '这是蓝牙水表，暂不支持')
            const device = mapDevice(info)
            if (device.kind === 'dryer' && !DRYER_ENABLED) {
              throw new LiveApiError('dryer', '吹风机暂时不适配')
            }
            set({ lastDevice: device })
            return device
          }
          throw new LiveApiError('device', '没有查到设备：请确认当前项目、设备码是否正确')
        },

        startWater: async (device) => {
          const auth = get().auth
          if (!auth) throw new LiveApiError(8, '请先登录')
          if (device.kind === 'dryer') throw new LiveApiError('dryer', '吹风机暂时不适配')
          if (device.online === false) throw new LiveApiError('offline', '设备离线，暂时无法开阀')

          const existing = get().activeOrder
          if (existing && existing.device.snCode !== device.snCode) {
            throw new LiveApiError('busy', '已有进行中订单，请先结束当前用水')
          }

          const usingEnvelope = await raw(() => queryUsing(auth, device.snCode))
          const using = classifyUsing(usingEnvelope, auth.accountId)
          if (using.verdict === 'has-order') {
            if (using.ownership === 'own' && using.orderNo) {
              set({
                lastDevice: device,
                activeOrder: {
                  device,
                  orderNo: using.orderNo,
                  startedAt: Date.now(),
                  pricePerSecond: 0,
                  mode: 'live',
                  preDeduct:
                    using.preDeductMoney === null ? undefined : using.preDeductMoney / 1000,
                  projectId: auth.projectId,
                },
              })
              return
            }
            throw new LiveApiError(
              'occupied',
              using.ownership === 'other'
                ? '设备正在被他人使用'
                : '设备使用中，无法确认是否是你的订单',
            )
          }
          if (using.verdict === 'uncertain') {
            throw new LiveApiError('uncertain', '无法确认设备是否空闲，请稍后重试')
          }

          const startEnvelope = await raw(() => startWaterApi(auth, device.snCode))
          if (!startEnvelope.success) {
            throw new LiveApiError(
              startEnvelope.errorCode ?? 'start',
              startEnvelope.errorMessage ?? '开阀失败',
            )
          }

          let orderNo = ''
          let preDeduct: number | undefined
          for (let attempt = 0; attempt < 10; attempt += 1) {
            const result = await raw(() => queryDownRateResult(auth, device.snCode))
            const data = asRecord(result.data)
            const number = asString(data?.orderNo)
            if (number) {
              orderNo = number
              const pre = Number(data?.preDeductMoney)
              preDeduct = Number.isFinite(pre) ? pre / 1000 : undefined
              break
            }
            if (!result.success && Number(result.errorCode) !== 1) break
            if (attempt < 9) await sleep(800)
          }

          if (!orderNo) {
            const latest = await raw(() => queryUsing(auth, device.snCode))
            const state = classifyUsing(latest, auth.accountId)
            if (
              state.verdict === 'has-order' &&
              state.ownership === 'own' &&
              state.orderNo
            ) {
              orderNo = state.orderNo
              preDeduct =
                state.preDeductMoney === null ? undefined : state.preDeductMoney / 1000
            } else {
              throw new LiveApiError('start', '开阀结果未确认，请重新查询设备状态')
            }
          }

          set({
            lastDevice: device,
            activeOrder: {
              device,
              orderNo,
              startedAt: Date.now(),
              pricePerSecond: 0,
              mode: 'live',
              preDeduct,
              projectId: auth.projectId,
            },
          })
        },

        stopWater: async () => {
          const { auth, activeOrder } = get()
          if (!auth || !activeOrder) return null
          const { device, orderNo } = activeOrder

          const closeEnvelope = await raw(() => closeWater(auth, device.snCode, orderNo))
          if (!isCloseAccepted(closeEnvelope)) {
            throw new LiveApiError(
              closeEnvelope.errorCode ?? 'close',
              closeEnvelope.errorMessage ?? '关阀请求未被接受',
            )
          }

          let idle = false
          for (let attempt = 0; attempt < 15; attempt += 1) {
            const envelope = await raw(() => queryUsing(auth, device.snCode))
            const using = classifyUsing(envelope, auth.accountId)
            if (using.verdict === 'no-order') {
              idle = true
              break
            }
            if (!envelope.success && Number(envelope.errorCode) !== 307) break
            if (attempt < 14) await sleep(1000)
          }
          if (!idle) {
            throw new LiveApiError('closing', '关阀已受理，但服务端仍显示订单；请稍后再试')
          }

          const consumeEnvelope = await raw(() =>
            queryConsumeResult(auth, device.snCode, orderNo),
          )
          const amount = consumeEnvelope.success
            ? parseConsumeYuan(consumeEnvelope.data)
            : null

          const bill: Bill = {
            id: `live-${orderNo}`,
            deviceName: device.name,
            kind: 'water',
            amount: amount ?? 0,
            duration: Math.max(1, Math.floor((Date.now() - activeOrder.startedAt) / 1000)),
            createdAt: Date.now(),
            orderNo,
            source: 'live',
          }
          set({ activeOrder: null, bills: [bill, ...get().bills].slice(0, 50) })
          // 结算后刷新余额和账单；失败不影响已确认的关阀结果
          await Promise.allSettled([get().refreshWallet(), get().refreshBills()])
          return bill
        },

        refreshUsing: async () => {
          const { auth, lastDevice } = get()
          if (!auth || !lastDevice) return null
          const envelope = await raw(() => queryUsing(auth, lastDevice.snCode))
          const using = classifyUsing(envelope, auth.accountId)
          if (using.verdict === 'has-order' && using.ownership === 'own' && using.orderNo) {
            set({
              activeOrder: {
                device: lastDevice,
                orderNo: using.orderNo,
                startedAt: Date.now(),
                pricePerSecond: 0,
                mode: 'live',
                preDeduct:
                  using.preDeductMoney === null ? undefined : using.preDeductMoney / 1000,
                projectId: auth.projectId,
              },
            })
          }
          return using
        },

        logout: () => {
          clearCredentials()
          set({
            mode: 'demo',
            loggedIn: false,
            auth: null,
            user: null,
            projects: [],
            currentProjectId: '',
            currentProjectName: '',
            schoolName: '',
            walletMoney: '0.000',
            balance: 0,
            lastDevice: null,
            activeOrder: null,
            bills: [],
            sessionError: null,
            sessionChecked: true,
          })
        },

        setLastDevice: (device) => set({ lastDevice: device }),

        startOrder: (device) => {
          if (get().activeOrder) return
          set({ lastDevice: device, activeOrder: createDemoOrder(device) })
        },

        stopOrder: () => {
          const order = get().activeOrder
          if (!order || order.mode === 'live') return null

          const elapsed = Math.max(1, Math.floor((Date.now() - order.startedAt) / 1000))
          const device = order.device
          const amount =
            device.kind === 'dryer'
              ? device.fixedPrice ?? 3
              : Math.max(0.1, Math.round(elapsed * order.pricePerSecond * 100) / 100)

          const bill: Bill = {
            id: `bill-${Date.now()}`,
            deviceName: device.name,
            kind: device.kind,
            amount,
            duration: device.kind === 'dryer' ? device.fixedDuration ?? elapsed : elapsed,
            createdAt: Date.now(),
            orderNo: order.orderNo,
            source: 'demo',
          }

          set((state) => ({
            activeOrder: null,
            balance: Math.max(0, Math.round((state.balance - amount) * 100) / 100),
            bills: [bill, ...state.bills].slice(0, 30),
          }))

          return bill
        },

        setTheme: (theme) =>
          set((state) => ({ settings: { ...state.settings, theme } })),

        setSetting: (key, value) =>
          set((state) => ({ settings: { ...state.settings, [key]: value } })),
      }
    },
    {
      name: 'linyu-pwa-demo',
      version: 3,
      migrate: (persisted) => {
        const state = persisted as Partial<AppState>
        if (!DRYER_ENABLED) {
          state.bills = (state.bills ?? []).filter((bill) => bill.kind !== 'dryer')
          if (state.lastDevice?.kind === 'dryer') state.lastDevice = demoDevices[0] ?? null
          if (state.activeOrder?.device.kind === 'dryer') state.activeOrder = null
        }
        return state as AppState
      },
      partialize: (state) => ({
        mode: state.mode,
        user: state.user,
        loggedIn: state.loggedIn,
        auth: state.auth,
        projects: state.projects,
        currentProjectId: state.currentProjectId,
        currentProjectName: state.currentProjectName,
        schoolName: state.schoolName,
        walletMoney: state.walletMoney,
        balance: state.balance,
        lastDevice: state.lastDevice,
        activeOrder: state.activeOrder,
        bills: state.bills,
        settings: state.settings,
        sessionError: state.sessionError,
      }),
    },
  ),
)
