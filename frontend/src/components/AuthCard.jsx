// Centered card shell shared by the Login and Register pages, so both keep an
// identical frame, heading rhythm and footer link.
function AuthCard({ title, subtitle, children, footer }) {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10 sm:py-16">
      <div className="w-full max-w-100 rounded-xl border border-border bg-surface p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold text-text-primary">{title}</h1>
        {subtitle ? <p className="mt-1.5 text-sm text-text-secondary">{subtitle}</p> : null}

        {children}

        {footer ? (
          <div className="mt-6 border-t border-border pt-4 text-center text-sm text-text-secondary">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default AuthCard
