function closenessScore(a, b, tightPct = 0.15, loosePct = 0.3) {
  const diff = Math.abs(a - b) / Math.max(a, b)
  if (diff <= tightPct) return 2
  if (diff <= loosePct) return 1
  return 0
}

function roomsScore(a, b) {
  const diff = Math.abs(a - b)
  if (diff === 0) return 2
  if (diff === 1) return 1
  return 0
}

// Ranks other apartments by similarity to `apartment` (same district, close
// price, close room count, close area) and returns the top `limit`. Pure
// function over an in-memory list for now; swap the body for a call to
// GET /apartments/:id/recommendations later without changing the call sites.
export function getSimilarApartments(apartment, apartments, limit = 4) {
  return apartments
    .filter((candidate) => candidate.id !== apartment.id)
    .map((candidate) => ({
      apartment: candidate,
      score:
        (candidate.districtId === apartment.districtId ? 3 : 0) +
        closenessScore(candidate.price, apartment.price) +
        roomsScore(candidate.rooms, apartment.rooms) +
        closenessScore(candidate.area, apartment.area),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.apartment)
}
