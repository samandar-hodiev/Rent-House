// Shared styling for the mobile header menu.
//
// It lives in its own module because both the menu itself and the signed-in
// actions it renders need the same row style. Keeping it in Header.jsx would
// make those two components import each other.
//
// The menu has exactly two visual weights, and that is the whole hierarchy:
// rows are destinations, buttons are account actions. Register keeps the filled
// green and stays the strongest element on screen.

export const MOBILE_ICON_SIZE = 18

// A destination: icon, label, hover tint. `py-3` on a 20px line box gives a
// 44px row — the smallest comfortable thumb target.
export const mobileNavLinkClass = ({ isActive } = {}) =>
  `flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
    isActive
      ? 'bg-surface-secondary text-primary'
      : 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary active:bg-surface-secondary'
  }`

// The auth actions share height, radius and width so they read as one group;
// only weight separates them.
const authButtonBase =
  'flex h-11 w-full items-center justify-center rounded-md px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary'

// Secondary: bordered and tinted, clearly a button, clearly not the CTA. The
// hover picks up a hint of green so it still feels part of the brand.
export const mobileSecondaryButtonClass = `${authButtonBase} border border-border bg-surface-secondary text-text-primary hover:border-primary/40 hover:bg-primary-light/60 hover:text-primary active:bg-primary-light`

// Primary: the one filled element in the menu.
export const mobilePrimaryButtonClass = `${authButtonBase} bg-primary text-white hover:bg-primary-hover active:bg-primary-hover`

// Log out is the signed-in counterpart to the Kirish button — same shape and
// weight, but it warms to the error colour rather than to green.
export const mobileLogoutButtonClass = `${authButtonBase} gap-2 border border-border bg-surface-secondary text-text-secondary hover:border-error/40 hover:bg-error/10 hover:text-error active:bg-error/15`

// The hairline that splits navigation from account actions. Subtle on purpose:
// it should organise the menu, not divide it into two boxes.
export const mobileMenuGroupClass = 'mt-2 flex flex-col gap-2 border-t border-border pt-3'
