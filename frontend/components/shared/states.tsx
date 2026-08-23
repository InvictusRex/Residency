export function LoadingState({ label = 'Loading…', skeleton = false }: { label?: string; skeleton?: boolean }) {
  if (skeleton) {
    return (
      <div className="panel" aria-busy="true" aria-label={label}>
        <div className="skeleton skeleton-block" />
        <div style={{ padding: '0 18px 18px' }}>
          <div className="skeleton skeleton-line" style={{ width: '60%' }} />
          <div className="skeleton skeleton-line" style={{ width: '80%' }} />
          <div className="skeleton skeleton-line" style={{ width: '40%' }} />
        </div>
      </div>
    )
  }
  return <div className="panel loading-state">{label}</div>
}

export function EmptyState({
  title = 'No records yet',
  message,
  action,
}: {
  title?: string
  message?: string
  action?: React.ReactNode
}) {
  return (
    <div className="panel empty-state">
      <h2>{title}</h2>
      <p>{message ?? 'Nothing to display yet.'}</p>
      {action}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="panel empty-state">
      <h2>Unable to load data</h2>
      <p>{message}</p>
      {onRetry && (
        <button className="primary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}