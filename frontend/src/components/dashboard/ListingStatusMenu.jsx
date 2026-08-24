import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, Clock, FileText, MoreVertical, XCircle } from 'lucide-react'
import { useLocale } from '../../context/LocaleContext'
import { useDismiss } from '../../hooks/useDismiss'
import { LISTING_STATUS, STATUS_ACTIONS } from '../../data/listingStatus'

const MENU_WIDTH = 220
const ESTIMATED_HEIGHT = 96
const GAP = 4
const EDGE = 8

// The same icon and tint each state carries in the sidebar, so a colour means
// one thing across the dashboard.
const TARGET_ICONS = {
  [LISTING_STATUS.active]: { Icon: CheckCircle2, tint: 'text-primary' },
  [LISTING_STATUS.pending]: { Icon: Clock, tint: 'text-warning' },
  [LISTING_STATUS.closed]: { Icon: XCircle, tint: 'text-error' },
  [LISTING_STATUS.draft]: { Icon: FileText, tint: 'text-text-muted' },
}

/**
 * Where a listing can go from where it is.
 *
 * The options come from `STATUS_ACTIONS`, which mirrors the transitions the
 * server allows — a menu offering something the API would refuse is a failure
 * the person only discovers after clicking.
 *
 * Portalled and positioned in viewport coordinates: the listings page is a
 * scrolling column inside a pinned section, and a menu rendered in place would
 * be clipped by it and stack below the sidebar beside it.
 */
function ListingStatusMenu({ status, onSelect, disabled = false }) {
  const { t } = useLocale()
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState(null)
  const buttonRef = useRef(null)
  const menuRef = useRef(null)

  const targets = STATUS_ACTIONS[status] ?? []

  const close = useCallback(() => setIsOpen(false), [])
  // Both count as "inside": the menu is not a descendant of the button once it
  // is portalled, so a click on an item would otherwise read as outside and
  // close the menu before the item's handler ran.
  const dismissRefs = useMemo(() => [buttonRef, menuRef], [])
  useDismiss(dismissRefs, isOpen, close)

  const place = useCallback(() => {
    const button = buttonRef.current
    if (!button) return
    const rect = button.getBoundingClientRect()
    const height = menuRef.current?.offsetHeight ?? ESTIMATED_HEIGHT

    const below = rect.bottom + GAP
    const top =
      below + height <= window.innerHeight - EDGE ? below : Math.max(EDGE, rect.top - GAP - height)

    let left = rect.right - MENU_WIDTH
    left = Math.max(EDGE, Math.min(left, window.innerWidth - MENU_WIDTH - EDGE))

    setPosition({ top, left })
  }, [])

  useLayoutEffect(() => {
    if (!isOpen) {
      setPosition(null)
      return undefined
    }
    place()
    // Fixed coordinates are a snapshot; scrolling moves the row out from under
    // them, and closing is the honest response.
    const onMove = () => close()
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [isOpen, place, close])

  if (targets.length === 0) return null

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation()
          event.preventDefault()
          setIsOpen((open) => !open)
        }}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={t('listingAction.menuLabel')}
        title={t('listingAction.menuLabel')}
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        <MoreVertical aria-hidden="true" size={15} />
      </button>

      {isOpen
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              onClick={(event) => event.stopPropagation()}
              style={{
                top: position?.top ?? 0,
                left: position?.left ?? 0,
                width: MENU_WIDTH,
                visibility: position ? 'visible' : 'hidden',
              }}
              className="fixed z-[80] overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-[0_4px_16px_rgba(15,23,42,0.16)]"
            >
              {targets.map((target) => {
                const { Icon, tint } = TARGET_ICONS[target]
                return (
                  <button
                    key={target}
                    type="button"
                    role="menuitem"
                    onClick={(event) => {
                      event.stopPropagation()
                      close()
                      onSelect(target)
                    }}
                    // 13px rather than the 14px a top-level control uses. These
                    // labels are long — "Faol e'lonlarga o'tkazish" — and at
                    // full size they filled the dropdown edge to edge and read
                    // as heavier than the card they act on. One step down still
                    // sits on one line at this width, with room to spare.
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] leading-5 text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                  >
                    <Icon aria-hidden="true" size={15} className={`shrink-0 ${tint}`} />
                    {t(`listingAction.${target}.menu`)}
                  </button>
                )
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

export default ListingStatusMenu
