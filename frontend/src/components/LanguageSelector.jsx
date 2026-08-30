import { useRef, useState } from 'react'
import { LANGUAGES } from '../locales/languages'
import { useDismiss } from '../hooks/useDismiss'
import { useLocale } from '../context/LocaleContext'

function LanguageSelector() {
  const { locale, setLocale, t } = useLocale()
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef(null)

  const close = () => setIsOpen(false)
  useDismiss(containerRef, isOpen, close)

  const current = LANGUAGES.find((language) => language.code === locale) ?? LANGUAGES[0]

  const handleSelect = (code) => {
    setLocale(code)
    close()
  }


  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label={t('header.languageLabel')}
        className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-text-secondary hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span aria-hidden="true">{current.flag}</span>
        <span className="font-medium uppercase">{current.code}</span>
      </button>

      {isOpen ? (
        <ul
          role="menu"
          aria-label={t('header.languageLabel')}
          className="absolute right-0 top-full z-40 mt-2 w-40 rounded-md border border-border bg-surface p-1 shadow-md"
        >
          {LANGUAGES.map((language) => (
            <li key={language.code} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => handleSelect(language.code)}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-surface-secondary ${
                  language.code === locale
                    ? 'font-medium text-primary'
                    : 'text-text-primary'
                }`}
              >
                <span aria-hidden="true">{language.flag}</span>
                {language.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export default LanguageSelector
