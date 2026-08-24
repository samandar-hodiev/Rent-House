import { useLocale } from '../context/LocaleContext'
import ApartmentCard from './ApartmentCard'
import ApartmentCardSkeleton from './ApartmentCardSkeleton'
import EmptyState from './EmptyState'

const SKELETON_COUNT = 8

// One column ladder, shared by the skeleton and the real grid so a page never
// reflows when the data lands.
//
// Each step is the width at which the next column still leaves a card wide
// enough to read: a card is (container - gaps) / columns, and the container is
// the viewport minus 32px (48px from sm up) of page padding, minus 24px per
// gap. Going from n to n+1 columns shrinks every card to n/(n+1) of its width,
// so the steps are placed where that drop lands around 250-260px rather than at
// round numbers. The old ladder went 2 -> 4 columns in one move at 1024px,
// which left 475px cards just below it and 226px cards just above — wide enough
// to look unbalanced on one side and too narrow for "Xaritada ko'rish" to stay
// on one line on the other.
//
// 1674px keeps the fifth column that `Container` is sized around; everything
// from 1160px up is unchanged from before.
const GRID_COLUMNS =
  'grid grid-cols-1 gap-6 min-[560px]:grid-cols-2 min-[860px]:grid-cols-3 min-[1160px]:grid-cols-4 min-[1674px]:grid-cols-5'

function ApartmentGrid({
  apartments,
  loading,
  onClearFilters,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  emptyActionLabel,
}) {
  const { t } = useLocale()

  if (loading) {
    return (
      <div className={GRID_COLUMNS}>
        {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
          // eslint-disable-next-line react/no-array-index-key
          <ApartmentCardSkeleton key={index} />
        ))}
      </div>
    )
  }

  if (apartments.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle ?? t('emptyState.title')}
        description={emptyDescription ?? t('emptyState.description')}
        actionLabel={emptyActionLabel ?? t('emptyState.action')}
        onAction={onClearFilters}
      />
    )
  }

  return (
    <div className={GRID_COLUMNS}>
      {apartments.map((apartment) => (
        <ApartmentCard key={apartment.id} apartment={apartment} />
      ))}
    </div>
  )
}

export default ApartmentGrid
