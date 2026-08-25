import { Link } from 'react-router-dom'
import { LISTING_STATUS_CLASS } from '../../data/listingStatus'
import { useAdmin } from '../../context/AdminSettingsContext'

/**
 * The small pieces every admin screen is built from.
 *
 * Kept together because they are the admin's visual vocabulary — a card, a
 * table, a badge — and because each is a few lines. Splitting them into a file
 * apiece would mean fifteen imports on every page to save nothing.
 *
 * All of them use the tokens the rest of RentHouse uses. There is no admin
 * palette: the dashboard is the same product seen from the other side.
 */

/** A titled block. Everything on an admin page sits in one of these. */
export function AdminCard({ title, action, children, className = '' }) {
  return (
    // `min-w-0` because these sit in grids and a grid item's default minimum is
    // its content: a table wider than its column would otherwise push the whole
    // row past the page instead of scrolling inside itself.
    <section className={`min-w-0 rounded-xl border border-border bg-surface ${className}`}>
      {title ? (
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
          {action}
        </header>
      ) : null}
      {children}
    </section>
  )
}

/** One figure on the dashboard. */
export function StatCard({ icon, label, value, hint }) {
  const { formatNumber } = useAdminFormat()
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-light text-primary-hover dark:text-primary">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs text-text-muted">{label}</p>
        <p className="mt-0.5 text-xl font-semibold tabular-nums text-text-primary">
          {typeof value === 'number' ? formatNumber(value) : value}
        </p>
        {hint ? <p className="mt-0.5 truncate text-[11px] text-text-muted">{hint}</p> : null}
      </div>
    </div>
  )
}

// Tints for the states the admin sees that a listing does not have. Listing
// statuses come from the shared map so a colour means the same thing here as
// it does on the owner's own dashboard.
const BADGE_TINTS = {
  active: 'bg-primary-light text-primary-hover dark:text-primary',
  blocked: 'bg-error/10 text-error',
  inactive: 'bg-surface-secondary text-text-muted',
  pending: 'bg-warning/15 text-warning',
  resolved: 'bg-primary-light text-primary-hover dark:text-primary',
  rejected: 'bg-error/10 text-error',
  reported: 'bg-warning/15 text-warning',
  archived: 'bg-surface-secondary text-text-muted',
  success: 'bg-primary-light text-primary-hover dark:text-primary',
  failed: 'bg-error/10 text-error',
}

export function StatusBadge({ status }) {
  const { t } = useAdmin()
  const tint = LISTING_STATUS_CLASS[status] ?? BADGE_TINTS[status] ?? BADGE_TINTS.inactive
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${tint}`}
    >
      {/* Every state a badge can show — a listing's and a user's alike — has a
          `status.*` entry, so the badge translates itself and no caller has to
          pass a label. */}
      {t(`status.${status}`)}
    </span>
  )
}

/**
 * A table that scrolls sideways rather than squashing.
 *
 * Admin tables carry more columns than a phone is wide, and the alternative to
 * a scroll is either truncating every cell to nothing or reflowing into cards
 * that lose the comparison a table exists for.
 */
export function AdminTable({ headers, children, empty }) {
  if (empty) return empty
  return (
    <div className="chat-scroll overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border">
            {headers.map((header) => (
              <th
                key={header}
                scope="col"
                className="whitespace-nowrap px-4 py-2.5 text-xs font-medium text-text-muted"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export function Row({ children }) {
  return (
    <tr className="border-b border-border last:border-0 hover:bg-surface-secondary">{children}</tr>
  )
}

export function Cell({ children, className = '' }) {
  return <td className={`px-4 py-3 align-middle ${className}`}>{children}</td>
}

/** The one action every table row offers. */
export function ViewLink({ to }) {
  const { t } = useAdmin()
  return (
    <Link
      to={to}
      className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-text-primary transition-colors hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {t('action.view')}
    </Link>
  )
}

/** A button that looks like an action but only says it was pressed. */
export function MockButton({ children, tone = 'neutral', onClick }) {
  const tones = {
    neutral:
      'border border-border bg-surface text-text-primary hover:bg-surface-secondary',
    primary: 'bg-primary text-white hover:bg-primary-hover',
    danger: 'border border-error/40 bg-error/10 text-error hover:bg-error/15',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${tones[tone]}`}
    >
      {children}
    </button>
  )
}

/** Page title and, optionally, a line under it. */
export function PageHeading({ title, description, action }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-text-primary">{title}</h1>
        {description ? <p className="mt-0.5 text-sm text-text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}

// The admin language decides how dates and numbers read, so a month name is in
// the language the rest of the page is in. Uzbek has no widely supported CLDR
// data in every browser; `uz-UZ` falls back on its own when it is missing,
// which is better than pinning everyone to English.
const DATE_LOCALE = { uz: 'uz-UZ', ru: 'ru-RU', en: 'en-GB' }

/**
 * Dates and money in the admin's chosen language.
 *
 * A hook rather than plain functions because the formatting depends on a
 * setting, and reading that setting is what a hook is for. Every admin screen
 * that prints a date takes it from here, so one language switch moves all of
 * them together.
 */
export function useAdminFormat() {
  const { t, locale } = useAdmin()
  const tag = DATE_LOCALE[locale] ?? DATE_LOCALE.en

  return {
    formatDate: (iso) =>
      new Date(iso).toLocaleDateString(tag, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
    formatDateTime: (iso) =>
      new Date(iso).toLocaleString(tag, {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }),
    formatNumber: (value) => value.toLocaleString(tag),
    formatMoney: (amount, currency) =>
      currency === 'USD'
        ? `$${amount.toLocaleString(tag)}`
        : `${amount.toLocaleString(tag)} ${t('format.sum')}`,
  }
}
