import { useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Settings } from 'lucide-react'
import { useLocale } from '../../context/LocaleContext'
import { useTheme } from '../../context/ThemeContext'
import { useDismiss } from '../../hooks/useDismiss'
import { LANGUAGES } from '../../locales/languages'
import { ROUTES } from '../../routes/paths'
import { NAV_ITEM_BASE, NAV_ITEM_IDLE } from './DashboardNavItem'

const MENU_HEIGHT_ESTIMATE = 230

// Settings is a popover next to its sidebar entry rather than a body section.
function DashboardSettingsMenu({ onNavigate }) {
  const { t, locale, setLocale } = useLocale()
  const { resolvedTheme, setTheme } = useTheme()
  const navigate = useNavigate()

  const [isOpen, setIsOpen] = useState(false)
  const [placement, setPlacement] = useState('bottom')
  const containerRef = useRef(null)
  const triggerRef = useRef(null)

  const close = () => setIsOpen(false)
  useDismiss(containerRef, isOpen, close)

  // Prefer opening below; flip above when the viewport has no room.
  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const below = window.innerHeight - rect.bottom
    setPlacement(below < MENU_HEIGHT_ESTIMATE && rect.top > below ? 'top' : 'bottom')
  }, [isOpen])

  const themeOptions = [
    { value: 'light', label: t('dashboard.themeLight') },
    { value: 'dark', label: t('dashboard.themeDark') },
  ]

  const optionClass = (isActive) =>
    `flex flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
      isActive
        ? 'border-primary bg-primary-light font-medium text-primary-hover dark:text-primary'
        : 'border-border text-text-secondary hover:bg-surface-secondary hover:text-text-primary'
    }`

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className={`${NAV_ITEM_BASE} w-full ${NAV_ITEM_IDLE}`}
      >
        <Settings aria-hidden="true" size={18} />
        <span className="flex-1 text-left">{t('dashboard.settings')}</span>
      </button>

      {isOpen ? (
        <div
          role="dialog"
          aria-label={t('dashboard.settingsMenu')}
          className={`absolute inset-x-0 z-40 rounded-md border border-border bg-surface p-3 shadow-md ${
            placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}
        >
          <p className="text-xs font-medium text-text-muted">{t('dashboard.language')}</p>
          <div className="mt-1.5 flex gap-1.5">
            {LANGUAGES.map((language) => (
              <button
                key={language.code}
                type="button"
                onClick={() => setLocale(language.code)}
                aria-pressed={locale === language.code}
                className={optionClass(locale === language.code)}
              >
                {language.label}
              </button>
            ))}
          </div>

          <p className="mt-3 text-xs font-medium text-text-muted">{t('dashboard.theme')}</p>
          <div className="mt-1.5 flex gap-1.5">
            {themeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setTheme(option.value)}
                aria-pressed={resolvedTheme === option.value}
                className={optionClass(resolvedTheme === option.value)}
              >
                {option.label}
                {resolvedTheme === option.value ? (
                  <Check aria-hidden="true" size={12} />
                ) : null}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              close()
              onNavigate?.()
              navigate(ROUTES.dashboardEditProfile)
            }}
            className="mt-3 w-full rounded-md border-t border-border pt-3 text-left text-sm font-medium text-text-primary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t('dashboard.editProfile')}
          </button>
        </div>
      ) : null}
    </div>
  )
}

export default DashboardSettingsMenu
