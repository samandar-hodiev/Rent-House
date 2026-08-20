import { Link } from 'react-router-dom'
import { ROUTES } from '../../routes/paths'

/**
 * Full-screen shell for every authentication screen.
 *
 * Auth deliberately sits outside the application chrome: no header, no search,
 * no footer. A person signing in has exactly one job, and every other control
 * on screen is a way to fail at it.
 *
 * All four screens — login, contact, code, profile — share this frame, so the
 * card never jumps position or changes width as the user moves between steps.
 */
function AuthLayout({ title, subtitle, children, footer, progress, width = 'default' }) {
  // The profile step carries four fields and reads better a little wider; the
  // code step is deliberately narrow so the six boxes stay a comfortable size.
  const maxWidth = {
    narrow: 'max-w-[26rem]',
    default: 'max-w-[27.5rem]',
    wide: 'max-w-[30rem]',
  }[width]

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background">
      <BackgroundDecoration />

      <div className="relative flex flex-1 flex-col items-center justify-center px-5 py-10 sm:px-6 sm:py-14">
        <div className={`w-full ${maxWidth}`}>
          {/* Restrained wordmark: present, not shouting. */}
          <Link
            to={ROUTES.home}
            className="mx-auto mb-7 flex w-fit items-center gap-2 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <BrandMark />
            <span className="text-lg font-semibold tracking-tight text-text-primary">
              RentHouse
            </span>
          </Link>

          <div className="animate-auth-in rounded-2xl border border-border bg-surface p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-12px_rgba(15,23,42,0.12)] sm:p-8">
            {progress ? <div className="mb-7">{progress}</div> : null}

            <div className="mb-6">
              <h1 className="text-[1.375rem] font-semibold leading-tight tracking-tight text-text-primary sm:text-2xl">
                {title}
              </h1>
              {subtitle ? (
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">{subtitle}</p>
              ) : null}
            </div>

            {children}
          </div>

          {footer ? (
            <p className="mt-6 text-center text-sm text-text-secondary">{footer}</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// A small architectural glyph — a roofline over a window — rather than a
// literal house icon. Inline SVG so it inherits the theme's primary colour and
// costs no request.
function BrandMark() {
  return (
    <span
      aria-hidden="true"
      className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary"
    >
      <svg viewBox="0 0 20 20" fill="none" className="size-[1.125rem]">
        <path
          d="M3 8.5 10 3l7 5.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M5 10v6.5h10V10"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M8.75 16.5v-3.75h2.5v3.75" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

/**
 * Background treatment: two soft primary-tinted glows and a faint grid.
 *
 * Kept very low-contrast on purpose — the form is the subject, and a background
 * that competes with a six-digit code field is a background that has failed.
 * `pointer-events-none` so none of it can intercept a click.
 */
function BackgroundDecoration() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Architectural grid, fading out before it reaches the card. */}
      <div
        className="absolute inset-0 opacity-[0.55] dark:opacity-[0.35]"
        style={{
          backgroundImage:
            'linear-gradient(to right, var(--color-border) 1px, transparent 1px),' +
            'linear-gradient(to bottom, var(--color-border) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'radial-gradient(ellipse 80% 60% at 50% 40%, transparent 35%, black 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 40%, transparent 35%, black 100%)',
        }}
      />

      {/* Two glows, offset so the light feels directional rather than centred. */}
      <div className="absolute -left-32 -top-32 size-[26rem] rounded-full bg-primary/[0.07] blur-3xl dark:bg-primary/[0.10]" />
      <div className="absolute -bottom-40 -right-24 size-[30rem] rounded-full bg-primary/[0.05] blur-3xl dark:bg-primary/[0.08]" />
    </div>
  )
}

export default AuthLayout
