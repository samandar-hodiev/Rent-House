import { Link, NavLink, useNavigate } from 'react-router-dom'
import { ROUTES } from '../routes/paths'
import Container from './Container'

const navLinkClass = ({ isActive }) =>
  `text-sm font-medium transition-colors hover:text-primary ${
    isActive ? 'text-primary' : 'text-text-secondary'
  }`

function Header() {
  const navigate = useNavigate()

  const handleSearchSubmit = (event) => {
    event.preventDefault()
    navigate(ROUTES.search)
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface">
      <Container className="flex h-16 items-center gap-6">
        <Link
          to={ROUTES.home}
          className="shrink-0 text-lg font-semibold tracking-tight text-text-primary"
        >
          RentHouse
        </Link>

        <form
          role="search"
          onSubmit={handleSearchSubmit}
          className="flex min-w-0 flex-1 items-center overflow-hidden rounded-md border border-border bg-surface focus-within:ring-2 focus-within:ring-primary/40"
        >
          <button
            type="button"
            className="flex shrink-0 items-center gap-1 border-r border-border px-3 py-2 text-sm text-text-secondary hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Barcha tumanlardan
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="size-4 shrink-0"
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
                clipRule="evenodd"
              />
            </svg>
          </button>

          <label htmlFor="header-keyword-search" className="sr-only">
            Ko&apos;cha, metro yoki turar joy nomi bo&apos;yicha qidirish
          </label>
          <input
            id="header-keyword-search"
            type="search"
            placeholder="Ko'cha, metro yoki turar joy nomi..."
            className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
          />

          <button
            type="submit"
            className="shrink-0 bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Qidirish
          </button>
        </form>

        <nav aria-label="Asosiy navigatsiya" className="flex shrink-0 items-center gap-5">
          <NavLink to={ROUTES.map} className={navLinkClass}>
            Xarita
          </NavLink>
          <NavLink to={ROUTES.wishlist} className={navLinkClass}>
            Saqlangan uylar
          </NavLink>
          <NavLink to={ROUTES.login} className={navLinkClass}>
            Kirish
          </NavLink>
          <Link
            to={ROUTES.register}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Ro&apos;yxatdan o&apos;tish
          </Link>
        </nav>
      </Container>
    </header>
  )
}

export default Header
