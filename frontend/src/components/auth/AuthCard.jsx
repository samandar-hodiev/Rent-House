// The surface every auth screen is drawn on.
//
// Slightly translucent with a light backdrop blur so the ambient glows behind
// it register as depth rather than being hidden — but only just. Heavy
// glassmorphism would put a texture between the reader and a six-digit code,
// which is the opposite of what this screen is for.
function AuthCard({ children }) {
  return (
    <div
      className="animate-auth-in rounded-2xl border border-border bg-surface/95 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_44px_-18px_rgba(15,23,42,0.20)] backdrop-blur-sm
                 dark:border-white/[0.08] dark:bg-surface/80 dark:shadow-[0_1px_2px_rgba(0,0,0,0.3),0_24px_56px_-24px_rgba(0,0,0,0.7)]
                 sm:p-8"
    >
      {children}
    </div>
  )
}

export default AuthCard
