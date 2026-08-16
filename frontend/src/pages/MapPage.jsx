import { useSearchParams } from 'react-router-dom'
import PagePlaceholder from '../components/PagePlaceholder'

function MapPage() {
  const [searchParams] = useSearchParams()
  const apartmentId = searchParams.get('apartment')

  return (
    <PagePlaceholder
      title="Xarita"
      description={
        apartmentId
          ? `E'lonlar joylashuvi xaritada keyingi bosqichda ko'rsatiladi. Tanlangan e'lon ID: ${apartmentId}`
          : "E'lonlar joylashuvi xaritada keyingi bosqichda ko'rsatiladi."
      }
    />
  )
}

export default MapPage
