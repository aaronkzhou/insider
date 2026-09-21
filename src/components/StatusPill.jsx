export default function StatusPill({ type }) {
  const isBuy = type === 'buy'
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{
        color: isBuy ? 'var(--status-good)' : 'var(--status-critical)',
        background: isBuy ? 'var(--status-good-bg)' : 'var(--status-critical-bg)',
      }}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        {isBuy ? (
          <path d="M5 9V1M5 1L1.5 4.5M5 1L8.5 4.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M5 1V9M5 9L1.5 5.5M5 9L8.5 5.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
      {isBuy ? 'Buy' : 'Sell'}
    </span>
  )
}
