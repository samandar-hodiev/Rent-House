import { useParams } from 'react-router-dom'
import PagePlaceholder from '../components/PagePlaceholder'

function ApartmentDetailsPage() {
  const { id } = useParams()

  return (
    <PagePlaceholder
      title={`E'lon tafsilotlari (ID: ${id})`}
      description="Galereya, narx, xususiyatlar va uy egasi ma'lumotlari bu yerda ko'rsatiladi."
    />
  )
}

export default ApartmentDetailsPage
