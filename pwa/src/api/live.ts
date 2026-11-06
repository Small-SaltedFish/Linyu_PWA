/**
 * 真实趣智校园 API（线上水表用）。
 *
 * 和 `spike.ts` 的区别：这里返回业务 envelope，不吞错误也不做报告脱敏；
 * 由 store 统一处理 auth 失效、项目切换和金额换算。
 */

export const LIVE_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'https://v3-api.china-qzxy.cn'

const CONFIG_KEYS =
  'module_list,advertise_type,question_list,service_phone_list,' +
  'banner_list_app,activity_list_app,aliCard_popup_config'

const VERSION = '6.5.28'

export interface LiveAuth {
  loginCode: string
  userId: string
  accountId: string
  projectId: string
  telephone: string
}

export interface LiveProject {
  projectId: string
  projectName: string
  projectDescript?: string
}

export interface LiveEnvelope<T = unknown> {
  success: boolean
  errorCode?: number
  errorMessage?: string
  msg?: string
  data: T
}

export class LiveApiError extends Error {
  code: number | string
  status: number | null

  constructor(code: number | string, message: string, status: number | null = null) {
    super(message)
    this.name = 'LiveApiError'
    this.code = code
    this.status = status
  }
}

export function isAuthError(error: unknown): boolean {
  if (!(error instanceof LiveApiError)) return false
  if (error.code === 8 || error.code === 401 || error.code === 403) return true
  return /登录|token|失效|过期|认证|未登录|请重新|账号.*(异常|冻结|禁用)/i.test(error.message)
}

function authQuery(auth: LiveAuth): Record<string, string> {
  return {
    loginCode: auth.loginCode,
    userId: auth.userId,
    accountId: auth.accountId,
    projectId: auth.projectId,
    telephone: auth.telephone,
    // 两个都要带：部分 GET 接口只认 telPhone
    telPhone: auth.telephone,
    phoneSystem: 'android',
    version: VERSION,
  }
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function asString(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function asNumber(value: unknown): number {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function positive(value: unknown): string {
  const text = asString(value)
  return text && text !== '0' ? text : ''
}

interface RequestOptions {
  method: 'GET' | 'POST'
  query?: Record<string, string>
  form?: Record<string, string>
}

async function request<T>(
  path: string,
  options: RequestOptions,
  auth?: LiveAuth,
): Promise<LiveEnvelope<T>> {
  const base = LIVE_BASE_URL.replace(/\/+$/, '')
  const query: Record<string, string> = { ...(options.query ?? {}) }
  if (auth && options.method === 'GET' && !path.startsWith('/user/verification')) {
    Object.assign(query, authQuery(auth))
  }
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, value)
  }
  const search = params.toString()
  const url = `${base}${path}${search ? `?${search}` : ''}`

  const form = options.method === 'POST' ? { ...(options.form ?? {}) } : null
  if (auth && form) Object.assign(form, authQuery(auth))

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (auth?.projectId && auth.projectId !== '0') {
    headers['Config-Project'] = auth.projectId
    headers['Config-Keys'] = CONFIG_KEYS
  }

  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 20000)
  let response: Response
  try {
    response = await fetch(url, {
      method: options.method,
      headers,
      body: form ? new URLSearchParams(form) : undefined,
      credentials: 'omit',
      signal: controller.signal,
    })
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    throw new LiveApiError(
      'network',
      message.includes('abort')
        ? '请求超时，请检查网络后重试'
        : `网络请求失败：${message}`,
      0,
    )
  } finally {
    window.clearTimeout(timer)
  }

  let text = ''
  try {
    text = await response.text()
  } catch {
    throw new LiveApiError('network', '读取服务器响应失败', response.status)
  }

  let payload: LiveEnvelope<T> | null = null
  try {
    payload = text ? (JSON.parse(text) as LiveEnvelope<T>) : null
  } catch {
    payload = null
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new LiveApiError(response.status, '登录已失效，请重新登录', response.status)
    }
    throw new LiveApiError(
      payload?.errorCode ?? response.status,
      payload?.errorMessage ?? payload?.msg ?? `HTTP ${response.status}`,
      response.status,
    )
  }
  if (!payload) {
    throw new LiveApiError('bad-response', '服务器返回了无法解析的内容', response.status)
  }
  return payload
}

export function ensureOk<T>(envelope: LiveEnvelope<T>): T {
  if (envelope.success === false) {
    throw new LiveApiError(
      envelope.errorCode ?? 'business',
      envelope.errorMessage ?? envelope.msg ?? '请求失败',
    )
  }
  return envelope.data
}

/* ───────────────────────── 登录 / 项目 ───────────────────────── */

export function loginWithPassword(telephone: string, passwordHash: string) {
  return request<unknown>('/user/login', {
    method: 'POST',
    form: {
      telephone,
      password: passwordHash,
      phoneSystem: 'android',
      type: '0',
      version: VERSION,
    },
  })
}

export function sendSmsCode(telephone: string, secret: string) {
  return request<unknown>('/user/verification/code/get', {
    method: 'GET',
    query: { telephone, typeId: '3', platform: '1', secret },
  })
}

export function sendPasswordResetCode(telephone: string, secret: string) {
  return request<unknown>('/user/verification/code/get', {
    method: 'GET',
    query: { telephone, typeId: '2', platform: '1', secret },
  })
}

/** 修改密码：两个密码都是 MD5 后 10 位大写 */
export function updatePassword(
  auth: LiveAuth,
  oldPasswordHash: string,
  passwordHash: string,
) {
  return request<unknown>(
    '/user/password/update',
    {
      method: 'POST',
      form: { oldPassword: oldPasswordHash, password: passwordHash },
    },
    auth,
  )
}

/** 短信验证重置/设置密码，不需要旧密码 */
export function resetPassword(auth: LiveAuth, passwordHash: string, code: string) {
  return request<unknown>(
    '/user/password/forget',
    { method: 'POST', form: { password: passwordHash, code } },
    auth,
  )
}

export function loginWithSms(telephone: string, smsCode: string) {
  return request<unknown>('/user/registerAndLogin', {
    method: 'POST',
    form: {
      telephone,
      smsCode,
      type: '5',
      phoneSystem: 'android',
      version: VERSION,
    },
  })
}

export function getProjects(auth: LiveAuth) {
  return request<unknown>('/project/group/list/v2', { method: 'GET' }, auth)
}

export function getProjectInfo(auth: LiveAuth) {
  return request<unknown>('/project/info/triple', { method: 'GET' }, auth)
}

export function switchProject(auth: LiveAuth, targetProjectId: string) {
  return request<unknown>(
    '/user/info',
    { method: 'GET', query: { projectId: targetProjectId } },
    { ...auth, projectId: targetProjectId },
  )
}

export function getAccountInfo(auth: LiveAuth) {
  return request<unknown>('/account/info', { method: 'GET' }, auth)
}

export function getWallet(auth: LiveAuth) {
  return request<unknown>('/account/wallet', { method: 'GET' }, auth)
}

/* ───────────────────────── 设备 / 订单 ───────────────────────── */

export function getDeviceInfo(auth: LiveAuth, mac: string) {
  return request<unknown>(
    '/device/info/mac',
    { method: 'GET', query: { macAddress: mac } },
    auth,
  )
}

export function queryUsing(auth: LiveAuth, snCode: string) {
  return request<unknown>(
    '/order/tcpDevice/query/rateOrder/using',
    { method: 'POST', form: { xfModel: '0', snCode } },
    auth,
  )
}

export function startWater(auth: LiveAuth, snCode: string) {
  return request<unknown>(
    '/order/tcpDevice/downRate/rateOrder',
    { method: 'POST', form: { xfModel: '0', snCode } },
    auth,
  )
}

export function queryDownRateResult(auth: LiveAuth, snCode: string) {
  return request<unknown>(
    '/order/tcpDevice/query/downRateResult',
    { method: 'POST', form: { snCode } },
    auth,
  )
}

export function closeWater(auth: LiveAuth, snCode: string, orderNo: string) {
  return request<unknown>(
    '/order/tcpDevice/closeOrder',
    { method: 'POST', form: { snCode, orderNo } },
    auth,
  )
}

export function queryConsumeResult(auth: LiveAuth, snCode: string, orderNo: string) {
  return request<unknown>(
    '/order/consumeOrder/result/query',
    { method: 'POST', form: { snCode, orderNo } },
    auth,
  )
}

export function getBills(auth: LiveAuth, month: string) {
  return request<unknown>(
    '/order/query/account/bill/list',
    { method: 'GET', query: { month, billRequestType: '2' } },
    auth,
  )
}

/* ───────────────────────── 解析 ───────────────────────── */

export function parseLoginAuth(data: unknown, fallbackPhone: string): LiveAuth | null {
  const record = asRecord(data)
  if (!record) return null
  const account = asRecord(record.userAccount) ?? {}
  const auth: LiveAuth = {
    loginCode: asString(record.loginCode),
    userId: asString(record.userId) || asString(account.userId),
    accountId: asString(account.accountId) || asString(record.accountId),
    projectId: asString(account.projectId) || asString(record.projectId),
    telephone: asString(record.telephone) || asString(account.telephone) || fallbackPhone,
  }
  return auth.loginCode ? auth : null
}

export function parseSwitchAuth(
  data: unknown,
  current: LiveAuth,
  targetProjectId: string,
): { auth: LiveAuth; projectName: string } {
  const record = asRecord(data) ?? {}
  const account = asRecord(record.userAccount) ?? {}
  return {
    auth: {
      loginCode:
        asString(record.loginCode) || asString(record.v3LoginCode) || current.loginCode,
      userId: positive(record.userId) || positive(account.userId) || current.userId,
      accountId:
        positive(account.accountId) || positive(record.accountId) || current.accountId,
      projectId:
        positive(account.projectId) || positive(record.projectId) || targetProjectId,
      telephone:
        asString(record.telephone) || asString(account.telephone) || current.telephone,
    },
    projectName: asString(account.projectName) || asString(record.projectName),
  }
}

export function parseProjects(data: unknown): LiveProject[] {
  const list = Array.isArray(data)
    ? data
    : Array.isArray(asRecord(data)?.list)
      ? (asRecord(data)?.list as unknown[])
      : []
  const projects: LiveProject[] = []
  for (const item of list) {
    const record = asRecord(item)
    if (!record) continue
    const projectId = positive(record.projectId)
    if (!projectId) continue
    projects.push({
      projectId,
      projectName: asString(record.projectName) || `项目 ${projectId}`,
      projectDescript: asString(record.projectDescript) || undefined,
    })
  }
  return projects
}

export function parseProjectName(data: unknown): string {
  return asString(asRecord(data)?.projectName)
}

export function parseAccountName(data: unknown): string {
  return asString(asRecord(data)?.name)
}

export interface LiveDevice {
  deviceId: string
  deviceName: string
  snCode: string
  macAddress: string
  location: string
  withholdMoney: number
  /** null = 服务端没返回，不能当成离线 */
  onlineStatusId: number | null
  bigTypeId: string
  smallTypeId: string
  bigTypeName: string
  smallTypeName: string
  isBle: boolean | undefined
  projectId: string
}

export function parseDevice(data: unknown): LiveDevice | null {
  const record = asRecord(data)
  if (!record) return null
  const snCode = asString(record.snCode)
  if (!snCode) return null
  const building = asString(record.buildingName)
  const floor = asString(record.floorName)
  const room = asString(record.roomName)
  const location = [building, floor, room].filter(Boolean).join(' · ')
  return {
    deviceId: asString(record.deviceId),
    deviceName: asString(record.deviceName) || asString(record.deviceDesc) || '热水表',
    snCode,
    macAddress: asString(record.macAddress),
    location,
    withholdMoney: asNumber(record.withholdMoney),
    onlineStatusId:
      record.onlineStatusId === undefined || record.onlineStatusId === null
        ? null
        : asNumber(record.onlineStatusId),
    bigTypeId: asString(record.bigTypeId),
    smallTypeId: asString(record.smallTypeId),
    bigTypeName: asString(record.bigTypeName),
    smallTypeName: asString(record.smallTypeName),
    isBle: typeof record.isBle === 'boolean' ? record.isBle : undefined,
    projectId: asString(record.projectId),
  }
}

export type UsingVerdict = 'has-order' | 'no-order' | 'uncertain'
export type Ownership = 'own' | 'other' | 'unknown'

export interface LiveUsing {
  verdict: UsingVerdict
  orderNo: string
  ownership: Ownership
  preDeductMoney: number | null
  detail: string
}

export function classifyUsing(
  envelope: LiveEnvelope<unknown>,
  accountId?: string,
): LiveUsing {
  const data = asRecord(envelope.data)
  const orderNo = asString(data?.orderNo)
  const ownership: Ownership =
    typeof data?.isOwner === 'boolean'
      ? data.isOwner
        ? 'own'
        : 'other'
      : data?.accountId !== undefined && accountId
        ? asString(data.accountId) === accountId
          ? 'own'
          : 'other'
        : 'unknown'
  const preDeductMoney =
    data?.preDeductMoney === undefined || data?.preDeductMoney === null
      ? null
      : asNumber(data.preDeductMoney)
  const code = Number(envelope.errorCode)

  if (code === 307 || orderNo) {
    return {
      verdict: 'has-order',
      orderNo,
      ownership,
      preDeductMoney,
      detail: orderNo ? `有进行中订单 ${orderNo}` : '设备使用中，但没有返回订单号',
    }
  }
  if (envelope.success === true) {
    return {
      verdict: 'no-order',
      orderNo: '',
      ownership,
      preDeductMoney,
      detail: '没有进行中订单',
    }
  }
  return {
    verdict: 'uncertain',
    orderNo: '',
    ownership,
    preDeductMoney,
    detail: envelope.errorMessage ?? envelope.msg ?? '查询订单失败',
  }
}

export function isCloseAccepted(envelope: LiveEnvelope<unknown>): boolean {
  if (envelope.success === true) return true
  if (Number(envelope.errorCode) === 307) return true
  return saidAlreadyClosing(envelope.errorMessage ?? envelope.msg ?? '')
}

function saidAlreadyClosing(message: string): boolean {
  return message.includes('已在') || message.includes('关闭中')
}

export function parseConsumeYuan(data: unknown): number | null {
  const record = asRecord(data)
  if (!record) return null
  if (record.consumeMoney === undefined || record.consumeMoney === null) return null
  const value = Number(record.consumeMoney)
  return Number.isFinite(value) ? value / 1000 : null
}

export function parseWallet(data: unknown): { money: string; balance: number } {
  const record = asRecord(data) ?? {}
  const money = asString(record.money) || asString(record.accountRealMoneyStr) || '0.000'
  const balance = Number(money)
  return { money, balance: Number.isFinite(balance) ? balance : 0 }
}

export interface LiveBill {
  orderId: string
  orderNo: string
  consumeDate: string
  consumeMoney: string
  description: string
}

export function parseBills(data: unknown): LiveBill[] {
  const list = Array.isArray(data)
    ? data
    : Array.isArray(asRecord(data)?.list)
      ? (asRecord(data)?.list as unknown[])
      : []
  const bills: LiveBill[] = []
  for (const item of list) {
    const wrapper = asRecord(item)
    if (!wrapper) continue
    const dto = asRecord(wrapper.consumeBillDTO) ?? wrapper
    bills.push({
      orderId: asString(dto.orderId),
      orderNo: asString(dto.orderNo),
      consumeDate: asString(dto.consumeDate) || asString(dto.dealDate),
      consumeMoney: asString(dto.consumeMoney),
      description: asString(dto.description),
    })
  }
  return bills
}
