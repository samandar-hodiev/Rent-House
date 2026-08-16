function ApartmentCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="animate-pulse overflow-hidden rounded-lg border border-border bg-surface"
    >
      <div className="aspect-[4/3] w-full bg-surface-secondary" />
      <div className="space-y-2 p-4">
        <div className="h-4 w-2/5 rounded bg-surface-secondary" />
        <div className="h-4 w-3/4 rounded bg-surface-secondary" />
        <div className="h-3 w-1/2 rounded bg-surface-secondary" />
        <div className="h-3 w-2/3 rounded bg-surface-secondary" />
        <div className="h-3 w-1/3 rounded bg-surface-secondary" />
      </div>
    </div>
  )
}

export default ApartmentCardSkeleton
