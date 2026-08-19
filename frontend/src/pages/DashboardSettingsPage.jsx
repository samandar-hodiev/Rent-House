import { useState } from 'react'
import { Check } from 'lucide-react'
import FormField from '../components/FormField'
import UserAvatar from '../components/dashboard/UserAvatar'
import { useLocale } from '../context/LocaleContext'
import { useTheme } from '../context/ThemeContext'
import { CURRENT_USER } from '../data/currentUser'
import { LANGUAGES } from '../locales/languages'

function SettingsCard({ title, children }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
      <h2 className="text-base font-semibold text-text-primary">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

// Single-select row used by both the language and appearance choosers.
function OptionRow({ label, isActive, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isActive}
      className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        isActive
          ? 'border-primary bg-primary-light font-medium text-primary-hover dark:text-primary'
          : 'border-border text-text-secondary hover:bg-surface-secondary hover:text-text-primary'
      }`}
    >
      {label}
      {isActive ? <Check aria-hidden="true" size={16} /> : null}
    </button>
  )
}

function DashboardSettingsPage() {
  const { t, locale, setLocale } = useLocale()
  const { theme, setTheme } = useTheme()

  const [profile, setProfile] = useState({
    name: CURRENT_USER.name,
    email: CURRENT_USER.email,
    phone: CURRENT_USER.phone,
  })
  const [isSaved, setIsSaved] = useState(false)

  const setField = (field) => (value) => {
    setProfile((current) => ({ ...current, [field]: value }))
    setIsSaved(false)
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    // UI only: nothing is persisted yet.
    setIsSaved(true)
  }

  const themeOptions = [
    { value: 'light', label: t('dashboard.themeLight') },
    { value: 'dark', label: t('dashboard.themeDark') },
    { value: 'system', label: t('dashboard.themeSystem') },
  ]

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-xl font-semibold text-text-primary">{t('dashboard.settingsTitle')}</h1>

      <SettingsCard title={t('dashboard.settingsProfile')}>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <UserAvatar name={profile.name || CURRENT_USER.name} size="lg" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary">{t('dashboard.avatar')}</p>
              <p className="mt-0.5 text-xs text-text-muted">{t('dashboard.avatarHint')}</p>
            </div>
          </div>

          <FormField label={t('auth.name')} value={profile.name} onChange={setField('name')} autoComplete="name" />
          <FormField
            label={t('auth.email')}
            type="email"
            value={profile.email}
            onChange={setField('email')}
            autoComplete="email"
            inputMode="email"
          />
          <FormField
            label={t('auth.phone')}
            type="tel"
            value={profile.phone}
            onChange={setField('phone')}
            autoComplete="tel"
            inputMode="tel"
          />

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:w-auto"
            >
              {t('dashboard.saveChanges')}
            </button>
            {isSaved ? (
              <p role="status" className="text-xs text-text-muted">
                {t('dashboard.saveNote')}
              </p>
            ) : null}
          </div>
        </form>
      </SettingsCard>

      {/* Reuses the existing LocaleContext — no second language mechanism. */}
      <SettingsCard title={t('dashboard.settingsLanguage')}>
        <div className="grid gap-2 sm:grid-cols-3">
          {LANGUAGES.map((language) => (
            <OptionRow
              key={language.code}
              label={`${language.flag} ${language.label}`}
              isActive={locale === language.code}
              onSelect={() => setLocale(language.code)}
            />
          ))}
        </div>
      </SettingsCard>

      <SettingsCard title={t('dashboard.settingsAppearance')}>
        <div className="grid gap-2 sm:grid-cols-3">
          {themeOptions.map((option) => (
            <OptionRow
              key={option.value}
              label={option.label}
              isActive={theme === option.value}
              onSelect={() => setTheme(option.value)}
            />
          ))}
        </div>
      </SettingsCard>
    </div>
  )
}

export default DashboardSettingsPage
