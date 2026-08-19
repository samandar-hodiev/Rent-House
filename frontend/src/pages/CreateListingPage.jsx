import { PlusCircle } from 'lucide-react'
import EmptyState from '../components/EmptyState'
import { useLocale } from '../context/LocaleContext'

// Routed shell for the future listing form; it lives inside the account layout
// so posting never drops the user out of their dashboard.
function CreateListingPage() {
  const { t } = useLocale()

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-text-primary">
        {t('dashboard.createListingTitle')}
      </h1>
      <EmptyState
        icon={<PlusCircle aria-hidden="true" size={28} />}
        title={t('dashboard.createListingEmpty')}
        description={t('dashboard.createListingHint')}
      />
    </section>
  )
}

export default CreateListingPage
