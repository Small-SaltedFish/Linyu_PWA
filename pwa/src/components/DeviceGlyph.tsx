import { Bath, Wind } from 'lucide-react'
import type { DeviceKind } from '../types'

export function DeviceGlyph({
  kind,
  size = 'md',
}: {
  kind: DeviceKind
  size?: 'sm' | 'md' | 'lg'
}) {
  const Icon = kind === 'water' ? Bath : Wind
  return (
    <span className={`device-glyph device-glyph--${kind} device-glyph--${size}`}>
      <Icon size={size === 'lg' ? 30 : size === 'sm' ? 18 : 22} strokeWidth={2.2} />
    </span>
  )
}
