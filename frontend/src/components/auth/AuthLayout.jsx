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
function AuthLayout({ title, subtitle, children, footer, progress, width = 'default', step }) {
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
            className="group mx-auto mb-7 flex w-fit items-center gap-2 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <BrandMark />
            <span className="text-lg font-semibold tracking-tight text-text-primary">
              RentHouse
            </span>
          </Link>

          <div className="animate-auth-in rounded-2xl border border-border bg-surface p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_16px_40px_-16px_rgba(15,23,42,0.18)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.3),0_20px_48px_-20px_rgba(0,0,0,0.6)] sm:p-8">
            {progress ? <div className="mb-7">{progress}</div> : null}

            {/* Keyed on the step so React remounts this block when the stage
                changes, replaying the entrance. That is what turns a step
                change into a transition rather than an instant swap. */}
            <div key={step} className={step ? 'animate-auth-step' : undefined}>
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
      className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors duration-200 group-hover:bg-primary/15"
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
 * Background atmosphere: a faint architectural grid and two slowly drifting
 * glows.
 *
 * The two themes are treated separately rather than one being an inversion of
 * the other. Dark mode carries emerald light against deep navy — the glows can
 * be relatively tight and saturated because they read as light in a dark room.
 * Light mode uses larger, softer, much fainter washes with a cool cyan on one
 * side, because on a near-white ground a tight coloured blob looks like a
 * smudge rather than illumination.
 *
 * Everything here is `pointer-events-none` and sits behind the card, so none of
 * it can intercept a click or shift the layout.
 */
function BackgroundDecoration() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Grid, masked so it never reaches the card. Lighter in dark mode, where
          a bright line on a dark ground is far more visible per unit opacity. */}
      <div
        className="animate-grid absolute inset-0 [--grid-opacity:0.5] dark:[--grid-opacity:0.3]"
        style={{
          opacity: 'var(--grid-opacity)',
          backgroundImage:
            'linear-gradient(to right, var(--color-border) 1px, transparent 1px),' +
            'linear-gradient(to bottom, var(--color-border) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'radial-gradient(ellipse 78% 58% at 50% 42%, transparent 32%, black 100%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 78% 58% at 50% 42%, transparent 32%, black 100%)',
        }}
      />

      {/* Upper-left. Light mode: a wide, very faint emerald wash. Dark mode: a
          tighter, brighter emerald. */}
      <div
        className="animate-glow-a absolute -left-[18%] -top-[22%] size-[38rem] rounded-full blur-3xl
                   bg-[radial-gradient(circle,rgba(16,185,129,0.10)_0%,rgba(16,185,129,0.04)_45%,transparent_70%)]
                   dark:size-[30rem] dark:bg-[radial-gradient(circle,rgba(16,185,129,0.20)_0%,rgba(16,185,129,0.07)_45%,transparent_70%)]"
      />

      {/* Lower-right, on a different cycle. Light mode leans cyan so the two
          washes are not the same colour twice; dark mode stays emerald. */}
      <div
        className="animate-glow-b absolute -bottom-[26%] -right-[16%] size-[42rem] rounded-full blur-3xl
                   bg-[radial-gradient(circle,rgba(20,184,166,0.09)_0%,rgba(16,185,129,0.03)_45%,transparent_70%)]
                   dark:size-[34rem] dark:bg-[radial-gradient(circle,rgba(16,185,129,0.16)_0%,rgba(20,184,166,0.05)_45%,transparent_70%)]"
      />

      {/* Light mode only: a broad neutral lift behind the card so it sits on a
          faint pool of light rather than a flat sheet. Removed in dark mode,
          where the card's own surface already separates it from the ground. */}
      <div className="absolute left-1/2 top-1/2 size-[46rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.75)_0%,transparent_65%)] blur-2xl dark:hidden" />
    </div>
  )
}

export default AuthLayout
