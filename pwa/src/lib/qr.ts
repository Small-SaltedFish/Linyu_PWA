import type { Device } from '../types'
import { demoDevices } from '../data/demo'

const QR_RE = /^KLCXKJ-Water,([^,]+),([0-9A-Fa-f]{12})$/

export interface ParsedQr {
  type: string
  address: string
  variants: string[]
}

/**
 * 扫码得到的 12 位地址 → 依次尝试的查询候选。
 *
 * 首字节最高两位为 `11` 时，可能是空口广播地址，清掉最高两位再查一次台账 MAC
 * （`A1B2C3D4E5F6` → `2112C3D4E5F6`）。原生 `MacFormat` 是同一套规则。
 */
export function macVariants(address: string): string[] {
  const upper = address.toUpperCase()
  const variants = [upper]
  const first = Number.parseInt(upper.slice(0, 2), 16)
  if ((first & 0xc0) !== 0) {
    const ledger = ((first & 0x3f).toString(16).padStart(2, '0') + upper.slice(2)).toUpperCase()
    if (ledger !== upper) variants.push(ledger.toLowerCase())
  }
  return variants
}

export function parseQr(raw: string): ParsedQr | null {
  const match = raw.trim().match(QR_RE)
  if (!match) return null

  const address = match[2].toUpperCase()
  return { type: match[1], address, variants: macVariants(address) }
}

export function normalizeMac(value: string): string | null {
  const hex = value.replace(/[^0-9a-f]/gi, '').toUpperCase()
  return hex.length === 12 ? hex : null
}

/** 演示模式：二维码最后 12 位与演示设备对齐。真实环境应调用 /device/info/mac。 */
export function findDemoDevice(address: string): Device | null {
  const target = normalizeMac(address)
  if (!target) return null
  return (
    demoDevices.find((device) => {
      const mac = normalizeMac(device.mac)
      if (mac === target) return true
      const first = Number.parseInt(target.slice(0, 2), 16)
      const ledger = ((first & 0x3f).toString(16).padStart(2, '0') + target.slice(2)).toUpperCase()
      return mac === ledger
    }) ?? null
  )
}
