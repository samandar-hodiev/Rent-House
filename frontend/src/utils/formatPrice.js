// Money as RentHouse writes it.
//
// A listing carries three separate facts — an amount, a currency and a rental
// period — and all three are stored on the row and returned by the API. They
// are formatted together here rather than at each call site, because a card, a
// detail page and a map marker that each build their own label are three
// chances to print a dollar price with "so'm" after it.

export function formatUzsAmount(amount) {
  return Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

// Compact form for map markers, e.g. 4500000 -> "4.5 mln", 11000000 -> "11 mln".
export function formatUzsShort(amount) {
  const millions = amount / 1_000_000
  const rounded = Math.round(millions * 10) / 10
  const label = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
  return `${label} mln`
}

// The API stores lower case ("monthly"); the listing form's ids are upper case
// ("MONTHLY"); the seeded demo catalog carries neither. One reading for all
// three, defaulting the way the column does.
const normalise = (value, fallback) =>
  typeof value === 'string' && value ? value.toUpperCase() : fallback

/** The amount with its currency: "300 $" in USD, "5 000 000 so'm" in UZS. */
export function formatMoney(t, amount, currency) {
  const value = formatUzsAmount(amount)
  return normalise(currency, 'UZS') === 'USD'
    ? t('currency.usdAmount', { amount: value })
    : t('currency.uzsAmount', { amount: value })
}

/**
 * A listing's full price label: "$300 / oy", "5 000 000 so'm / oy".
 *
 * Takes the listing rather than three arguments so a caller cannot pass the
 * amount and forget the currency — which is exactly how a USD listing came to
 * be advertised in so'm.
 */
export function formatListingPrice(t, listing) {
  const money = formatMoney(t, listing.price, listing.currency)
  const period =
    normalise(listing.rentalPeriod, 'MONTHLY') === 'DAILY'
      ? t('currency.perDay')
      : t('currency.perMonth')
  return `${money} ${period}`
}

/**
 * The same price shortened for a map marker, where the label sits inside a pin.
 *
 * So'm amounts collapse to millions; dollar amounts are already short enough
 * that rounding them to "0 mln" would be worse than useless — a $300 flat would
 * have advertised itself as "0 mln".
 *
 * Untranslated, like the "mln" it has always produced: the marker label is a
 * number in a pin, and threading the locale into it would put `t` in the
 * dependencies of the map's marker effect for no reader's benefit.
 */
export function formatListingPriceShort(listing) {
  if (normalise(listing.currency, 'UZS') === 'USD') return `$${formatUzsAmount(listing.price)}`
  return formatUzsShort(listing.price)
}
