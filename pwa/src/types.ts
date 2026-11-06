export type DeviceKind = 'water' | 'dryer'

export type ThemeMode = 'light' | 'dark' | 'system'

export interface User {
  /** 服务端可能不返回姓名，界面回退到手机号 */
  name?: string
  phone: string
  school: string
}

export interface Device {
  id: string
  kind: DeviceKind
  name: string
  location: string
  mac: string
  snCode: string
  withhold: number
  /** 设备所属项目（真实 API） */
  projectId?: string
  /** 服务端 onlineStatusId === 1 */
  online?: boolean
  bigTypeId?: string
  smallTypeId?: string
  /** 演示用：吹风机固定价格 */
  fixedPrice?: number
  /** 演示用：吹风机固定时长（秒） */
  fixedDuration?: number
}

export interface Bill {
  id: string
  deviceName: string
  kind: DeviceKind
  amount: number
  duration: number
  createdAt: number
  orderNo: string
  source?: 'demo' | 'live'
}

export interface ActiveOrder {
  device: Device
  orderNo: string
  startedAt: number
  /** 演示用：水表按秒计价；吹风机为 0 */
  pricePerSecond: number
  mode?: 'demo' | 'live'
  /** 真实 API：预扣金额（元） */
  preDeduct?: number
  projectId?: string
}

export interface Settings {
  theme: ThemeMode
  motionHints: boolean
  analytics: boolean
  /** 翻转停水：默认开启；旧持久化数据没有这个字段按开启处理 */
  flipToStop?: boolean
}

export interface LoginInput {
  phone: string
  code?: string
  password?: string
  mode: 'sms' | 'password'
}
