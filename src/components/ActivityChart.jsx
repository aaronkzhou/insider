import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { transactions as allTransactions } from '../data/transactions'
import { fmtCurrency, txValue } from '../lib/portfolio'

function buildMonthlyData(transactions) {
  const byMonth = {}
  for (const tx of transactions) {
    const key = tx.date.slice(0, 7) // YYYY-MM
    if (!byMonth[key]) byMonth[key] = { month: key, buy: 0, sell: 0 }
    byMonth[key][tx.type] += txValue(tx)
  }
  return Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month))
}

function monthLabel(key) {
  const [y, m] = key.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'short' })
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-sm"
      style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
    >
      <div className="mb-1 font-semibold">{monthLabel(label)}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 tabular-nums">
          <span style={{ color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{p.dataKey}s</span>
          <span className="font-medium" style={{ color: p.color }}>
            {fmtCurrency(p.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function ActivityChart({ transactions = allTransactions }) {
  const data = buildMonthlyData(transactions)

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
        <CartesianGrid vertical={false} stroke="var(--gridline)" />
        <XAxis
          dataKey="month"
          tickFormatter={monthLabel}
          tickLine={false}
          axisLine={{ stroke: 'var(--baseline)' }}
          tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
        />
        <YAxis
          tickFormatter={(v) => fmtCurrency(v)}
          tickLine={false}
          axisLine={false}
          width={64}
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
        />
        <Tooltip cursor={{ fill: 'var(--gridline)' }} content={<ChartTooltip />} />
        <Legend
          iconType="circle"
          iconSize={8}
          formatter={(value) => (
            <span style={{ color: 'var(--text-secondary)', fontSize: 12, textTransform: 'capitalize' }}>
              {value}s
            </span>
          )}
        />
        <Bar dataKey="buy" fill="var(--status-good)" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
        <Bar dataKey="sell" fill="var(--status-critical)" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}
