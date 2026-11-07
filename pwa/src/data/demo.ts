import { DRYER_ENABLED } from '../lib/features'
import type { Bill, Device, User } from '../types'

export const demoUser: User = {
  phone: '138****2211',
  school: '示例大学 · 紫金校区',
}

const allDevices: Device[] = [
  {
    id: 'water-1',
    kind: 'water',
    name: '热水表 · 302',
    location: '3 号楼 · 3 层 · 302',
    mac: 'A1B2C3D4E5F6',
    snCode: 'A1B2C3D4E5F6',
    withhold: 5,
  },
  {
    id: 'dryer-1',
    kind: 'dryer',
    name: '吹风机 · 302',
    location: '3 号楼 · 3 层 · 走廊',
    mac: '001583CC0CFE',
    snCode: '001583CC0CFE',
    withhold: 0,
    fixedPrice: 3,
    fixedDuration: 300,
  },
]

const allBills: Bill[] = [
  {
    id: 'bill-1',
    deviceName: '热水表 · 302',
    kind: 'water',
    amount: 2.46,
    duration: 246,
    createdAt: Date.now() - 1000 * 60 * 60 * 6,
    orderNo: '13200000000000000021',
  },
  {
    id: 'bill-2',
    deviceName: '吹风机 · 302',
    kind: 'dryer',
    amount: 3,
    duration: 300,
    createdAt: Date.now() - 1000 * 60 * 60 * 26,
    orderNo: '13200000000000000018',
  },
  {
    id: 'bill-3',
    deviceName: '热水表 · 302',
    kind: 'water',
    amount: 1.88,
    duration: 188,
    createdAt: Date.now() - 1000 * 60 * 60 * 50,
    orderNo: '13200000000000000011',
  },
]

// 吹风机暂时下掉：默认不展示演示设备/账单；VITE_ENABLE_DRYER=true 时恢复。
export const demoDevices = DRYER_ENABLED
  ? allDevices
  : allDevices.filter((device) => device.kind !== 'dryer')

export const demoBills = DRYER_ENABLED ? allBills : allBills.filter((bill) => bill.kind !== 'dryer')
