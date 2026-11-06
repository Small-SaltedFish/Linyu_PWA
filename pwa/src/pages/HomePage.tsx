import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  MapPin,
  ReceiptText,
  ScanLine,
  Sparkles,
  WalletCards,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import type { LiveProject } from '../api/live'
import { DeviceGlyph } from '../components/DeviceGlyph'
import { DRYER_ENABLED } from '../lib/features'
import { trackEvent } from '../lib/analytics'
import { formatAmount, formatDateTime, formatDuration, formatMoney } from '../lib/format'
import { useElapsed } from '../lib/hooks'
import { useAppStore } from '../store/useAppStore'
import { useUiStore } from '../store/useUiStore'

export function HomePage() {
  const navigate = useNavigate()
  const mode = useAppStore((state) => state.mode)
  const user = useAppStore((state) => state.user)
  const balance = useAppStore((state) => state.balance)
  const lastDevice = useAppStore((state) => state.lastDevice)
  const activeOrder = useAppStore((state) => state.activeOrder)
  const bills = useAppStore((state) => state.bills)
  const visibleBills = DRYER_ENABLED ? bills : bills.filter((bill) => bill.kind !== 'dryer')
  const startOrder = useAppStore((state) => state.startOrder)
  const startWater = useAppStore((state) => state.startWater)
  const projects = useAppStore((state) => state.projects)
  const currentProjectId = useAppStore((state) => state.currentProjectId)
  const currentProjectName = useAppStore((state) => state.currentProjectName)
  const switchProject = useAppStore((state) => state.switchProject)
  const refreshProjects = useAppStore((state) => state.refreshProjects)
  const sessionError = useAppStore((state) => state.sessionError)
  const showToast = useUiStore((state) => state.showToast)
  const elapsed = useElapsed(activeOrder?.startedAt)
  const [projectOpen, setProjectOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [starting, setStarting] = useState(false)

  const liveOrder = activeOrder?.mode === 'live'
  const referenceDevice = lastDevice ?? activeOrder?.device ?? null
  const lowBalanceThreshold = (referenceDevice?.withhold ?? 10) * 1.5
  const lowBalance = Boolean(referenceDevice) && balance < lowBalanceThreshold

  const start = async () => {
    if (!lastDevice) {
      navigate('/scan')
      return
    }
    if (mode === 'live') {
      setStarting(true)
      try {
        await startWater(lastDevice)
        trackEvent('water_start')
        showToast('已开阀，正在用水', 'success')
        navigate('/shower')
      } catch (error) {
        showToast(error instanceof Error ? error.message : '开阀失败', 'danger')
      } finally {
        setStarting(false)
      }
      return
    }
    startOrder(lastDevice)
    trackEvent('water_start')
    showToast(lastDevice.kind === 'dryer' ? '已开始固定时长吹风' : '已开始用水', 'success')
    navigate('/shower')
  }

  const handleSwitch = async (project: LiveProject) => {
    if (activeOrder) {
      showToast('请先结束用水再切换项目', 'danger')
      return
    }
    setSwitching(true)
    try {
      await switchProject(project)
      setProjectOpen(false)
      showToast(`已切换到「${project.projectName}」`, 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '切换项目失败', 'danger')
    } finally {
      setSwitching(false)
    }
  }

  const openProjects = () => {
    setProjectOpen(true)
    if (mode === 'live' && projects.length === 0) void reloadProjects()
  }

  const reloadProjects = async () => {
    setProjectsLoading(true)
    try {
      await refreshProjects()
      showToast('项目列表已更新', 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '项目列表加载失败', 'danger')
    } finally {
      setProjectsLoading(false)
    }
  }

  const activeAmount = liveOrder
    ? activeOrder?.preDeduct ?? activeOrder?.device.withhold ?? 0
    : activeOrder?.device.kind === 'dryer'
      ? activeOrder.device.fixedPrice ?? 3
      : Math.max(0, elapsed * (activeOrder?.pricePerSecond ?? 0.01))

  return (
    <main className="page home-page">
      <header className="home-header">
        <div>
          <p className="home-header__eyebrow">
            {user?.school ?? '校园热水'} <span className="dot" /> 在线
          </p>
          <h1>
            下午好，{user?.phone ?? '同学'}
            <span className="wave">👋</span>
          </h1>
        </div>
      </header>

      {sessionError && <p className="home-session-error">{sessionError}</p>}

      {mode === 'live' && (
        <button
          type="button"
          className="project-bar"
          onClick={openProjects}
          disabled={Boolean(activeOrder)}
        >
          <span className="project-bar__icon">
            <Building2 size={17} />
          </span>
          <span className="project-bar__copy">
            <small>当前项目</small>
            <strong>{currentProjectName || '选择项目'}</strong>
          </span>
          <span className="project-bar__action">
            {activeOrder ? '用水结束后可切换' : '切换'}
            <ChevronDown size={15} />
          </span>
        </button>
      )}

      <section className="balance-card">
        <div className="balance-card__orb balance-card__orb--one" />
        <div className="balance-card__orb balance-card__orb--two" />
        <div className="balance-card__top">
          <span>趣智校园余额</span>
          <span className="balance-card__chip">
            <WalletCards size={13} /> 钱包余额
          </span>
        </div>
        <div className="balance-card__amount">
          <span>¥</span>
          {formatAmount(balance)}
        </div>
        <div className="balance-card__bottom">
          <span>余额由趣智校园钱包提供</span>
          <button onClick={() => navigate('/records')}>
            查看明细 <ArrowUpRight size={14} />
          </button>
        </div>
      </section>

      {lowBalance && (
        <button
          type="button"
          className="balance-warning"
          onClick={() => showToast('请前往趣智校园充值，余额不足会影响下一次开阀', 'danger')}
        >
          <AlertTriangle size={16} />
          <span>
            余额低于常用水表预扣的 150%（约 ¥{lowBalanceThreshold.toFixed(2)}），建议充值
          </span>
          <ChevronRight size={15} />
        </button>
      )}

      <section className="quick-grid">
        <button className="quick-card quick-card--primary" onClick={() => navigate('/scan')}>
          <span className="quick-card__icon">
            <ScanLine size={24} />
          </span>
          <span>
            <strong>扫码用水</strong>
            <small>{DRYER_ENABLED ? '水表 / 吹风机' : '仅支持 4G 水表'}</small>
          </span>
          <ArrowUpRight size={17} />
        </button>
        <button className="quick-card" onClick={() => navigate('/records')}>
          <span className="quick-card__icon quick-card__icon--soft">
            <ReceiptText size={23} />
          </span>
          <span>
            <strong>使用记录</strong>
            <small>{visibleBills.length} 条账单</small>
          </span>
          <ArrowUpRight size={17} />
        </button>
      </section>

      {activeOrder ? (
        <section className="active-card" onClick={() => navigate('/shower')} role="button" tabIndex={0}>
          <div className="active-card__glow" />
          <div className="active-card__header">
            <span className="live-pill">
              <span className="live-dot" /> 使用中
            </span>
            <span className="active-card__timer">
              <Clock3 size={15} />
              {activeOrder.device.kind === 'dryer'
                ? `剩余 ${formatDuration(
                    Math.max(0, (activeOrder.device.fixedDuration ?? 300) - elapsed),
                  )}`
                : formatDuration(elapsed)}
            </span>
          </div>
          <div className="active-card__body">
            <DeviceGlyph kind={activeOrder.device.kind} size="lg" />
            <div>
              <h2>{activeOrder.device.name}</h2>
              <p>
                <MapPin size={13} /> {activeOrder.device.location}
              </p>
            </div>
          </div>
          <div className="active-card__footer">
            <div>
              <small>{liveOrder ? '预扣金额（结算后多退少补）' : '预估消费'}</small>
              <strong>{formatMoney(activeAmount)}</strong>
            </div>
            <span className="active-card__cta">
              查看 <ChevronRight size={16} />
            </span>
          </div>
        </section>
      ) : (
        <section className="device-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">上次使用</span>
              <h2>常用设备</h2>
            </div>
            <button className="text-button" onClick={() => navigate('/scan')}>
              换一个 <ChevronRight size={15} />
            </button>
          </div>
          {lastDevice ? (
            <div className="device-card__row">
              <DeviceGlyph kind={lastDevice.kind} size="lg" />
              <div className="device-card__copy">
                <div className="device-card__title">
                  <h3>{lastDevice.name}</h3>
                  <span className="tag">{lastDevice.kind === 'water' ? '4G 水表' : '4G 吹风机'}</span>
                </div>
                <p>
                  <MapPin size={13} /> {lastDevice.location}
                </p>
                <p className="device-card__meta">
                  {lastDevice.kind === 'water'
                    ? `预扣 ${formatMoney(lastDevice.withhold)}`
                    : `固定 ${Math.round((lastDevice.fixedDuration ?? 300) / 60)} 分钟 · ${formatMoney(
                        lastDevice.fixedPrice ?? 3,
                      )}`}
                </p>
              </div>
            </div>
          ) : (
            <div className="empty-inline">
              <Sparkles size={18} />
              还没有常用设备，先扫一下设备二维码
            </div>
          )}
          <button
            className="primary-button primary-button--full"
            onClick={start}
            disabled={starting}
          >
            {starting ? '开阀中…' : lastDevice?.kind === 'dryer' ? '开始吹风' : '开始用水'}
            <ArrowUpRight size={18} />
          </button>
        </section>
      )}

      <section className="section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">最近消费</span>
            <h2>使用记录</h2>
          </div>
          <button className="text-button" onClick={() => navigate('/records')}>
            全部 <ChevronRight size={15} />
          </button>
        </div>
        <div className="bill-list">
          {visibleBills.slice(0, 3).map((bill) => (
            <button className="bill-row" key={bill.id} onClick={() => navigate('/records')}>
              <DeviceGlyph kind={bill.kind} size="sm" />
              <span className="bill-row__main">
                <strong>{bill.deviceName}</strong>
                <small>
                  {formatDateTime(bill.createdAt)} ·{' '}
                  {bill.duration > 0 ? formatDuration(bill.duration) : '—'}
                </small>
              </span>
              <span className="bill-row__amount">-{formatMoney(bill.amount)}</span>
            </button>
          ))}
          {visibleBills.length === 0 && <div className="empty-inline">还没有消费记录</div>}
        </div>
      </section>

      {mode === 'live' && (
        <p className="page-footnote">
          <Sparkles size={13} /> 数据来自趣智校园接口
        </p>
      )}

      {projectOpen &&
        createPortal(
          <div className="project-overlay" role="dialog" aria-modal="true" aria-label="切换项目">
          <div className="project-overlay__inner">
            <header className="project-overlay__header">
              <button
                type="button"
                className="icon-button"
                onClick={() => setProjectOpen(false)}
                aria-label="关闭"
              >
                <X size={20} />
              </button>
              <h2>切换项目</h2>
              <span className="project-overlay__spacer" />
            </header>

            <p className="notice">
              钱包、账单和设备都会随项目切换；设备运行中不能切换。
            </p>

            {projects.length === 0 ? (
              <div className="empty-inline project-empty">
                <span>项目列表为空</span>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => void reloadProjects()}
                  disabled={projectsLoading}
                >
                  {projectsLoading ? '加载中…' : '重新加载'}
                </button>
              </div>
            ) : (
              <div className="project-sheet">
                {projects.map((project) => {
                  const active = project.projectId === currentProjectId
                  return (
                    <button
                      key={project.projectId}
                      type="button"
                      className={`project-option ${active ? 'is-active' : ''}`}
                      onClick={() => void handleSwitch(project)}
                      disabled={active || switching}
                    >
                      <span>
                        <strong>{project.projectName}</strong>
                        <small>项目 ID {project.projectId}</small>
                      </span>
                      {active ? <CheckCircle2 size={17} /> : <span>切换</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          </div>,
          document.body,
        )}
    </main>
  )
}
