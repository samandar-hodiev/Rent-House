function ApartmentCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="animate-pulse overflow-hidden rounded-xl border border-border bg-surface"
    >
      <div className="aspect-4/3 w-full bg-surface-secondary" />
      {/* Mirrors ApartmentCard's body padding and row rhythm so the grid does
          not shift when the real cards replace these. */}
      <div className="space-y-2 p-4">
        <div className="h-5 w-2/5 rounded bg-surface-secondary" />
        <div className="h-12 w-3/4 rounded bg-surface-secondary" />
        <div className="h-3.5 w-1/2 rounded bg-surface-secondary" />
        <div className="h-3.5 w-2/3 rounded bg-surface-secondary" />
        <div className="h-3.5 w-1/3 rounded bg-surface-secondary" />
      </div>
    </div>
  )
}

export default ApartmentCardSkeleton
