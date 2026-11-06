import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

export function PageHeader({
  title,
  subtitle,
  back = false,
  action,
}: {
  title: string
  subtitle?: string
  back?: boolean
  action?: ReactNode
}) {
  const navigate = useNavigate()
  return (
    <header className="page-header">
      <div className="page-header__left">
        {back && (
          <button className="icon-button" onClick={() => navigate(-1)} aria-label="返回">
            <ArrowLeft size={20} />
          </button>
        )}
        <div>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      {action}
    </header>
  )
}
