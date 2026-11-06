import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Droplets,
  ReceiptText,
  WalletCards,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { DeviceGlyph } from '../components/DeviceGlyph'
import { PageHeader } from '../components/PageHeader'
import { Sheet } from '../components/Sheet'
import { formatDateTime, formatDuration, formatMoney } from '../lib/format'
import { useAppStore } from '../store/useAppStore'
import type { Bill } from '../types'

type Range = 7 | 30

const DAY_MS = 24 * 60 * 60 * 1000

function startOfDay(value: number): number {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function dayLabel(day: number, today: number): string {
  const diff = Math.round((today - day) / DAY_MS)
  if (diff === 0) return '今天'
  if (diff === 1) return '昨天'
  const date = new Date(day)
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`
}

function timeLabel(value: number): string {
  return new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function RecordsPage() {
  const mode = useAppStore((state) => state.mode)
  const bills = useAppStore((state) => state.bills)
  const balance = useAppStore((state) => state.balance)
  const [range, setRange] = useState<Range>(7)
  const [selected, setSelected] = useState<Bill | null>(null)
  const [openDay, setOpenDay] = useState<string | null>(null)
  const [today] = useState(() => startOfDay(Date.now()))

  const waterBills = useMemo(
    () => bills.filter((bill) => bill.kind === 'water'),
    [bills],
  )

  const todayTotal = useMemo(
    () =>
      waterBills
        .filter((bill) => bill.createdAt >= today)
        .reduce((sum, bill) => sum + bill.amount, 0),
    [waterBills, today],
  )

  const trend = useMemo(() => {
    const days = Array.from({ length: range }, (_, index) => {
      const day = today - (range - 1 - index) * DAY_MS
      const next = day + DAY_MS
      const amount = waterBills
        .filter((bill) => bill.createdAt >= day && bill.createdAt < next)
        .reduce((sum, bill) => sum + bill.amount, 0)
      const date = new Date(day)
      return {
        key: `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`,
        label: `${date.getMonth() + 1}/${date.getDate()}`,
        amount,
      }
    })
    const max = Math.max(0.01, ...days.map((day) => day.amount))
    return {
      days: days.map((day) => ({
        ...day,
        height: day.amount > 0 ? Math.max(8, (day.amount / max) * 100) : 2,
      })),
      total: days.reduce((sum, day) => sum + day.amount, 0),
    }
  }, [range, today, waterBills])

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; day: number; bills: Bill[]; amount: number }>()
    waterBills.forEach((bill) => {
      const day = startOfDay(bill.createdAt)
      const key = String(day)
      const entry = map.get(key) ?? { key, day, bills: [], amount: 0 }
      entry.bills.push(bill)
      entry.amount += bill.amount
      map.set(key, entry)
    })
    return [...map.values()]
      .sort((a, b) => b.day - a.day)
      .map((entry) => ({
        ...entry,
        bills: [...entry.bills].sort((a, b) => b.createdAt - a.createdAt),
      }))
  }, [waterBills])

  const durationText = (bill: Bill) =>
    bill.duration > 0 ? formatDuration(bill.duration) : '—'

  return (
    <main className="page records-page">
      <PageHeader title="使用记录" subtitle="每天的热水，都算得清楚" />

      <section className="records-summary records-summary--today">
        <div className="records-summary__icon">
          <Droplets size={22} />
        </div>
        <div>
          <span>今日热水消费</span>
          <strong>{formatMoney(todayTotal)}</strong>
        </div>
        <div className="records-summary__balance">
          <span>余额</span>
          <strong>{formatMoney(balance)}</strong>
        </div>
      </section>

      <section className="trend-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">近 {range} 天</span>
            <h2>热水消费趋势</h2>
          </div>
          <span className="trend-card__hint">
            <CalendarDays size={14} /> 合计 {formatMoney(trend.total)}
          </span>
        </div>

        <div className="trend-ranges" role="tablist" aria-label="趋势范围">
          <button
            type="button"
            role="tab"
            aria-selected={range === 7}
            className={range === 7 ? 'is-active' : ''}
            onClick={() => setRange(7)}
          >
            近 7 天
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={range === 30}
            className={range === 30 ? 'is-active' : ''}
            onClick={() => setRange(30)}
          >
            近 30 天
          </button>
        </div>

        <div className={`trend-bars ${range === 30 ? 'trend-bars--dense' : ''}`} aria-hidden="true">
          {trend.days.map((day, index) => (
            <div className="trend-bar" key={day.key}>
              <div className="trend-bar__track">
                <span style={{ height: `${day.height}%` }} />
              </div>
              <small>{range === 30 && index % 5 !== 0 ? '' : day.label}</small>
            </div>
          ))}
        </div>
        <p className="trend-card__caption">
          仅统计热水表；金额以趣智校园账单为准
        </p>
      </section>

      <section className="bill-days">
        <div className="section-heading">
          <div>
            <span className="eyebrow">每日账单</span>
            <h2>按天合并</h2>
          </div>
          <span className="trend-card__hint">
            <WalletCards size={14} /> {groups.length} 天
          </span>
        </div>

        {groups.map((group) => {
          const open = openDay === group.key
          return (
            <div className={`bill-day ${open ? 'is-open' : ''}`} key={group.key}>
              <button
                type="button"
                className="bill-day__head"
                onClick={() => setOpenDay(open ? null : group.key)}
                aria-expanded={open}
              >
                <span className="bill-day__date">
                  <strong>{dayLabel(group.day, today)}</strong>
                  <small>{group.bills.length} 笔热水</small>
                </span>
                <span className="bill-day__amount">-{formatMoney(group.amount)}</span>
                <ChevronDown size={16} className="bill-day__chevron" />
              </button>
              {open && (
                <div className="bill-day__body">
                  {group.bills.map((bill) => (
                    <button className="bill-row bill-row--nested" key={bill.id} onClick={() => setSelected(bill)}>
                      <DeviceGlyph kind="water" size="md" />
                      <span className="bill-row__main">
                        <strong>{bill.deviceName}</strong>
                        <small>
                          {timeLabel(bill.createdAt)} · {durationText(bill)}
                        </small>
                      </span>
                      <span className="bill-row__amount">-{formatMoney(bill.amount)}</span>
                      <ChevronRight size={15} className="bill-row__chevron" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {groups.length === 0 && (
          <div className="empty-state">
            <ReceiptText size={30} />
            <h3>这里还没有记录</h3>
            <p>{mode === 'live' ? '本月还没有热水账单，扫一次设备码开始用水。' : '扫一次设备码，开始第一笔校园热水。'}</p>
          </div>
        )}
      </section>

      <Sheet open={Boolean(selected)} onClose={() => setSelected(null)} title="账单详情">
        {selected && (
          <div className="bill-detail">
            <div className="bill-detail__hero">
              <DeviceGlyph kind="water" size="lg" />
              <div>
                <h2>{selected.deviceName}</h2>
                <p>{formatDateTime(selected.createdAt)}</p>
              </div>
              <strong>-{formatMoney(selected.amount)}</strong>
            </div>
            <dl className="detail-list">
              <div>
                <dt>订单号</dt>
                <dd className="mono">{selected.orderNo}</dd>
              </div>
              <div>
                <dt>使用时长</dt>
                <dd>{durationText(selected)}</dd>
              </div>
              <div>
                <dt>设备类型</dt>
                <dd>4G 热水表</dd>
              </div>
              <div>
                <dt>计费方式</dt>
                <dd>按用量</dd>
              </div>
            </dl>
            <p className="notice">
              {mode === 'live'
                ? '金额以趣智校园服务端账单为准。'
                : '金额以趣智校园服务端账单为准。'}
            </p>
          </div>
        )}
      </Sheet>
    </main>
  )
}
