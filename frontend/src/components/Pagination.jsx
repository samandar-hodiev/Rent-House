import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useLocale } from '../context/LocaleContext'

/**
 * Which pages to offer when there are more than fit.
 *
 * Always the first and last, always the current one and its neighbours, with a
 * gap marker where numbers were left out. Without this a hundred pages of
 * listings would be a hundred buttons.
 */
function pageWindow(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  const pages = new Set([1, total, current, current - 1, current + 1])
  const sorted = [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b)

  const withGaps = []
  let previous = 0
  for (const page of sorted) {
    if (previous && page - previous > 1) withGaps.push('gap')
    withGaps.push(page)
    previous = page
  }
  return withGaps
}

/**
 * Page numbers for a list the server paginates.
 *
 * The page lives in the address bar, so a result you found on page three is
 * still on page three when you come back to the link — which is the whole
 * reason to number them rather than to keep loading more.
 */
function Pagination({ page, pages, onChange }) {
  const { t } = useLocale()
  if (pages <= 1) return null

  const step = 'flex size-9 shrink-0 items-center justify-center rounded-md text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <nav aria-label={t('pagination.label')} className="mt-8 flex items-center justify-center gap-1">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label={t('pagination.previous')}
        className={`${step} border border-border bg-surface text-text-secondary hover:bg-surface-secondary`}
      >
        <ChevronLeft aria-hidden="true" size={16} />
      </button>

      {pageWindow(page, pages).map((entry, index) =>
        entry === 'gap' ? (
          <span key={`gap-${index}`} aria-hidden="true" className="px-1 text-sm text-text-muted">
            …
          </span>
        ) : (
          <button
            key={entry}
            type="button"
            onClick={() => onChange(entry)}
            aria-current={entry === page ? 'page' : undefined}
            className={`${step} ${
              entry === page
                ? 'bg-primary font-medium text-white'
                : 'border border-border bg-surface text-text-secondary hover:bg-surface-secondary'
            }`}
          >
            {entry}
          </button>
        ),
      )}

      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= pages}
        aria-label={t('pagination.next')}
        className={`${step} border border-border bg-surface text-text-secondary hover:bg-surface-secondary`}
      >
        <ChevronRight aria-hidden="true" size={16} />
      </button>
    </nav>
  )
}

export default Pagination
