export function Icon({
  name,
  size = 20,
  fill = false,
  className = '',
  title,
}: {
  name: string
  size?: number
  fill?: boolean
  className?: string
  title?: string
}) {
  return (
    <span
      className={`material-symbols-outlined ${fill ? 'ms-fill' : ''} ${className}`}
      style={{ fontSize: size }}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      aria-label={title}
    >
      {name}
    </span>
  )
}