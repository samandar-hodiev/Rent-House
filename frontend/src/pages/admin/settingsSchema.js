/**
 * How the settings page is laid out.
 *
 * One entry per setting the server declares in internal/models/site_setting.go,
 * grouped into the cards the owner reads. This file says how a value is edited
 * — a switch, a number, a list — and nothing about what it means: the labels
 * come from the dictionary and the rules from the server, which validates every
 * value again whatever this file says.
 *
 * The bounds repeated here are the server's own. They are here so a form can
 * refuse a number before a round trip, never as the enforcement: the server
 * answers 400 with the rule it applied either way.
 */

export const FIELD = {
  text: 'text',
  textarea: 'textarea',
  number: 'number',
  toggle: 'toggle',
  select: 'select',
  formats: 'formats',
}

// The image and document formats the server accepts. A shorter list than the
// server's own would hide a format nobody could then turn on.
const IMAGE_FORMATS = ['jpg', 'png', 'webp', 'gif']
const ATTACHMENT_FORMATS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'zip']

export const SETTINGS_SECTIONS = [
  {
    id: 'general',
    fields: [
      { key: 'site_name', type: FIELD.text, max: 60 },
      { key: 'site_brand_name', type: FIELD.text, max: 30 },
      { key: 'site_description', type: FIELD.textarea, max: 300 },
      { key: 'support_email', type: FIELD.text, max: 255 },
      { key: 'support_phone', type: FIELD.text, max: 40 },
    ],
  },
  {
    id: 'localization',
    fields: [
      {
        key: 'default_language',
        type: FIELD.select,
        options: [
          { value: 'uz', label: "O'zbekcha" },
          { value: 'ru', label: 'Русский' },
          { value: 'en', label: 'English' },
        ],
      },
      {
        key: 'default_currency',
        type: FIELD.select,
        options: [
          { value: 'UZS', label: "so'm (UZS)" },
          { value: 'USD', label: 'dollar (USD)' },
        ],
      },
      {
        key: 'date_format',
        type: FIELD.select,
        options: [
          { value: 'DD.MM.YYYY', label: '31.12.2026' },
          { value: 'YYYY-MM-DD', label: '2026-12-31' },
        ],
      },
      {
        key: 'time_format',
        type: FIELD.select,
        options: [
          { value: '24', label: '18:30' },
          { value: '12', label: '6:30 PM' },
        ],
      },
    ],
  },
  {
    id: 'listings',
    fields: [
      { key: 'listing_moderation_required', type: FIELD.toggle },
      { key: 'listing_min_images', type: FIELD.number, min: 0, max: 10 },
      { key: 'listing_max_images', type: FIELD.number, min: 1, max: 50 },
      { key: 'listing_max_title_length', type: FIELD.number, min: 20, max: 255 },
      { key: 'listing_max_description_length', type: FIELD.number, min: 100, max: 5000 },
      {
        key: 'listing_expiration_days',
        type: FIELD.select,
        numeric: true,
        options: [7, 14, 30, 60, 90].map((days) => ({ value: String(days), label: String(days) })),
      },
      { key: 'listing_auto_expire', type: FIELD.toggle },
      { key: 'listing_drafts_allowed', type: FIELD.toggle },
      { key: 'listing_owner_can_edit', type: FIELD.toggle },
      { key: 'listing_owner_can_delete', type: FIELD.toggle },
      { key: 'listing_republish_allowed', type: FIELD.toggle },
    ],
  },
  {
    id: 'users',
    fields: [
      { key: 'user_registration_enabled', type: FIELD.toggle },
      { key: 'registration_email_enabled', type: FIELD.toggle },
      { key: 'registration_phone_enabled', type: FIELD.toggle },
      { key: 'user_profile_edit_enabled', type: FIELD.toggle },
      { key: 'user_avatar_required', type: FIELD.toggle },
      { key: 'blocked_contact_reuse_allowed', type: FIELD.toggle },
    ],
  },
  {
    id: 'chat',
    fields: [
      { key: 'chat_enabled', type: FIELD.toggle },
      { key: 'user_messaging_enabled', type: FIELD.toggle },
      { key: 'contact_owner_enabled', type: FIELD.toggle },
      { key: 'message_max_length', type: FIELD.number, min: 1, max: 10000 },
      { key: 'message_edit_allowed', type: FIELD.toggle },
      { key: 'message_edit_window_minutes', type: FIELD.number, min: 1, max: 1440 },
      { key: 'message_delete_allowed', type: FIELD.toggle },
      { key: 'chat_attachments_allowed', type: FIELD.toggle },
    ],
  },
  {
    id: 'media',
    fields: [
      { key: 'media_max_image_mb', type: FIELD.number, min: 1, max: 25 },
      { key: 'media_max_avatar_mb', type: FIELD.number, min: 1, max: 10 },
      { key: 'media_max_attachment_mb', type: FIELD.number, min: 1, max: 50 },
      { key: 'media_allowed_image_formats', type: FIELD.formats, options: IMAGE_FORMATS },
      {
        key: 'media_allowed_attachment_formats',
        type: FIELD.formats,
        options: ATTACHMENT_FORMATS,
      },
    ],
  },
  {
    id: 'notifications',
    // One setting, and the card says why: notifications for listings, for
    // moderation and for complaints have nothing to generate them yet, and a
    // switch for a notification that is never sent would be a lie.
    note: 'settingsSection.notifications.note',
    fields: [{ key: 'notify_new_message', type: FIELD.toggle }],
  },
  {
    id: 'moderation',
    fields: [
      { key: 'listing_edit_moderation_required', type: FIELD.toggle },
      { key: 'block_reason_required', type: FIELD.toggle },
      {
        key: 'block_listings_action',
        type: FIELD.select,
        options: [
          { value: 'keep', label: 'settings.block_listings_action.keep' },
          { value: 'close', label: 'settings.block_listings_action.close' },
          { value: 'moderate', label: 'settings.block_listings_action.moderate' },
        ],
        translateOptions: true,
      },
    ],
  },
  {
    id: 'security',
    fields: [
      { key: 'password_min_length', type: FIELD.number, min: 6, max: 72 },
      { key: 'password_require_strong', type: FIELD.toggle },
      { key: 'jwt_expiration_hours', type: FIELD.number, min: 1, max: 720 },
      { key: 'login_max_attempts', type: FIELD.number, min: 3, max: 20 },
      { key: 'login_lock_minutes', type: FIELD.number, min: 1, max: 1440 },
      { key: 'otp_expiry_minutes', type: FIELD.number, min: 1, max: 60 },
      { key: 'otp_resend_cooldown_seconds', type: FIELD.number, min: 15, max: 600 },
    ],
  },
  {
    id: 'system',
    fields: [
      {
        key: 'timezone',
        type: FIELD.select,
        options: ['Asia/Tashkent', 'Asia/Almaty', 'Europe/Moscow', 'UTC'].map((zone) => ({
          value: zone,
          label: zone,
        })),
      },
      { key: 'default_country', type: FIELD.text, max: 60 },
      { key: 'default_city', type: FIELD.text, max: 60 },
      {
        key: 'pagination_default_size',
        type: FIELD.select,
        numeric: true,
        options: [10, 20, 50, 100].map((size) => ({ value: String(size), label: String(size) })),
      },
    ],
  },
]

/** The maintenance card is its own thing: it closes the marketplace. */
export const MAINTENANCE_KEYS = {
  mode: 'maintenance_mode',
  message: 'maintenance_message',
}

/** Every key one section owns, for comparing a form against what was loaded. */
export function keysOf(section) {
  return section.fields.map((field) => field.key)
}
