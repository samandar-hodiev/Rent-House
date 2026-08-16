function EmptyState({ icon, title, description, actionLabel, onAction }) {
  return (
    <div className="flex flex-col items-center rounded-md border border-dashed border-border bg-surface px-6 py-16 text-center">
      {icon ? <div className="mb-4 text-text-muted">{icon}</div> : null}
      <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
      {description ? (
        <p className="mt-1.5 max-w-sm text-sm text-text-secondary">{description}</p>
      ) : null}
      {actionLabel ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}

export default EmptyState
