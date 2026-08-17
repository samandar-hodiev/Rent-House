function ApartmentDetailsSkeleton() {
  return (
    <div aria-hidden="true" className="animate-pulse">
      <div className="mb-6 h-4 w-56 rounded bg-surface-secondary" />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_400px]">
        <div>
          <div className="aspect-4/3 w-full rounded-xl bg-surface-secondary sm:aspect-16/10" />
          <div className="mt-3 grid grid-cols-5 gap-2">
            {Array.from({ length: 5 }).map((_, index) => (
              // eslint-disable-next-line react/no-array-index-key
              <div key={index} className="aspect-square rounded-lg bg-surface-secondary" />
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="h-4 w-24 rounded bg-surface-secondary" />
          <div className="h-7 w-3/4 rounded bg-surface-secondary" />
          <div className="h-8 w-1/2 rounded bg-surface-secondary" />
          <div className="h-4 w-2/5 rounded bg-surface-secondary" />
          <div className="grid grid-cols-3 gap-3 pt-2">
            {Array.from({ length: 3 }).map((_, index) => (
              // eslint-disable-next-line react/no-array-index-key
              <div key={index} className="h-16 rounded-lg bg-surface-secondary" />
            ))}
          </div>
          <div className="space-y-2 pt-4">
            <div className="h-3.5 w-full rounded bg-surface-secondary" />
            <div className="h-3.5 w-full rounded bg-surface-secondary" />
            <div className="h-3.5 w-2/3 rounded bg-surface-secondary" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default ApartmentDetailsSkeleton
