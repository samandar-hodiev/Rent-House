import AuthBackground from './AuthBackground'
import AuthBrand from './AuthBrand'
import AuthCard from './AuthCard'

/**
 * Full-screen shell for every authentication screen.
 *
 * Auth sits outside the application chrome: no header, no search, no footer. A
 * person signing in has exactly one job, and every other control on screen is a
 * way to fail at it.
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
      <AuthBackground />

      <div className="relative flex flex-1 flex-col items-center justify-center px-5 py-10 sm:px-6 sm:py-14">
        <div className={`w-full ${maxWidth}`}>
          <AuthBrand />

          <AuthCard>
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
          </AuthCard>

          {footer}
        </div>
      </div>
    </div>
  )
}

export default AuthLayout
