import { MessageSquare } from 'lucide-react'
import EmptyState from '../components/EmptyState'
import { useLocale } from '../context/LocaleContext'

function DashboardChatsPage() {
  const { t } = useLocale()

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-text-primary">{t('dashboard.chatsTitle')}</h1>
      <EmptyState
        icon={<MessageSquare aria-hidden="true" size={28} />}
        title={t('dashboard.chatsEmpty')}
        description={t('dashboard.chatsEmptyHint')}
      />
    </section>
  )
}

export default DashboardChatsPage
