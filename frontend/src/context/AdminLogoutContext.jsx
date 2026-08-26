import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import AdminConfirmDialog from '../components/admin/AdminConfirmDialog'
import { useAdmin } from './AdminSettingsContext'
import { useAdminAuth } from './AdminAuthContext'

const AdminLogoutContext = createContext(null)

/**
 * Signing out, asked once and answered in one place.
 *
 * Two controls offer it — the header menu and the foot of the sidebar — and
 * both must behave identically. Holding the dialog and the sign-out call here
 * means there is one of each: a second copy would be a second thing to keep in
 * step, and the one that drifted would be the one nobody tested.
 */
export function AdminLogoutProvider({ children }) {
  const { t } = useAdmin()
  const { signOut } = useAdminAuth()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)

  const requestLogout = useCallback(() => setAsking(true), [])
  const value = useMemo(() => ({ requestLogout }), [requestLogout])

  return (
    <AdminLogoutContext.Provider value={value}>
      {children}
      {asking ? (
        <AdminConfirmDialog
          title={t('logout.title')}
          description={t('logout.body')}
          confirmLabel={t('nav.logout')}
          busy={busy}
          onCancel={() => setAsking(false)}
          onConfirm={async () => {
            setBusy(true)
            // The dialog stays until the session is actually over, so a slow
            // request does not look like a control that did nothing.
            await signOut()
            setBusy(false)
            setAsking(false)
          }}
        />
      ) : null}
    </AdminLogoutContext.Provider>
  )
}

export function useAdminLogout() {
  const context = useContext(AdminLogoutContext)
  if (!context) throw new Error('useAdminLogout must be used inside AdminLogoutProvider')
  return context
}
