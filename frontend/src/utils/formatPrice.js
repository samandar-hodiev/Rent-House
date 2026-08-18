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
