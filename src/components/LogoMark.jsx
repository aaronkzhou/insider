export default function LogoMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="var(--accent)" />
      <rect x="7" y="18" width="4.5" height="8" rx="1.2" fill="#080404" />
      <rect x="13.75" y="12" width="4.5" height="14" rx="1.2" fill="#080404" />
      <rect x="20.5" y="6" width="4.5" height="20" rx="1.2" fill="#080404" />
    </svg>
  )
}
