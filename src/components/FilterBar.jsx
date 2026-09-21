const options = [
  { value: 'all', label: 'All' },
  { value: 'buy', label: 'Buys' },
  { value: 'sell', label: 'Sells' },
]

export default function FilterBar({ type, onTypeChange, search, onSearchChange, searchPlaceholder }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div
        className="inline-flex rounded-md border p-0.5"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}
      >
        {options.map((opt) => {
          const active = type === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => onTypeChange(opt.value)}
              className="rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors"
              style={{
                background: active ? 'var(--accent)' : 'transparent',
                color: active ? '#fff' : 'var(--text-secondary)',
              }}
            >
              {opt.label}
            </button>
          )
        })}
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={searchPlaceholder ?? 'Search by name or ticker…'}
        className="min-w-[220px] flex-1 rounded-md border px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--surface-1)',
          color: 'var(--text-primary)',
        }}
      />
    </div>
  )
}
