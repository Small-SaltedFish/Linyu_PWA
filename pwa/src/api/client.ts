/**
 * 趣智校园 API 的最小客户端骨架。
 *
 * 当前 UI 默认走 demo store；接真实接口时，把页面里的 demo action 换成这些函数，
 * 并补上 auth / 错误码 / 三态关阀确认。
 */
export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'https://v3-api.china-qzxy.cn'
export const DEMO_MODE = (import.meta.env.VITE_DEMO_MODE ?? 'true') !== 'false'

const CONFIG_KEYS =
  'module_list,advertise_type,question_list,service_phone_list,' +
  'banner_list_app,activity_list_app,aliCard_popup_config'

export interface AuthContext {
  loginCode: string
  userId: string
  accountId: string
  projectId: string
  telephone: string
}

export interface ApiEnvelope<T> {
  success: boolean
  errorCode?: number
  errorMessage?: string
  data: T
}

export class ApiError extends Error {
  code: number | string

  constructor(code: number | string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

export function authFields(auth: AuthContext): Record<string, string> {
  return {
    loginCode: auth.loginCode,
    userId: auth.userId,
    accountId: auth.accountId,
    projectId: auth.projectId,
    telephone: auth.telephone,
    telPhone: auth.telephone,
    phoneSystem: 'android',
    version: '6.5.28',
  }
}

async function request<T>(
  path: string,
  init: RequestInit,
  auth?: AuthContext,
): Promise<T> {
  const headers = new Headers(init.headers)
  if (auth?.projectId) {
    headers.set('Config-Project', auth.projectId)
    headers.set('Config-Keys', CONFIG_KEYS)
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: 'omit',
  })

  let payload: ApiEnvelope<T>
  try {
    payload = (await response.json()) as ApiEnvelope<T>
  } catch {
    throw new ApiError(response.status, '服务器返回了无法解析的内容')
  }

  if (!response.ok) throw new ApiError(response.status, payload.errorMessage ?? '请求失败')
  if (payload.success === false) {
    throw new ApiError(payload.errorCode ?? 'unknown', payload.errorMessage ?? '请求失败')
  }
  return payload.data
}

export async function login(telephone: string, password: string): Promise<unknown> {
  const body = new URLSearchParams({
    telephone,
    password,
    phoneSystem: 'android',
    type: '0',
    version: '6.5.28',
  })
  return request('/user/login', { method: 'POST', body })
}

export async function getDeviceInfo(
  mac: string,
  auth: AuthContext,
): Promise<Record<string, unknown>> {
  return request(
    `/device/info/mac?macAddress=${encodeURIComponent(mac)}`,
    { method: 'GET' },
    auth,
  )
}

export async function startWater(snCode: string, auth: AuthContext): Promise<unknown> {
  const body = new URLSearchParams({ xfModel: '0', snCode, ...authFields(auth) })
  return request('/order/tcpDevice/downRate/rateOrder', { method: 'POST', body }, auth)
}

export async function queryUsing(snCode: string, auth: AuthContext): Promise<unknown> {
  const body = new URLSearchParams({ xfModel: '0', snCode, ...authFields(auth) })
  return request('/order/tcpDevice/query/rateOrder/using', { method: 'POST', body }, auth)
}

export async function closeWater(
  snCode: string,
  orderNo: string,
  auth: AuthContext,
): Promise<unknown> {
  const body = new URLSearchParams({ snCode, orderNo, ...authFields(auth) })
  return request('/order/tcpDevice/closeOrder', { method: 'POST', body }, auth)
}

export async function getWallet(auth: AuthContext): Promise<unknown> {
  return request('/account/wallet', { method: 'GET' }, auth)
}

export async function getBills(auth: AuthContext, month: string): Promise<unknown> {
  return request(
    `/order/query/account/bill/list?month=${encodeURIComponent(month)}&billRequestType=2`,
    { method: 'GET' },
    auth,
  )
}

export async function consumeResult(
  snCode: string,
  orderNo: string,
  auth: AuthContext,
): Promise<unknown> {
  const body = new URLSearchParams({ snCode, orderNo, ...authFields(auth) })
  return request('/order/consumeOrder/result/query', { method: 'POST', body }, auth)
}
