import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import UserAvatar from '../../components/dashboard/UserAvatar'
import {
  AdminCard, AdminTable, Cell, MockButton, PageHeading, Row, StatusBadge, useAdminFormat,
} from '../../components/admin/adminUi'
import EmptyState from '../../components/EmptyState'
import { ADMIN_ROLE, useAdmin } from '../../context/AdminSettingsContext'
import { useAdminAuth } from '../../context/AdminAuthContext'
import { ApiError } from '../../services/apiClient'
import {
  createAdmin, deleteAdmin, fetchAdmins, setAdminStatus,
} from '../../services/adminApi'
import { useModalDialog } from '../../hooks/useModalDialog'

const INPUT =
  'h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary'

/** A dialog inside the admin root, so it takes the dashboard's own theme. */
function AdminDialog({ title, onClose, children }) {
  const dialogRef = useModalDialog(onClose)
  const host = document.getElementById('admin-root')
  if (!host) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-border bg-surface p-5"
      >
        <h2 className="text-base font-semibold text-text-primary">{title}</h2>
        {children}
      </div>
    </div>,
    host,
  )
}

/** The form behind "+ Admin qo'shish". Creates a super admin and nothing else. */
function CreateAdminDialog({ onClose, onCreated }) {
  const { t } = useAdmin()
  const { token } = useAdminAuth()
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const set = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }))
    setError(null)
  }

  const submit = async (event) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      const created = await createAdmin({
        name: form.name.trim(),
        email: form.email.trim(),
        // The only role that can be created. The server refuses anything else,
        // so this is the form agreeing with the rule rather than enforcing it.
        role: ADMIN_ROLE.superAdmin,
        password: form.password,
        token,
      })
      onCreated(created)
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.code === 'email_taken'
          ? t('admins.emailTaken')
          : (caught?.message ?? t('admins.saveFailed')),
      )
      setBusy(false)
    }
  }

  return (
    <AdminDialog title={t('admins.addTitle')} onClose={onClose}>
      <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-text-secondary">{t('admins.name')}</span>
          <input value={form.name} onChange={set('name')} required minLength={2} className={INPUT} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-text-secondary">{t('admins.email')}</span>
          <input
            type="email"
            value={form.email}
            onChange={set('email')}
            required
            className={INPUT}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-text-secondary">{t('admins.role')}</span>
          {/* One option, and disabled: only a super admin can be created, and a
              select that could offer more would be a promise the server keeps
              refusing. */}
          <select disabled className={`${INPUT} opacity-70`}>
            <option>{t('role.super_admin')}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-text-secondary">{t('admins.password')}</span>
          <input
            type="password"
            value={form.password}
            onChange={set('password')}
            required
            minLength={8}
            autoComplete="new-password"
            className={INPUT}
          />
          <span className="text-[11px] text-text-muted">{t('admins.passwordHint')}</span>
        </label>

        {error ? (
          <p role="alert" className="rounded-md bg-error/10 px-3 py-2 text-xs text-error">
            {error}
          </p>
        ) : null}

        <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t('action.cancel')}
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? <Loader2 aria-hidden="true" size={15} className="animate-spin" /> : null}
            {t(busy ? 'admins.creating' : 'admins.create')}
          </button>
        </div>
      </form>
    </AdminDialog>
  )
}

/**
 * Every administrator, from the database.
 *
 * The owner's page: the API answers 403 to anyone else, so a super admin who
 * reaches it sees the refusal rather than a table they cannot act on. Adding,
 * suspending and removing all go through the API, which checks the same rules
 * again — the owner cannot be touched from here because the server will not
 * allow it, not because the buttons are missing.
 */
function AdminAdminsPage() {
  const { t } = useAdmin()
  const { token, admin: current } = useAdminAuth()
  const { formatDateTime } = useAdminFormat()

  const [admins, setAdmins] = useState([])
  const [state, setState] = useState('loading')
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(
    async (signal) => {
      try {
        setAdmins(await fetchAdmins({ token, signal }))
        setState('ready')
      } catch (error) {
        if (error?.name === 'AbortError') return
        setState(error instanceof ApiError && error.status === 403 ? 'forbidden' : 'error')
      }
    },
    [token],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const toggleStatus = async (target) => {
    setBusyId(target.id)
    const next = target.status === 'active' ? 'suspended' : 'active'
    try {
      await setAdminStatus(target.id, next, { token })
      setAdmins((list) =>
        list.map((row) => (row.id === target.id ? { ...row, status: next } : row)),
      )
    } catch {
      // The row keeps the status the server still holds.
    }
    setBusyId(null)
  }

  const remove = async (target) => {
    setBusyId(target.id)
    try {
      await deleteAdmin(target.id, { token })
      setAdmins((list) => list.filter((row) => row.id !== target.id))
    } catch {
      // Left in place: the server refused, so it is still there.
    }
    setBusyId(null)
    setRemoving(null)
  }

  if (state === 'forbidden') {
    return (
      <EmptyState title={t('page.admins.title')} description={t('admins.ownerOnly')} />
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeading
        title={t('page.admins.title')}
        description={t('page.admins.description', { count: admins.length })}
        action={
          current?.role === ADMIN_ROLE.owner ? (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Plus aria-hidden="true" size={15} className="shrink-0" />
              {t('admins.add')}
            </button>
          ) : null
        }
      />

      <AdminCard>
        {state === 'loading' ? (
          <div className="flex items-center justify-center p-10">
            <Loader2 aria-hidden="true" size={20} className="animate-spin text-text-muted" />
          </div>
        ) : state === 'error' ? (
          <div className="p-4">
            <EmptyState title={t('admins.loadFailed')} description={t('login.errorNetwork')} />
          </div>
        ) : (
          <AdminTable
            headers={[
              t('table.admin'), t('table.email'), t('table.role'), t('table.status'),
              t('table.lastActive'), t('table.actions'),
            ]}
          >
            {admins.map((row) => {
              const isOwner = row.role === ADMIN_ROLE.owner
              return (
                <Row key={row.id}>
                  <Cell>
                    <span className="flex min-w-0 items-center gap-2.5">
                      <UserAvatar name={row.name} />
                      <span className="min-w-0 truncate font-medium text-text-primary">
                        {row.name}
                      </span>
                    </span>
                  </Cell>
                  <Cell className="text-text-secondary">{row.email}</Cell>
                  <Cell className="whitespace-nowrap text-text-secondary">
                    {t(`role.${row.role}`)}
                  </Cell>
                  <Cell><StatusBadge status={row.status} /></Cell>
                  <Cell className="whitespace-nowrap text-text-secondary">
                    {row.lastLoginAt ? formatDateTime(row.lastLoginAt) : t('admins.never')}
                  </Cell>
                  <Cell>
                    {/* The owner has no controls here. Not because hiding them
                        is the protection — the API refuses either way — but
                        because offering an action that always fails is a lie. */}
                    {isOwner ? (
                      <span className="text-xs text-text-muted">—</span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <MockButton onClick={() => toggleStatus(row)}>
                          {t(row.status === 'active' ? 'action.suspend' : 'action.unblock')}
                        </MockButton>
                        <button
                          type="button"
                          onClick={() => setRemoving(row)}
                          disabled={busyId === row.id}
                          aria-label={t('admins.remove')}
                          className="flex size-7 items-center justify-center rounded-md border border-error/40 bg-error/10 text-error transition-colors hover:bg-error/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
                        >
                          <Trash2 aria-hidden="true" size={14} />
                        </button>
                      </span>
                    )}
                  </Cell>
                </Row>
              )
            })}
          </AdminTable>
        )}
      </AdminCard>

      {adding ? (
        <CreateAdminDialog
          onClose={() => setAdding(false)}
          onCreated={(created) => {
            setAdmins((list) => [...list, created])
            setAdding(false)
          }}
        />
      ) : null}

      {removing ? (
        <AdminDialog title={t('admins.deleteTitle')} onClose={() => setRemoving(null)}>
          <p className="mt-2 text-sm text-text-secondary">
            {t('admins.deleteBody', { name: removing.name })}
          </p>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setRemoving(null)}
              className="rounded-md px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {t('action.cancel')}
            </button>
            <button
              type="button"
              onClick={() => remove(removing)}
              className="rounded-md border border-error/40 bg-error/10 px-4 py-2 text-sm font-medium text-error transition-colors hover:bg-error/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {t('admins.remove')}
            </button>
          </div>
        </AdminDialog>
      ) : null}
    </div>
  )
}

export default AdminAdminsPage
