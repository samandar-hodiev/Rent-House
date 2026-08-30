import { useRef, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Map } from 'lucide-react'
import { ROUTES } from '../routes/paths'
import { useLocale } from '../context/LocaleContext'
import { useSiteSettings } from '../context/SiteSettingsContext'
import { useAuth } from '../context/AuthContext'
import { useDismiss } from '../hooks/useDismiss'
import {
  MOBILE_ICON_SIZE,
  mobileMenuGroupClass,
  mobileNavLinkClass,
  mobilePrimaryButtonClass,
  mobileSecondaryButtonClass,
} from './headerMenuStyles'
import Container from './Container'
import SearchBar from './SearchBar'
import LanguageSelector from './LanguageSelector'
import ThemeToggle from './ThemeToggle'
import AuthedHeaderActions from './AuthedHeaderActions'

const navLinkClass = ({ isActive }) =>
  `text-sm font-medium transition-colors hover:text-primary ${
    isActive ? 'text-primary' : 'text-text-secondary'
  }`

function MenuIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-5">
      <path
        fillRule="evenodd"
        d="M3 5.75A.75.75 0 0 1 3.75 5h12.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 5.75Zm0 4.25a.75.75 0 0 1 .75-.75h12.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 10Zm.75 3.5a.75.75 0 0 0 0 1.5h12.5a.75.75 0 0 0 0-1.5H3.75Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-5">
      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
    </svg>
  )
}

function Header() {
  const { t } = useLocale()
  // The marketplace's own name, as its owner set it — never a string
  // written into the interface.
  const { settings } = useSiteSettings()
  const brand = settings.site_brand_name || settings.site_name
  const { isAuthenticated } = useAuth()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef(null)

  const closeMenu = () => setIsMenuOpen(false)
  useDismiss(menuRef, isMenuOpen, closeMenu)

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface">
      <Container>
        {/* Desktop: single row, approved order and functionality unchanged */}
        {/* Saved apartments moved to the account sidebar, so the row carries one
            link fewer and the search field takes the space back — it is the
            control people actually came to the header to use. */}
        <div className="hidden h-20 items-center gap-8 xl:flex">
          <Link
            to={ROUTES.home}
            className="shrink-0 text-lg font-semibold tracking-tight text-text-primary"
          >
            {brand}
          </Link>

          <SearchBar />

          <nav aria-label="Asosiy navigatsiya" className="flex shrink-0 items-center gap-7">
            <NavLink to={ROUTES.map} className={navLinkClass}>
              {t('header.mapNav')}
            </NavLink>
            <ThemeToggle />
            <LanguageSelector />
            {isAuthenticated ? (
              <AuthedHeaderActions />
            ) : (
              <>
                <NavLink to={ROUTES.login} className={navLinkClass}>
                  {t('header.login')}
                </NavLink>
                <Link
                  to={ROUTES.register}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {t('header.register')}
                </Link>
              </>
            )}
          </nav>
        </div>

        {/* Medium desktop: the same header in two rows.
            Between `lg` and `xl` the one-row layout does not fit, but a
            hamburger is the wrong answer — there is room for every control,
            just not on one line. The navigation stays visible and the search
            takes a row of its own, where it gets more width than it had on the
            wide layout rather than less. Below `lg` the drawer is genuinely
            needed and is left alone. */}
        <div className="hidden lg:block xl:hidden">
          <div className="flex h-16 items-center justify-between gap-6">
            <Link
              to={ROUTES.home}
              className="shrink-0 text-lg font-semibold tracking-tight text-text-primary"
            >
              {brand}
            </Link>

            {/* The same components the wide header uses, in the same order —
                this is one layout in two shapes, not a second header. */}
            <nav
              aria-label="Asosiy navigatsiya"
              className="flex shrink-0 items-center gap-5"
            >
              <NavLink to={ROUTES.map} className={navLinkClass}>
                {t('header.mapNav')}
              </NavLink>
              <ThemeToggle />
              <LanguageSelector />
              {isAuthenticated ? (
                <AuthedHeaderActions />
              ) : (
                <>
                  <NavLink to={ROUTES.login} className={navLinkClass}>
                    {t('header.login')}
                  </NavLink>
                  <Link
                    to={ROUTES.register}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {t('header.register')}
                  </Link>
                </>
              )}
            </nav>
          </div>

          <div className="pb-3">
            <SearchBar />
          </div>
        </div>

        {/* Tablet & mobile: logo + language + menu toggle, search on its own row */}
        <div ref={menuRef} className="lg:hidden">
          <div className="flex h-16 items-center justify-between gap-3">
            <Link
              to={ROUTES.home}
              className="shrink-0 text-lg font-semibold tracking-tight text-text-primary"
            >
              {brand}
            </Link>

            <div className="flex shrink-0 items-center gap-1">
              <ThemeToggle />
              <LanguageSelector />
              <button
                type="button"
                onClick={() => setIsMenuOpen((open) => !open)}
                aria-expanded={isMenuOpen}
                aria-controls="mobile-nav-menu"
                aria-label={t('header.menuLabel')}
                className="flex size-9 items-center justify-center rounded-md text-text-secondary hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {isMenuOpen ? <CloseIcon /> : <MenuIcon />}
              </button>
            </div>
          </div>

          <div className="pb-3">
            <SearchBar />
          </div>

          {isMenuOpen ? (
            <nav
              id="mobile-nav-menu"
              aria-label="Asosiy navigatsiya"
              className="flex flex-col gap-1 border-t border-border py-3"
            >
              {/* Where you can go. Saved apartments are no longer here: they
                  belong to the account, and the account area's own navigation
                  owns them. */}
              <NavLink to={ROUTES.map} className={mobileNavLinkClass} onClick={closeMenu}>
                <Map aria-hidden="true" size={MOBILE_ICON_SIZE} className="shrink-0" />
                <span className="truncate">{t('header.mapNav')}</span>
              </NavLink>

              {/* What you can do about your account, set apart by a hairline so
                  the split between navigating and acting is readable at a
                  glance without the rule itself drawing attention. */}
              {isAuthenticated ? (
                <AuthedHeaderActions variant="mobile" onNavigate={closeMenu} />
              ) : (
                <div className={mobileMenuGroupClass}>
                  <Link
                    to={ROUTES.login}
                    onClick={closeMenu}
                    className={mobileSecondaryButtonClass}
                  >
                    {t('header.login')}
                  </Link>
                  <Link
                    to={ROUTES.register}
                    onClick={closeMenu}
                    className={mobilePrimaryButtonClass}
                  >
                    {t('header.register')}
                  </Link>
                </div>
              )}
            </nav>
          ) : null}
        </div>
      </Container>
    </header>
  )
}

export default Header
