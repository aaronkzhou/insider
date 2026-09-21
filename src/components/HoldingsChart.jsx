import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmtCurrency } from '../lib/portfolio'

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-sm"
      style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
    >
      <div className="font-semibold">{d.ticker}</div>
      <div style={{ color: 'var(--text-secondary)' }}>{d.name}</div>
      <div className="mt-1 tabular-nums font-medium">{fmtCurrency(d.value)}</div>
      <div className="tabular-nums" style={{ color: 'var(--text-muted)' }}>
        {d.shares.toLocaleString('en-US')} sh @ ${d.price.toFixed(2)}
      </div>
    </div>
  )
}

export default function HoldingsChart({ holdings }) {
  const data = holdings.slice(0, 8)
  const height = Math.max(120, data.length * 44)

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 4 }} barSize={18}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="ticker"
          width={64}
          tickLine={false}
          axisLine={{ stroke: 'var(--baseline)' }}
          tick={{ fill: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}
        />
        <Tooltip cursor={{ fill: 'var(--gridline)' }} content={<ChartTooltip />} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.ticker} fill="var(--series-1)" />
          ))}
          <LabelList
            dataKey="value"
            position="right"
            formatter={(v) => fmtCurrency(v)}
            style={{ fill: 'var(--text-primary)', fontSize: 12, fontWeight: 600 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
