import { Link } from 'react-router-dom'
import { ROUTES } from '../../routes/paths'

// An architectural glyph — a roofline over a window — rather than a literal
// house icon. Inline SVG so it inherits the theme's primary colour and costs
// no request.
function BrandMark() {
  return (
    <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15 transition-colors duration-200 group-hover:bg-primary/[0.16]">
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="size-[1.125rem]">
        <path d="M3 8.5 10 3l7 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 10v6.5h10V10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8.75 16.5v-3.75h2.5v3.75" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

// Sits above the card on every auth screen. Compact on purpose — it identifies
// the product, it is not the subject of the page.
function AuthBrand() {
  return (
    <Link
      to={ROUTES.home}
      className="group mx-auto mb-7 flex w-fit items-center gap-2.5 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-background"
    >
      <BrandMark />
      <span className="text-[1.0625rem] font-semibold tracking-tight text-text-primary">
        RentHouse
      </span>
    </Link>
  )
}

export default AuthBrand
