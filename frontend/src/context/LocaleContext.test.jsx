import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The site's configuration is stubbed rather than fetched: what is under test
// is which language wins, not how the settings arrive.
const settings = { default_language: 'uz' }
let settingsState = 'ready'
vi.mock('./SiteSettingsContext', () => ({
  useSiteSettings: () => ({ settings, state: settingsState }),
}))

const { LocaleProvider, useLocale } = await import('./LocaleContext')

// Which language is in force, and a way to change it.
function Probe() {
  const { locale, setLocale } = useLocale()
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <button type="button" onClick={() => setLocale('en')}>English</button>
    </div>
  )
}

const show = () => render(<LocaleProvider><Probe /></LocaleProvider>)
const locale = () => screen.getByTestId('locale').textContent

describe('which language the site speaks', () => {
  beforeEach(() => {
    localStorage.clear()
    settings.default_language = 'uz'
    settingsState = 'ready'
  })

  it('follows the site for somebody who has never chosen', () => {
    settings.default_language = 'ru'
    show()
    expect(locale()).toBe('ru')
  })

  it('keeps a choice made against the same site default', async () => {
    settings.default_language = 'ru'
    const first = show()
    await userEvent.click(screen.getByRole('button', { name: 'English' }))
    expect(locale()).toBe('en')

    // A reload: the provider torn down and mounted again, reading only what
    // was stored.
    first.unmount()
    show()
    expect(locale()).toBe('en')
  })

  it('follows the site again once the owner changes it', () => {
    // Somebody chose English while the site opened in Russian...
    settings.default_language = 'ru'
    localStorage.setItem(
      'renthouse_locale', JSON.stringify({ locale: 'en', siteDefault: 'ru' }))

    // ...and then the owner switched the site to Uzbek. The choice was an
    // answer to a question the site no longer asks, so the new default wins.
    settings.default_language = 'uz'
    show()
    expect(locale()).toBe('uz')
  })

  it('ignores a value stored before choices remembered what they answered', () => {
    // Older versions stored the bare code. Such a value cannot say which site
    // default it was made against, so it is not treated as a choice.
    localStorage.setItem('renthouse_locale', 'en')
    settings.default_language = 'ru'
    show()
    expect(locale()).toBe('ru')
  })

  it('honours a stored choice until the configuration has been read', () => {
    // Before the settings arrive there is nothing to compare against, and
    // blanking the reader's language for a moment would make every page flash.
    settingsState = 'loading'
    localStorage.setItem(
      'renthouse_locale', JSON.stringify({ locale: 'en', siteDefault: 'ru' }))
    settings.default_language = 'uz'
    show()
    expect(locale()).toBe('en')
  })

  it('falls back to the project default when the site names a language it has no words for', () => {
    settings.default_language = 'fr'
    show()
    expect(locale()).toBe('uz')
  })
})
