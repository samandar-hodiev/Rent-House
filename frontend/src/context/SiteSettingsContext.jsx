import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { request } from '../services/apiClient'

/**
 * How the marketplace is configured, as the server states it.
 *
 * One fetch, held for the whole app. Everything here is also enforced by the
 * server — the limits, the closures, the maintenance switch — so this is what
 * lets the interface agree with the rules rather than what applies them. A form
 * that reads its maximum from here refuses a file before the upload; a form
 * that did not would simply be refused a second later.
 *
 * The defaults below are what the marketplace behaves by when the request has
 * not landed yet or failed. They match the server's own declared defaults, so a
 * first paint before the fetch is not a different product.
 */
const FALLBACK = {
  site_name: 'RentHouse',
  site_brand_name: 'RentHouse',
  site_description: '',
  support_email: '',
  support_phone: '',
  default_language: 'uz',
  default_currency: 'UZS',
  date_format: 'DD.MM.YYYY',
  time_format: '24',
  maintenance_mode: false,
  maintenance_message: '',
  user_registration_enabled: true,
  registration_email_enabled: true,
  registration_phone_enabled: true,
  user_profile_edit_enabled: true,
  user_avatar_required: false,
  chat_enabled: true,
  user_messaging_enabled: true,
  contact_owner_enabled: true,
  message_max_length: 4000,
  message_edit_allowed: true,
  message_edit_window_minutes: 15,
  message_delete_allowed: true,
  chat_attachments_allowed: true,
  notify_new_message: true,
  listing_moderation_required: false,
  listing_min_images: 0,
  listing_max_images: 20,
  listing_max_title_length: 255,
  listing_max_description_length: 5000,
  listing_drafts_allowed: true,
  listing_owner_can_edit: true,
  listing_owner_can_delete: true,
  listing_republish_allowed: true,
  media_max_image_mb: 5,
  media_max_avatar_mb: 2,
  media_max_attachment_mb: 20,
  password_min_length: 8,
  password_require_strong: false,
  pagination_default_size: 20,
}

const SiteSettingsContext = createContext(null)

export function SiteSettingsProvider({ children }) {
  const [settings, setSettings] = useState(FALLBACK)
  // "loading" only on the very first fetch: a later refresh must not blank the
  // site while it happens.
  const [state, setState] = useState('loading')

  const load = useCallback(async (signal) => {
    try {
      const data = await request('/settings', { signal })
      setSettings({ ...FALLBACK, ...(data ?? {}) })
      setState('ready')
    } catch (error) {
      if (error?.name === 'AbortError') return
      // The declared defaults stand. A marketplace that cannot read its own
      // configuration must stay open rather than close itself.
      //
      // Said out loud in development, because the failure is otherwise silent
      // and looks exactly like a setting that does not work: the site name,
      // the language it opens in and the maintenance notice all quietly fall
      // back, and the usual cause is the API being on an origin this build was
      // not told about.
      if (import.meta.env.DEV) {
        console.warn(
          '[RentHouse] Could not read /settings — falling back to the built-in ' +
            'defaults. Check VITE_API_URL and the API\'s allowed origins.',
          error,
        )
      }
      setState('ready')
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  // The tab's name is the owner's to set.
  useEffect(() => {
    if (settings.site_name) document.title = settings.site_name
  }, [settings.site_name])

  // And so is what the page says it is. This is the description a search
  // result and a shared link show, so leaving it in the configuration without
  // ever writing it into the document would make the field decorative.
  useEffect(() => {
    const description = settings.site_description?.trim()
    if (!description) return

    let tag = document.querySelector('meta[name="description"]')
    if (!tag) {
      tag = document.createElement('meta')
      tag.setAttribute('name', 'description')
      document.head.appendChild(tag)
    }
    tag.setAttribute('content', description)
  }, [settings.site_description])

  const value = useMemo(
    () => ({ settings, state, reload: () => load() }),
    [settings, state, load],
  )

  return (
    <SiteSettingsContext.Provider value={value}>{children}</SiteSettingsContext.Provider>
  )
}

export function useSiteSettings() {
  const context = useContext(SiteSettingsContext)
  // Deliberately forgiving: a component rendered outside the provider — a test,
  // a story — gets the declared defaults rather than an exception, because a
  // missing configuration is not a broken component.
  if (!context) return { settings: FALLBACK, state: 'ready', reload: () => {} }
  return context
}

export const SITE_SETTINGS_FALLBACK = FALLBACK
