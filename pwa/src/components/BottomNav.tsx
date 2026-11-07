import { House, ReceiptText, ScanLine, UserRound } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import { useEffect } from 'react'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

const items: NavItem[] = [
  { to: '/', label: '首页', icon: House, end: true },
  { to: '/scan', label: '扫码', icon: ScanLine },
  { to: '/records', label: '记录', icon: ReceiptText },
  { to: '/profile', label: '我的', icon: UserRound },
]

export function BottomNav() {
  const location = useLocation()
  const hidden = ['/login', '/scan', '/shower', '/spike', '/tilt', '/debug', '/terms', '/privacy', '/help'].includes(location.pathname)

  useEffect(() => {
    // 任何路由切换都确保底部导航不被残留的 sheet-open 类隐藏
    document.body.classList.remove('sheet-open')
  }, [location.pathname])

  if (hidden) return null

  return (
    <nav className="bottom-nav" aria-label="主导航">
      {items.map((item) => {
        const Icon = item.icon
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `bottom-nav__item ${isActive ? 'is-active' : ''}`}
          >
            <Icon size={21} strokeWidth={2.1} />
            <span>{item.label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}
