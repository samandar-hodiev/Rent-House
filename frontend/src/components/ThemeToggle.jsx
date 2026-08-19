import { Moon, Sun } from 'lucide-react'
import { useLocale } from '../context/LocaleContext'
import { useTheme } from '../context/ThemeContext'

// Light/Dark switch shared by the public header and the account header, so
// there is one toggle implementation and one ThemeContext behind it.
function ThemeToggle({ className = '' }) {
  const { t } = useLocale()
  const { resolvedTheme, setTheme } = useTheme()

  const isDark = resolvedTheme === 'dark'
  const label = isDark ? t('theme.toggleToLight') : t('theme.toggleToDark')

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={label}
      title={label}
      className={`flex size-9 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${className}`}
    >
      {isDark ? <Sun aria-hidden="true" size={18} /> : <Moon aria-hidden="true" size={18} />}
    </button>
  )
}

export default ThemeToggle
