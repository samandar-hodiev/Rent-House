import { Link, NavLink } from 'react-router-dom'
import { ROUTES } from '../routes/paths'
import { useLocale } from '../context/LocaleContext'
import Container from './Container'
import SearchBar from './SearchBar'
import LanguageSelector from './LanguageSelector'

const navLinkClass = ({ isActive }) =>
  `text-sm font-medium transition-colors hover:text-primary ${
    isActive ? 'text-primary' : 'text-text-secondary'
  }`

function Header() {
  const { t } = useLocale()

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface">
      <Container className="flex h-16 items-center gap-6">
        <Link
          to={ROUTES.home}
          className="shrink-0 text-lg font-semibold tracking-tight text-text-primary"
        >
          {t('brand.name')}
        </Link>

        <SearchBar />

        <nav aria-label="Asosiy navigatsiya" className="flex shrink-0 items-center gap-5">
          <NavLink to={ROUTES.map} className={navLinkClass}>
            {t('header.mapNav')}
          </NavLink>
          <NavLink to={ROUTES.wishlist} className={navLinkClass}>
            {t('header.wishlistNav')}
          </NavLink>
          <NavLink to={ROUTES.login} className={navLinkClass}>
            {t('header.login')}
          </NavLink>
          <Link
            to={ROUTES.register}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t('header.register')}
          </Link>
          <LanguageSelector />
        </nav>
      </Container>
    </header>
  )
}

export default Header
