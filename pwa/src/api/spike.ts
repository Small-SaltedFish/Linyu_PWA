import { encryptPassword, smsSecret } from '../lib/md5'

/**
 * M0 真机联调用的真实 API 客户端。
 *
 * 与 `client.ts`（页面骨架）分开，原因：
 * - GET 必须把认证参数放进 query（含 `telPhone`），POST 放进 form；
 * - 每个请求都要带 `Config-Project` / `Config-Keys`；
 * - 切项目时 `Config-Project` 与认证参数都要用**目标项目**；
 * - 联调需要保留原始响应、耗时、HTTP 状态，便于写 M0 报告。
 *
 * 这里所有返回值都经过脱敏（loginCode / 手机号 / 密码 / secret），
 * 可以直接展示或导出，不会把凭据写进报告。
 */

export const DEFAULT_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'https://v3-api.china-qzxy.cn'

const CONFIG_KEYS =
  'module_list,advertise_type,question_list,service_phone_list,' +
  'banner_list_app,activity_list_app,aliCard_popup_config'

const VERSION = '6.5.28'

export interface SpikeAuth {
  loginCode: string
  userId: string
  accountId: string
  projectId: string
  telephone: string
}

export interface SpikeProject {
  projectId: string
  projectName: string
  projectDescript?: string
  groupId?: number
}

export interface SpikeEnvelope {
  success?: boolean
  errorCode?: number | string
  errorMessage?: string
  msg?: string
  data?: unknown
}

export interface SpikeCall {
  id: string
  key: string
  label: string
  method: 'GET' | 'POST'
  url: string
  form: Record<string, string> | null
  httpStatus: number | null
  durationMs: number
  ok: boolean
  /** 原始响应（含 loginCode 等），只给内部解析用，**不要渲染/导出**。 */
  envelope: SpikeEnvelope | null
  /** 脱敏后的响应，页面展示与报告导出只用这个。 */
  safe: SpikeEnvelope | null
  /** 脱敏后的原始文本（非 JSON 时兜底展示）。 */
  safeText: string
  error: string | null
  at: number
}

export type UsingVerdict = 'has-order' | 'no-order' | 'uncertain'

/** 进行中订单的归属：自己的 / 别人的 / 服务端没给判断依据 */
export type Ownership = 'own' | 'other' | 'unknown'

export interface UsingResult {
  verdict: UsingVerdict
  orderNo: string
  /** 兼容字段：等价于 ownership === 'own' */
  owned: boolean
  ownership: Ownership
  detail: string
  preDeductMoney: unknown
}

/* ────────────────────────── 脱敏 ────────────────────────── */

export function maskPhone(telephone: string): string {
  const digits = telephone.replace(/\D/g, '')
  if (digits.length < 7) return '***'
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`
}

export function maskToken(token: string): string {
  if (!token) return ''
  return `***${token.slice(-4)}`
}

const SECRET_KEYS = new Set([
  'loginCode',
  'v3LoginCode',
  'telephone',
  'telPhone',
  'phone',
  'password',
  'secret',
  'smsCode',
  'token',
])

export function redactText(text: string, telephone?: string): string {
  let out = text
  if (telephone) {
    const digits = telephone.replace(/\D/g, '')
    if (digits.length >= 7) out = out.split(digits).join(maskPhone(digits))
  }
  return out
}

export function redactValue(value: unknown, telephone?: string): unknown {
  if (Array.isArray(value)) return value.map((item) => redactValue(item, telephone))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEYS.has(key)) {
        if (key === 'telephone' || key === 'telPhone' || key === 'phone') {
          out[key] = typeof item === 'string' ? maskPhone(item) : '***'
        } else {
          out[key] = typeof item === 'string' ? maskToken(item) : '***'
        }
        continue
      }
      out[key] = redactValue(item, telephone)
    }
    return out
  }
  if (typeof value === 'string' && telephone) return redactText(value, telephone)
  return value
}

export function redactForm(form: Record<string, string> | null): Record<string, string> | null {
  if (!form) return null
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(form)) {
    if (SECRET_KEYS.has(key)) {
      out[key] =
        key === 'telephone' || key === 'telPhone' || key === 'phone'
          ? maskPhone(value)
          : key === 'loginCode'
            ? maskToken(value)
            : '***'
    } else if (key === 'password' || key === 'secret' || key === 'smsCode') {
      out[key] = '***'
    } else {
      out[key] = value
    }
  }
  return out
}

/* ────────────────────────── 请求层 ────────────────────────── */

let callSeq = 0

function authQuery(auth: SpikeAuth): Record<string, string> {
  return {
    loginCode: auth.loginCode,
    userId: auth.userId,
    accountId: auth.accountId,
    projectId: auth.projectId,
    telephone: auth.telephone,
    // 两个都要传：/settlement/campus/userInfo 只认 telPhone，少了会 HTTP 200 +「手机号不能为空」
    telPhone: auth.telephone,
    phoneSystem: 'android',
    version: VERSION,
  }
}

function authForm(auth: SpikeAuth): Record<string, string> {
  return authQuery(auth)
}

function displayUrl(url: string): string {
  return url.replace(
    /(loginCode=)[^&]+|(telephone=)[^&]+|(telPhone=)[^&]+|(secret=)[^&]+|(smsCode=)[^&]+/g,
    (match) => `${match.split('=')[0]}=***`,
  )
}

interface RequestSpec {
  key: string
  label: string
  method: 'GET' | 'POST'
  path: string
  query?: Record<string, string>
  form?: Record<string, string>
}

async function request(
  baseUrl: string,
  spec: RequestSpec,
  auth?: SpikeAuth,
): Promise<SpikeCall> {
  const base = baseUrl.replace(/\/+$/, '')
  const query: Record<string, string> = { ...(spec.query ?? {}) }
  if (auth && spec.method === 'GET' && !spec.path.startsWith('/user/verification')) {
    Object.assign(query, authQuery(auth))
  }

  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, value)
  }
  const search = params.toString()
  const url = `${base}${spec.path}${search ? `?${search}` : ''}`

  const form = spec.method === 'POST' ? { ...(spec.form ?? {}) } : null
  if (auth && form) Object.assign(form, authForm(auth))

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (auth?.projectId && auth.projectId !== '0') {
    headers['Config-Project'] = auth.projectId
    headers['Config-Keys'] = CONFIG_KEYS
  }

  const startedAt = Date.now()
  const id = `call-${startedAt}-${(callSeq += 1)}`
  let httpStatus: number | null = null
  let text = ''
  let envelope: SpikeEnvelope | null = null
  let error: string | null = null
  let ok = false

  try {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 20000)
    const response = await fetch(url, {
      method: spec.method,
      headers,
      body: form ? new URLSearchParams(form) : undefined,
      credentials: 'omit',
      signal: controller.signal,
    })
    window.clearTimeout(timer)
    httpStatus = response.status
    text = await response.text()

    try {
      envelope = text ? (JSON.parse(text) as SpikeEnvelope) : null
    } catch {
      envelope = null
    }

    const errorCode = Number(envelope?.errorCode ?? 0)
    // errorCode != 0 也算「这次调用没有成功」。
    // 典型：downRateResult 第一轮返回 success:true + errorCode:1「网络通讯慢」，
    // 它是“还没好，继续轮询”的中间态，不应在报告里显示成成功。
    ok = response.ok && envelope !== null && envelope.success !== false && errorCode === 0
    if (!response.ok && !envelope) {
      error = `HTTP ${response.status}：返回的不是 JSON（可能被 WAF/网关拦截）`
    } else if (!envelope) {
      error = '响应不是合法 JSON'
    } else if (envelope.success === false) {
      error = `${envelope.errorMessage ?? envelope.msg ?? '请求失败'}${
        envelope.errorCode !== undefined ? `（errorCode ${envelope.errorCode}）` : ''
      }`
    } else if (errorCode !== 0) {
      error = `${envelope.errorMessage ?? envelope.msg ?? '业务未成功'}（errorCode ${envelope.errorCode}）`
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    error = message.includes('abort')
      ? '请求超时（20 秒）'
      : `请求未完成：${message}（常见原因：CORS、WAF、证书、断网）`
  }

  return {
    id,
    key: spec.key,
    label: spec.label,
    method: spec.method,
    url: displayUrl(url),
    form: redactForm(form),
    httpStatus,
    durationMs: Date.now() - startedAt,
    ok,
    envelope,
    safe: envelope ? (redactValue(envelope, auth?.telephone) as SpikeEnvelope) : null,
    safeText: redactText(text, auth?.telephone).slice(0, 4000),
    error,
    at: startedAt,
  }
}

/* ────────────────────────── 登录 ────────────────────────── */

export function loginWithPassword(baseUrl: string, telephone: string, password: string) {
  return request(baseUrl, {
    key: 'login',
    label: '密码登录',
    method: 'POST',
    path: '/user/login',
    form: {
      telephone: telephone.replace(/\D/g, ''),
      password: encryptPassword(password),
      phoneSystem: 'android',
      type: '0',
      version: VERSION,
    },
  })
}

export function sendSmsCode(baseUrl: string, telephone: string) {
  const phone = telephone.replace(/\D/g, '')
  return request(baseUrl, {
    key: 'sms-send',
    label: '发送短信验证码',
    method: 'GET',
    path: '/user/verification/code/get',
    query: {
      telephone: phone,
      typeId: '3',
      platform: '1',
      secret: smsSecret(phone),
    },
  })
}

export function loginWithSmsCode(baseUrl: string, telephone: string, smsCode: string) {
  return request(baseUrl, {
    key: 'login',
    label: '验证码登录',
    method: 'POST',
    path: '/user/registerAndLogin',
    form: {
      telephone: telephone.replace(/\D/g, ''),
      smsCode,
      type: '5',
      phoneSystem: 'android',
      version: VERSION,
    },
  })
}

/* ────────────────────────── 项目 ────────────────────────── */

export function getProjectList(baseUrl: string, auth: SpikeAuth) {
  return request(baseUrl, { key: 'projects', label: '项目列表', method: 'GET', path: '/project/group/list/v2' }, auth)
}

export function getProjectInfo(baseUrl: string, auth: SpikeAuth) {
  return request(baseUrl, { key: 'project-info', label: '学校/项目信息', method: 'GET', path: '/project/info/triple' }, auth)
}

export function switchProject(baseUrl: string, auth: SpikeAuth, targetProjectId: string) {
  return request(
    baseUrl,
    {
      key: 'switch',
      label: '切换项目',
      method: 'GET',
      path: '/user/info',
      query: { projectId: targetProjectId },
    },
    // 关键：请求头与认证参数都换成目标项目
    { ...auth, projectId: targetProjectId },
  )
}

export function getAccountInfo(baseUrl: string, auth: SpikeAuth) {
  return request(baseUrl, { key: 'account', label: '账号信息', method: 'GET', path: '/account/info' }, auth)
}

/* ────────────────────────── 余额 / 账单 ────────────────────────── */

export function getWallet(baseUrl: string, auth: SpikeAuth) {
  return request(baseUrl, { key: 'wallet', label: '钱包余额', method: 'GET', path: '/account/wallet' }, auth)
}

export function getBills(baseUrl: string, auth: SpikeAuth, month: string) {
  return request(
    baseUrl,
    {
      key: 'bills',
      label: `账单列表 ${month}`,
      method: 'GET',
      path: '/order/query/account/bill/list',
      query: { month, billRequestType: '2' },
    },
    auth,
  )
}

/* ────────────────────────── 设备模式（只读探测） ────────────────────────── */

export interface SpikeMode {
  typeId: string
  typeName: string
  money: string
  moneyYuan: string
  times: string
  timesMinute: string
  positionId: string
}

export function getModeList(baseUrl: string, auth: SpikeAuth, smallTypeId: string) {
  return request(
    baseUrl,
    {
      key: 'modes',
      label: `模式/套餐列表 smallTypeId=${smallTypeId}`,
      method: 'GET',
      path: '/device/mode/list',
      query: { smallTypeId },
    },
    auth,
  )
}

export function extractModes(call: SpikeCall): SpikeMode[] {
  const data = call.envelope?.data
  const rawList = Array.isArray(data)
    ? data
    : Array.isArray(asRecord(data)?.list)
      ? (asRecord(data)?.list as unknown[])
      : []
  const modes: SpikeMode[] = []
  for (const item of rawList) {
    const record = asRecord(item)
    if (!record) continue
    modes.push({
      typeId: asString(record.typeId),
      typeName: asString(record.typeName),
      money: asString(record.money),
      moneyYuan: asString(record.modeMoneyYuan),
      times: asString(record.times),
      timesMinute: asString(record.modeTimeMinute),
      positionId: asString(record.positionId),
    })
  }
  return modes
}

/* ────────────────────────── 设备 / 订单 ────────────────────────── */

export function getDeviceInfo(baseUrl: string, auth: SpikeAuth, mac: string) {
  return request(
    baseUrl,
    { key: 'device', label: `设备查询 ${mac}`, method: 'GET', path: '/device/info/mac', query: { macAddress: mac } },
    auth,
  )
}

export function queryUsing(baseUrl: string, auth: SpikeAuth, snCode: string) {
  return request(
    baseUrl,
    {
      key: 'using',
      label: '查询进行中订单',
      method: 'POST',
      path: '/order/tcpDevice/query/rateOrder/using',
      form: { xfModel: '0', snCode },
    },
    auth,
  )
}

export function startWater(baseUrl: string, auth: SpikeAuth, snCode: string) {
  return request(
    baseUrl,
    {
      key: 'start',
      label: '开阀 downRate',
      method: 'POST',
      path: '/order/tcpDevice/downRate/rateOrder',
      form: { xfModel: '0', snCode },
    },
    auth,
  )
}

export function queryDownRateResult(baseUrl: string, auth: SpikeAuth, snCode: string) {
  return request(
    baseUrl,
    {
      key: 'start-result',
      label: '开阀确认 downRateResult',
      method: 'POST',
      path: '/order/tcpDevice/query/downRateResult',
      form: { snCode },
    },
    auth,
  )
}

export function closeWater(baseUrl: string, auth: SpikeAuth, snCode: string, orderNo: string) {
  return request(
    baseUrl,
    {
      key: 'close',
      label: '关阀 closeOrder',
      method: 'POST',
      path: '/order/tcpDevice/closeOrder',
      form: { snCode, orderNo },
    },
    auth,
  )
}

export function queryCloseResult(baseUrl: string, auth: SpikeAuth, snCode: string, orderNo: string) {
  return request(
    baseUrl,
    {
      key: 'close-result',
      label: '关阀结果（不可信）',
      method: 'POST',
      path: '/order/tcpDevice/closeOrder/result/query',
      form: { snCode, orderNo },
    },
    auth,
  )
}

export function queryConsumeResult(baseUrl: string, auth: SpikeAuth, snCode: string, orderNo: string) {
  return request(
    baseUrl,
    {
      key: 'consume',
      label: '结算 consumeOrderResult',
      method: 'POST',
      path: '/order/consumeOrder/result/query',
      form: { snCode, orderNo },
    },
    auth,
  )
}

/* ────────────────────────── 解析 ────────────────────────── */

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

function positive(value: unknown): string {
  const text = asString(value)
  return text && text !== '0' ? text : ''
}

export function extractLoginAuth(call: SpikeCall, fallbackPhone: string): SpikeAuth | null {
  const data = asRecord(call.envelope?.data)
  if (!data) return null
  const account = asRecord(data.userAccount) ?? {}
  const auth: SpikeAuth = {
    loginCode: asString(data.loginCode),
    userId: asString(data.userId) || asString(account.userId),
    accountId: asString(account.accountId) || asString(data.accountId),
    projectId: asString(account.projectId) || asString(data.projectId),
    telephone: asString(data.telephone) || asString(account.telephone) || fallbackPhone,
  }
  return auth.loginCode ? auth : null
}

export function extractSwitchAuth(
  call: SpikeCall,
  current: SpikeAuth,
  target: SpikeProject,
): { auth: SpikeAuth; projectName: string } {
  const data = asRecord(call.envelope?.data) ?? {}
  const account = asRecord(data.userAccount) ?? {}
  return {
    auth: {
      loginCode: asString(data.loginCode) || asString(data.v3LoginCode) || current.loginCode,
      userId: positive(data.userId) || positive(account.userId) || current.userId,
      accountId: positive(account.accountId) || positive(data.accountId) || current.accountId,
      projectId:
        positive(account.projectId) || positive(data.projectId) || target.projectId,
      telephone:
        asString(data.telephone) || asString(account.telephone) || current.telephone,
    },
    projectName:
      asString(account.projectName) || asString(data.projectName) || target.projectName,
  }
}

export function extractProjects(call: SpikeCall): SpikeProject[] {
  const data = call.envelope?.data
  const rawList = Array.isArray(data)
    ? data
    : Array.isArray(asRecord(data)?.list)
      ? (asRecord(data)?.list as unknown[])
      : []
  const projects: SpikeProject[] = []
  for (const item of rawList) {
    const record = asRecord(item)
    if (!record) continue
    const projectId = positive(record.projectId)
    if (!projectId) continue
    projects.push({
      projectId,
      projectName: asString(record.projectName) || `项目 ${projectId}`,
      projectDescript: asString(record.projectDescript) || undefined,
      groupId: typeof record.groupId === 'number' ? record.groupId : undefined,
    })
  }
  return projects
}

export interface SpikeBill {
  orderId: string
  orderNo: string
  consumeDate: string
  consumeMoney: string
  description: string
}

/** 账单列表 `data` 是数组，每项套一层 `consumeBillDTO`；兼容直接平铺/`list` 包裹。 */
export function extractBills(call: SpikeCall): SpikeBill[] {
  const data = call.envelope?.data
  const rawList = Array.isArray(data)
    ? data
    : Array.isArray(asRecord(data)?.list)
      ? (asRecord(data)?.list as unknown[])
      : Array.isArray(asRecord(data)?.records)
        ? (asRecord(data)?.records as unknown[])
        : []
  const bills: SpikeBill[] = []
  for (const item of rawList) {
    const wrapper = asRecord(item)
    if (!wrapper) continue
    const dto = asRecord(wrapper.consumeBillDTO) ?? wrapper
    bills.push({
      orderId: asString(dto.orderId),
      orderNo: asString(dto.orderNo),
      consumeDate: asString(dto.consumeDate),
      consumeMoney: asString(dto.consumeMoney),
      description: asString(dto.description),
    })
  }
  return bills
}

export function extractWalletMoney(call: SpikeCall): string {
  const data = asRecord(call.envelope?.data)
  return data ? asString(data.money) : ''
}

export function extractConsumeLi(call: SpikeCall): number | null {
  const data = asRecord(call.envelope?.data)
  if (!data) return null
  const value = Number(data.consumeMoney)
  return Number.isFinite(value) ? value : null
}

/** 0.04 元 → 40 厘；显示时 /1000。 */
export function liToYuan(li: number): number {
  return li / 1000
}

function resolveOwnership(
  data: Record<string, unknown> | null,
  accountId?: string,
): Ownership {
  // ① isOwner 是服务端给的权威判据
  if (typeof data?.isOwner === 'boolean') return data.isOwner ? 'own' : 'other'
  // ② 退一步：307 的 data 里可能带 accountId，和当前登录的 accountId 对比
  const orderAccountId = asString(data?.accountId)
  if (orderAccountId && accountId) {
    return orderAccountId === accountId ? 'own' : 'other'
  }
  // ③ 两个都没有：不猜，按「未知」处理，禁止任何写操作
  return 'unknown'
}

export function classifyUsing(call: SpikeCall, accountId?: string): UsingResult {
  const base: UsingResult = {
    verdict: 'uncertain',
    orderNo: '',
    owned: false,
    ownership: 'unknown',
    detail: '',
    preDeductMoney: undefined,
  }

  // ⚠️ 先看 HTTP 是否发出去了，**不能先看 call.error**：
  // `queryUsing` 在「设备使用中」时返回 `success:false, errorCode:307`，
  // request() 会把它记成 error，但那是一个**有效的业务状态**，不是查询失败。
  if (call.httpStatus === null) {
    return { ...base, detail: call.error ?? '请求没有发出去，不能当成「没有订单」' }
  }

  const envelope = call.envelope
  const data = asRecord(envelope?.data)
  const orderNo = asString(data?.orderNo)
  const ownership = resolveOwnership(data, accountId)
  const owned = ownership === 'own'
  const preDeductMoney = data?.preDeductMoney
  const code = Number(envelope?.errorCode)

  // 307 或返回了 orderNo，都是「有订单」；307 时 data 里可能带 orderNo/isOwner
  if (code === 307 || orderNo) {
    const lead = code === 307 ? '服务端 307：设备使用中' : '有进行中订单'
    const ownerText =
      ownership === 'own'
        ? '（你自己的，还没结束）'
        : ownership === 'other'
          ? '（别人的，不要动）'
          : '（归属未知：isOwner 未返回，accountId 也没有可对比的值）'
    return {
      verdict: 'has-order',
      orderNo,
      owned,
      ownership,
      preDeductMoney,
      detail: orderNo
        ? `${lead}，订单 ${orderNo}${ownerText}`
        : `${lead}，但没有返回订单号${ownerText}`,
    }
  }

  if (envelope?.success === true) {
    return {
      verdict: 'no-order',
      orderNo: '',
      owned,
      ownership,
      preDeductMoney,
      detail: '服务端明确返回：没有进行中订单',
    }
  }

  // 走到这里才是真正的「不确定」：HTTP 200 但业务失败，且不是 307
  return {
    ...base,
    ownership,
    preDeductMoney,
    detail: call.error ?? envelope?.errorMessage ?? '请求失败，不能当成「没有订单」',
  }
}

export function isCloseAccepted(call: SpikeCall): boolean {
  if (call.envelope?.success === true) return true
  if (Number(call.envelope?.errorCode) === 307) return true
  const message = `${call.envelope?.errorMessage ?? ''}${call.envelope?.msg ?? ''}`
  return message.includes('已在')
}

export function extractDeviceSummary(call: SpikeCall): Record<string, string> {
  const data = asRecord(call.envelope?.data)
  if (!data) return {}
  const keys = [
    'deviceId',
    'deviceName',
    'snCode',
    'macAddress',
    'realMac',
    'withholdMoney',
    'onlineStatusId',
    'bigTypeId',
    'bigTypeName',
    'smallTypeId',
    'smallTypeName',
    'isBle',
    'communicationTypeId',
    'deductionMethod',
    'chargeMode',
    'isNewDryer',
    'modeId',
    'modeTime',
    'isUse',
    'ownStatusId',
  ]
  const out: Record<string, string> = {}
  for (const key of keys) {
    const value = data[key]
    if (value !== undefined && value !== null && value !== '') out[key] = asString(value)
  }
  return out
}
