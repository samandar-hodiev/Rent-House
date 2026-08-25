import { Check, Moon, Sun } from 'lucide-react'
import { AdminCard, PageHeading } from '../../components/admin/adminUi'
import { useAdmin } from '../../context/AdminSettingsContext'
import { LANGUAGES } from '../../locales/languages'

// Only the languages the admin dictionary is written in, which is the same
// three the site offers.
const THEMES = [
  { value: 'light', icon: Sun, key: 'dashboardSettings.light' },
  { value: 'dark', icon: Moon, key: 'dashboardSettings.dark' },
]

const OPTION =
  'flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary'
const SELECTED = 'border-primary bg-primary-light font-medium text-primary-hover dark:text-primary'
const UNSELECTED =
  'border-border text-text-secondary hover:bg-surface-secondary hover:text-text-primary'

function Section({ title, hint, children }) {
  return (
    <AdminCard title={title}>
      <div className="flex flex-col gap-2 p-4">
        {children}
        {hint ? <p className="text-xs text-text-muted">{hint}</p> : null}
      </div>
    </AdminCard>
  )
}

/**
 * The admin dashboard's own appearance and language.
 *
 * Two settings and no more. Both are scoped to this dashboard: the theme is a
 * class on the admin root rather than on the document, and the language comes
 * from a dictionary only the admin area reads. Neither touches what a visitor
 * to RentHouse sees, and neither is the "Default language" under Settings →
 * General, which is about the public site and is a different thing entirely.
 */
function AdminDashboardSettingsPage() {
  const { t, theme, setTheme, locale, setLocale } = useAdmin()

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeading
        title={t('dashboardSettings.title')}
        description={t('dashboardSettings.description')}
      />

      <Section
        title={t('dashboardSettings.appearance')}
        hint={t('dashboardSettings.themeHint')}
      >
        <p className="text-xs font-medium text-text-muted">{t('dashboardSettings.theme')}</p>
        <div className="grid grid-cols-2 gap-2">
          {THEMES.map((option) => {
            const isActive = theme === option.value
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setTheme(option.value)}
                aria-pressed={isActive}
                className={`${OPTION} ${isActive ? SELECTED : UNSELECTED}`}
              >
                <option.icon aria-hidden="true" size={15} className="shrink-0" />
                {t(option.key)}
                {isActive ? <Check aria-hidden="true" size={14} className="shrink-0" /> : null}
              </button>
            )
          })}
        </div>
      </Section>

      <Section
        title={t('dashboardSettings.language')}
        hint={t('dashboardSettings.languageHint')}
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {LANGUAGES.map((language) => {
            const isActive = locale === language.code
            return (
              <button
                key={language.code}
                type="button"
                onClick={() => setLocale(language.code)}
                aria-pressed={isActive}
                className={`${OPTION} ${isActive ? SELECTED : UNSELECTED}`}
              >
                <span aria-hidden="true">{language.flag}</span>
                {/* The full name, not the code: this page has the room for it,
                    and it is the setting itself rather than a control squeezed
                    into a sidebar. */}
                <span className="min-w-0 truncate">{language.label}</span>
                {isActive ? <Check aria-hidden="true" size={14} className="shrink-0" /> : null}
              </button>
            )
          })}
        </div>
      </Section>
    </div>
  )
}

export default AdminDashboardSettingsPage
