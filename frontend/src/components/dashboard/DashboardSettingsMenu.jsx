import { useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Settings } from 'lucide-react'
import { useLocale } from '../../context/LocaleContext'
import { useTheme } from '../../context/ThemeContext'
import { useDismiss } from '../../hooks/useDismiss'
import { LANGUAGES } from '../../locales/languages'
import { ROUTES } from '../../routes/paths'
import { NAV_ITEM_BASE, NAV_ITEM_IDLE } from './DashboardNavItem'

const VIEWPORT_MARGIN = 12

// Settings is a popover next to its sidebar entry rather than a body section.
function DashboardSettingsMenu({ onNavigate }) {
  const { t, locale, setLocale } = useLocale()
  const { resolvedTheme, setTheme } = useTheme()
  const navigate = useNavigate()

  const [isOpen, setIsOpen] = useState(false)
  const [maxHeight, setMaxHeight] = useState(null)
  const containerRef = useRef(null)
  const triggerRef = useRef(null)

  const close = () => setIsOpen(false)
  useDismiss(containerRef, isOpen, close)

  // Settings sits at the bottom of the sidebar, so the popover always opens
  // upward. Cap its height to the space above the trigger so it can never run
  // past the top of the viewport.
  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setMaxHeight(Math.max(rect.top - VIEWPORT_MARGIN * 2, 160))
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
          style={maxHeight ? { maxHeight } : undefined}
          className="absolute inset-x-0 bottom-full z-40 mb-2 overflow-y-auto rounded-md border border-border bg-surface p-3 shadow-md"
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
                // The full name is what the option means; the code is what it
                // says. Announced in full for anyone who cannot see the flag.
                title={language.label}
                aria-label={language.label}
              >
                {/* Flag and code rather than "O'zbekcha", "Русский",
                    "English". This popover is exactly as wide as the sidebar
                    it hangs off — 224px — and three full names in a row do not
                    fit, so they pushed past its edge. The names are the longest
                    thing in here and the only thing that had to give; the
                    sidebar's width is not the problem and is left alone. */}
                <span aria-hidden="true">{language.flag}</span>
                <span aria-hidden="true">{language.code.toUpperCase()}</span>
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
