export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return <div className="panel loading-state">{label}</div>
}

export function EmptyState({ title = 'No records yet', message }: { title?: string; message?: string }) {
  return (
    <div className="panel empty-state">
      <h2>{title}</h2>
      <p>{message ?? 'Nothing to display yet.'}</p>
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