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
    <section
      className={`flex min-w-0 flex-col rounded-xl border border-border bg-surface ${className}`}
    >
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
      // `justify-center` matters as much as `items-center`: as a flex item in
      // a stretching column the pill takes the full width, and without it the
      // label sits against the left edge of a wide badge.
      className={`inline-flex shrink-0 items-center justify-center rounded-full px-2 py-0.5 text-center text-[11px] font-medium ${tint}`}
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
// `type` defaults to "button" because most of these sit outside a form and a
// stray submit would navigate. A form's own save button passes type="submit",
// so Enter in a field saves the way a keyboard user expects.
export function MockButton({
  children, tone = 'neutral', onClick, disabled = false, type = 'button',
}) {
  const tones = {
    neutral:
      'border border-border bg-surface text-text-primary hover:bg-surface-secondary',
    primary: 'bg-primary text-white hover:bg-primary-hover',
    // Taking access away and giving it back must not look alike.
    danger: 'border border-error/40 bg-error/10 text-error hover:bg-error/15',
    warning: 'border border-warning/40 bg-warning/15 text-warning hover:bg-warning/25',
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]}`}
    >
      {children}
    </button>
  )
}

/**
 * An on/off switch.
 *
 * A real `role="switch"` button rather than a styled checkbox: it announces its
 * state, takes the keyboard the way a button does, and carries the same green
 * the rest of the dashboard uses for "on". The label is supplied by the caller
 * through `labelledBy`, so the row's own heading names it and there is no
 * second copy of the text for a screen reader to read twice.
 */
export function Switch({ checked, onChange, labelledBy }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
        checked ? 'bg-primary hover:bg-primary-hover' : 'bg-border hover:bg-text-muted'
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-block size-3.5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-[18px]' : 'translate-x-[3px]'
        }`}
      />
    </button>
  )
}

/**
 * A select that keeps its arrow away from the edge.
 *
 * A native arrow is painted by the browser hard against the border, and no
 * amount of padding moves it — padding shifts the text, not the control. So the
 * native one is turned off and the same chevron is drawn as a background image,
 * positioned with room to breathe.
 */
export const ADMIN_SELECT =
  'h-9 shrink-0 appearance-none rounded-md border border-border bg-surface bg-no-repeat pl-2.5 pr-9 text-sm text-text-primary focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary'

// The chevron, inline so it needs no network request, and using currentColor so
// it follows the text in either theme.
export const ADMIN_SELECT_STYLE = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2364748B' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
  backgroundPosition: 'right 12px center',
  backgroundSize: '14px 14px',
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

// Numbers follow the admin's language — thousands separators differ and people
// read their own. Dates do not: Chromium renders `uz-UZ` as "2026 M08 22",
// which nobody writes and which reads differently from the same date elsewhere
// in the product. They are written out below instead, in the day-month-year
// order this product uses everywhere.
const DATE_LOCALE = { uz: 'uz-UZ', ru: 'ru-RU', en: 'en-GB' }

const pad = (value) => String(value).padStart(2, '0')

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
    formatDate: (iso) => {
      const at = new Date(iso)
      return `${pad(at.getDate())}.${pad(at.getMonth() + 1)}.${at.getFullYear()}`
    },
    formatDateTime: (iso) => {
      const at = new Date(iso)
      return `${pad(at.getDate())}.${pad(at.getMonth() + 1)}.${at.getFullYear()} ${pad(at.getHours())}:${pad(at.getMinutes())}`
    },
    formatNumber: (value) => value.toLocaleString(tag),
    formatMoney: (amount, currency) =>
      currency === 'USD'
        ? `$${amount.toLocaleString(tag)}`
        : `${amount.toLocaleString(tag)} ${t('format.sum')}`,
  }
}
