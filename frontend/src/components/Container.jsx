// Large-desktop width: 1674px is exactly what five current-size apartment
// cards need on one row — 5 x 306px card + 4 x 24px gap + 2 x 24px padding.
// Expressed as a min-[] variant because a custom `--breakpoint-*` is ordered
// before Tailwind's built-in scale and would lose to `lg:` rules.
function Container({ children, className = '' }) {
  return (
    <div className={`mx-auto w-full max-w-336 px-4 sm:px-6 min-[1674px]:max-w-[1674px] ${className}`}>
      {children}
    </div>
  )
}

export default Container
