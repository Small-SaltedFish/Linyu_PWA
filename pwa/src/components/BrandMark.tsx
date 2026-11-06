import { Droplets } from 'lucide-react'

export function BrandMark({ size = 44 }: { size?: number }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }}>
      <Droplets size={size * 0.5} strokeWidth={2.4} />
    </span>
  )
}
