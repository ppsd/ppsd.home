interface IconProps {
  /** One or more SVG path "d" strings, space-separated as in the prototype. */
  path: string
  size?: number
  color?: string
  width?: number
  className?: string
  style?: React.CSSProperties
}

/**
 * Stroke icon matching the prototype's inline <svg><path d=...></svg> pattern.
 * The whole string is a single SVG path `d`; spaces separate subpath commands
 * (e.g. the warning triangle + exclamation), which is valid SVG.
 */
export default function Icon({ path, size = 18, color = 'currentColor', width = 1.7, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }}
    >
      <path d={path} />
    </svg>
  )
}
