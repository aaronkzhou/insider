export default function StatTile({ label, value, sublabel, tone }) {
  const toneColor =
    tone === 'good'
      ? 'var(--status-good)'
      : tone === 'critical'
        ? 'var(--status-critical)'
        : 'var(--text-primary)'

  return (
    <div
      className="rounded-lg border p-3.5"
      style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
        {label}
      </div>
      <div className="mt-1.5 text-2xl font-bold tabular-nums" style={{ color: toneColor }}>
        {value}
      </div>
      {sublabel && (
        <div className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
          {sublabel}
        </div>
      )}
    </div>
  )
}
