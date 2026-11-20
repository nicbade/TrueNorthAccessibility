export default function Logo({
  compact = false,
  title,
  dark = false,
}: {
  compact?: boolean
  title?: string
  dark?: boolean
}) {
  const w = compact ? 150 : 185
  const h = compact ? 49 : 60
  const decorative = !title
  /* on-white: navy mark; on-black: white mark for dark backgrounds */
  const circle = dark ? '#ffffff' : '#1e3a5f'
  const star = dark ? '#000000' : '#ffffff'
  const wordmark = dark ? '#ffffff' : '#1e3a5f'
  const tagline = dark ? '#b8b8b8' : '#595959'
  return (
    <svg
      width={w}
      height={h}
      viewBox="40 42 430 148"
      xmlns="http://www.w3.org/2000/svg"
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? true : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <circle cx="110" cy="110" r="70" fill={circle} />
      <path d="M110 50 L124 96 L170 110 L124 124 L110 170 L96 124 L50 110 L96 96 Z" fill={star} />
      <circle cx="110" cy="110" r="10" fill={circle} />
      <text x="210" y="100" fontFamily="Arial, sans-serif" fontSize="42" fontWeight="700" fill={wordmark}>
        TrueNorth
      </text>
      <text
        x="210"
        y="140"
        fontFamily="Arial, sans-serif"
        fontSize="24"
        fontWeight="400"
        letterSpacing="2"
        fill={tagline}
      >
        ACCESSIBILITY
      </text>
    </svg>
  )
}
