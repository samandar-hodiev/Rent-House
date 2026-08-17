import { useLocale } from '../context/LocaleContext'
import ApartmentCard from './ApartmentCard'
import ApartmentCardSkeleton from './ApartmentCardSkeleton'
import EmptyState from './EmptyState'

const SKELETON_COUNT = 8

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
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
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
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {apartments.map((apartment) => (
        <ApartmentCard key={apartment.id} apartment={apartment} />
      ))}
    </div>
  )
}

export default ApartmentGrid
