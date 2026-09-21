import { useEffect, useMemo, useRef, useState } from 'react'
import { getPerson } from '../data/people'
import { fmtCurrency, isoDay, parseDateOnly, txValue } from '../lib/portfolio'

const DAY_MS = 86_400_000
const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', '']

/** GitHub-style calendar heatmap: one cell per day, color = how many distinct
 * people transacted that day, hover shows who. */
export default function CalendarHeatmap({ transactions, colorVar, onSelectDay, selectedDay }) {
  const [hover, setHover] = useState(null) // { day, x, y }
  const scrollRef = useRef(null)

  const { weeks, monthLabels, maxCount, byDay } = useMemo(() => {
    if (transactions.length === 0) return { weeks: [], monthLabels: [], maxCount: 0, byDay: new Map() }

    const byDay = new Map()
    for (const tx of transactions) {
      const day = isoDay(parseDateOnly(tx.date))
      if (!byDay.has(day)) byDay.set(day, new Map())
      const people = byDay.get(day)
      if (!people.has(tx.personId)) people.set(tx.personId, [])
      people.get(tx.personId).push(tx)
    }

    const allDates = transactions.map((t) => parseDateOnly(t.date).getTime())
    let start = new Date(Math.min(...allDates))
    const end = new Date(Math.max(...allDates))
    start = new Date(start.getFullYear(), start.getMonth(), start.getDate() - start.getDay())

    const days = []
    for (let d = new Date(start); d <= end; d = new Date(d.getTime() + DAY_MS)) {
      days.push(new Date(d))
    }
    // pad to full last week
    while (days[days.length - 1].getDay() !== 6) {
      days.push(new Date(days[days.length - 1].getTime() + DAY_MS))
    }

    const weeks = []
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7))

    const monthLabels = []
    let lastMonth = -1
    weeks.forEach((week, wi) => {
      const first = week[0]
      if (first.getMonth() !== lastMonth) {
        lastMonth = first.getMonth()
        monthLabels.push({ wi, label: first.toLocaleDateString('en-US', { month: 'short' }) })
      }
    })

    let maxCount = 0
    for (const people of byDay.values()) maxCount = Math.max(maxCount, people.size)

    return { weeks, monthLabels, maxCount, byDay }
  }, [transactions])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth
    }
  }, [weeks.length])

  if (transactions.length === 0) {
    return (
      <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
        No transactions in range.
      </div>
    )
  }

  const cellColor = (count) => {
    if (count === 0) return 'var(--surface-2)'
    const t = maxCount <= 1 ? 1 : count / maxCount
    // Step opacity of the given hue so higher activity days read darker/bolder.
    const alpha = 0.25 + t * 0.75
    return `color-mix(in srgb, ${colorVar} ${Math.round(alpha * 100)}%, var(--surface-1))`
  }

  return (
    <div ref={scrollRef} className="overflow-x-auto">
      <div style={{ minWidth: weeks.length * 13 + 24 }}>
        <div className="relative mb-1 h-4" style={{ marginLeft: 20 }}>
          {monthLabels.map(({ wi, label }) => (
            <span
              key={wi}
              className="absolute text-[10px]"
              style={{ left: wi * 13, color: 'var(--text-muted)' }}
            >
              {label}
            </span>
          ))}
        </div>
        <div className="flex gap-[3px]">
          <div className="flex flex-col gap-[3px]" style={{ width: 16 }}>
            {DAY_LABELS.map((l, i) => (
              <div key={i} className="text-[9px] leading-[11px]" style={{ color: 'var(--text-muted)', height: 11 }}>
                {l}
              </div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {week.map((day) => {
                const key = isoDay(day)
                const people = byDay.get(key)
                const count = people?.size ?? 0
                const isSelected = selectedDay === key
                return (
                  <div
                    key={key}
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect()
                      setHover({ day: key, x: rect.left + rect.width / 2, y: rect.top })
                    }}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => count > 0 && onSelectDay?.(key === selectedDay ? null : key)}
                    className="transition-transform"
                    style={{
                      width: 11,
                      height: 11,
                      borderRadius: 2,
                      background: cellColor(count),
                      cursor: count > 0 ? 'pointer' : 'default',
                      outline: isSelected ? `1.5px solid ${colorVar}` : 'none',
                      outlineOffset: 1,
                    }}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {hover && byDay.get(hover.day) && (
        <HoverCard day={hover.day} x={hover.x} y={hover.y} people={byDay.get(hover.day)} />
      )}
    </div>
  )
}

function HoverCard({ day, x, y, people }) {
  const rows = [...people.entries()].map(([personId, txs]) => {
    const person = getPerson(personId)
    const totalValue = txs.reduce((s, t) => s + txValue(t), 0)
    const tickers = [...new Set(txs.map((t) => t.ticker))]
    return { personId, name: person?.name ?? personId, tickers, totalValue }
  })

  return (
    <div
      className="pointer-events-none fixed z-50 rounded-lg border px-3 py-2 text-xs shadow-lg"
      style={{
        left: Math.max(8, x - 110),
        top: Math.max(8, y - 8),
        transform: 'translateY(-100%)',
        background: 'var(--surface-1)',
        borderColor: 'var(--border-strong)',
        minWidth: 200,
        maxWidth: 260,
      }}
    >
      <div className="mb-1.5 font-semibold" style={{ color: 'var(--text-primary)' }}>
        {parseDateOnly(day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
      </div>
      <div className="space-y-1">
        {rows.slice(0, 8).map((r) => (
          <div key={r.personId} className="flex items-center justify-between gap-3">
            <span className="truncate" style={{ color: 'var(--text-secondary)' }}>
              {r.name} <span style={{ color: 'var(--text-muted)' }}>· {r.tickers.join(', ')}</span>
            </span>
            <span className="shrink-0 font-medium tabular-nums" style={{ color: 'var(--text-primary)' }}>
              {fmtCurrency(r.totalValue)}
            </span>
          </div>
        ))}
        {rows.length > 8 && (
          <div style={{ color: 'var(--text-muted)' }}>+{rows.length - 8} more</div>
        )}
      </div>
    </div>
  )
}
