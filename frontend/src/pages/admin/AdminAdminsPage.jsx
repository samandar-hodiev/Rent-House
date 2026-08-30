import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Loader2, Plus, Trash2, X } from 'lucide-react'
import UserAvatar from '../../components/dashboard/UserAvatar'
import {
  ADMIN_SELECT, ADMIN_SELECT_STYLE, AdminCard, AdminTable, Cell, MockButton, PageHeading,
  Row, StatusBadge, useAdminFormat,
} from '../../components/admin/adminUi'
import EmptyState from '../../components/EmptyState'
import { ADMIN_ROLE, useAdmin } from '../../context/AdminSettingsContext'
import { useAdminAuth } from '../../context/AdminAuthContext'
import { ApiError } from '../../services/apiClient'
import {
  createAdmin, deleteAdmin, fetchAdmins, fetchRoles, setAdminStatus,
} from '../../services/adminApi'
import { useToast } from '../../context/ToastContext'
import { useModalDialog } from '../../hooks/useModalDialog'

const INPUT =
  'h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary'

/** A dialog inside the admin root, so it takes the dashboard's own theme. */
function AdminDialog({ title, onClose, children, wide = false }) {
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
        className={`w-full rounded-xl border border-border bg-surface p-5 ${
          wide ? 'max-w-md' : 'max-w-sm'
        }`}
      >
        <h2 className="text-base font-semibold text-text-primary">{title}</h2>
        {children}
      </div>
    </div>,
    host,
  )
}

/**
 * What a role may reach, as the server describes it.
 *
 * The list comes from GET /admin/roles, which the server derives from the rules
 * its own middleware enforces and from the sections the owner configured. It is
 * not a description written next to the form: switch a section off on the
 * Sidebar control page and this card changes with it.
 */
function RolePermissions({ role, t }) {
  if (!role) return null

  const granted = role.sections.filter((section) => section.allowed)
  const withheld = role.sections.filter((section) => !section.allowed)

  return (
    <div className="rounded-lg border border-border bg-surface-secondary p-3">
      <p className="text-xs font-semibold text-text-primary">{t(`role.${role.id}`)}</p>
      <p className="mt-0.5 text-[11px] text-text-muted">{t('admins.roleCanDo')}</p>

      {/* Capped and scrollable: a role with every section must not push the
          password field off the bottom of the dialog. */}
      <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto pr-1">
        {granted.map((section) => (
          <li key={section.section} className="flex items-center gap-1.5 text-xs text-text-secondary">
            <Check aria-hidden="true" size={13} className="shrink-0 text-primary" />
            {t(`nav.${section.section}`)}
          </li>
        ))}
        {withheld.map((section) => (
          <li key={section.section} className="flex items-center gap-1.5 text-xs text-text-muted">
            <X aria-hidden="true" size={13} className="shrink-0" />
            <span className="line-through decoration-text-muted/50">
              {t(`nav.${section.section}`)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * The form behind "+ Admin qo'shish".
 *
 * Every rule it applies is one the server applies too — the roles it offers,
 * the password length it asks for, who may submit it at all. The form is here
 * to save a round trip and to explain itself, never as the thing standing
 * between a request and the database.
 */
function CreateAdminDialog({ onClose, onCreated }) {
  const { t } = useAdmin()
  const { token } = useAdminAuth()
  const { showToast } = useToast()

  const [catalog, setCatalog] = useState(null)
  const [catalogState, setCatalogState] = useState('loading')
  const [form, setForm] = useState({ name: '', email: '', role: '', password: '' })
  const [errors, setErrors] = useState({})
  const [failure, setFailure] = useState(null)
  const [busy, setBusy] = useState(false)

  // The roles are the server's to state. Until they arrive the form has nothing
  // truthful to offer, so it shows that it is loading rather than a guess.
  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false
    fetchRoles({ token, signal: controller.signal })
      .then((data) => {
        if (cancelled) return
        setCatalog(data)
        setCatalogState('ready')
        // Preselected: with one assignable role, making the owner pick it is
        // ceremony. The select still shows every role and why the others are
        // closed.
        const assignable = data.roles.filter((role) => role.assignable)
        if (assignable.length === 1) {
          setForm((current) => ({ ...current, role: assignable[0].id }))
        }
      })
      .catch((error) => {
        if (error?.name === 'AbortError') return
        setCatalogState('error')
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [token])

  const policy = catalog?.passwordPolicy ?? { minLength: 8, requireStrong: false }
  const selectedRole = catalog?.roles.find((role) => role.id === form.role) ?? null

  // The same rules the server will apply, checked here so the answer is
  // immediate. The server checks them again regardless.
  const validate = (values) => {
    const found = {}
    const name = values.name.trim()
    if (name.length < 2) found.name = t('admins.errorName')

    const email = values.email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) found.email = t('admins.errorEmail')

    const role = catalog?.roles.find((item) => item.id === values.role)
    if (!role || !role.assignable) found.role = t('admins.errorRole')

    if ([...values.password].length < policy.minLength) {
      found.password = t('admins.errorPasswordLength', { min: policy.minLength })
    } else if (
      policy.requireStrong &&
      !(/[a-z]/.test(values.password) &&
        /[A-Z]/.test(values.password) &&
        /\d/.test(values.password))
    ) {
      found.password = t('admins.errorPasswordStrong')
    }
    return found
  }

  const set = (field) => (event) => {
    const value = event.target.value
    setForm((current) => {
      const next = { ...current, [field]: value }
      // Re-checked only once a field has already been reported wrong, so the
      // form does not scold somebody who is still typing their first character.
      setErrors((currentErrors) =>
        currentErrors[field] ? { ...currentErrors, [field]: validate(next)[field] } : currentErrors,
      )
      return next
    })
    setFailure(null)
  }

  const submit = async (event) => {
    event.preventDefault()
    if (busy) return

    const found = validate(form)
    setErrors(found)
    if (Object.values(found).some(Boolean)) return

    setBusy(true)
    setFailure(null)
    try {
      const created = await createAdmin({
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        password: form.password,
        token,
      })
      showToast(t('admins.created'), [
        created.name,
        `${t(`role.${created.role}`)} • ${t(`status.${created.status}`)}`,
      ])
      onCreated(created)
    } catch (caught) {
      setFailure(createErrorMessage(caught, t))
      setBusy(false)
    }
  }

  return (
    <AdminDialog title={t('admins.addTitle')} onClose={onClose} wide>
      {catalogState === 'loading' ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 aria-hidden="true" size={20} className="animate-spin text-text-muted" />
        </div>
      ) : catalogState === 'error' ? (
        <p role="alert" className="mt-4 rounded-md bg-error/10 px-3 py-2 text-xs text-error">
          {t('admins.rolesFailed')}
        </p>
      ) : (
        <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-3">
          <Field label={t('admins.name')} error={errors.name}>
            <input
              value={form.name}
              onChange={set('name')}
              autoComplete="off"
              aria-invalid={Boolean(errors.name)}
              className={INPUT}
            />
          </Field>

          <Field label={t('admins.email')} error={errors.email}>
            <input
              type="email"
              value={form.email}
              onChange={set('email')}
              autoComplete="off"
              aria-invalid={Boolean(errors.email)}
              className={INPUT}
            />
          </Field>

          <Field label={t('admins.role')} error={errors.role}>
            <select
              value={form.role}
              onChange={set('role')}
              aria-invalid={Boolean(errors.role)}
              className={`${ADMIN_SELECT} h-10 w-full`}
              style={ADMIN_SELECT_STYLE}
            >
              <option value="">{t('admins.rolePlaceholder')}</option>
              {catalog.roles.map((role) => (
                // A role the server will not assign is shown and disabled
                // rather than hidden: an owner should see that the role exists
                // and why it is closed, not wonder where it went.
                <option key={role.id} value={role.id} disabled={!role.assignable}>
                  {t(`role.${role.id}`)}
                  {role.assignable ? '' : ` — ${t(`admins.roleReason.${role.reason}`)}`}
                </option>
              ))}
            </select>
          </Field>

          <RolePermissions role={selectedRole} t={t} />

          <Field label={t('admins.password')} error={errors.password}>
            <input
              type="password"
              value={form.password}
              onChange={set('password')}
              autoComplete="new-password"
              aria-invalid={Boolean(errors.password)}
              className={INPUT}
            />
            {!errors.password ? (
              <span className="text-[11px] text-text-muted">
                {policy.requireStrong
                  ? t('admins.passwordHintStrong', { min: policy.minLength })
                  : t('admins.passwordHintLength', { min: policy.minLength })}
              </span>
            ) : null}
          </Field>

          {failure ? (
            <p role="alert" className="rounded-md bg-error/10 px-3 py-2 text-xs text-error">
              {failure}
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
      )}
    </AdminDialog>
  )
}

/** One labelled field with its validation message. */
function Field({ label, error, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-text-secondary">{label}</span>
      {children}
      {error ? (
        <span role="alert" className="text-[11px] text-error">
          {error}
        </span>
      ) : null}
    </label>
  )
}

/**
 * What went wrong, in words the reader can act on.
 *
 * By status rather than by message: the server's own text is in English and
 * describes the rule, which is right for a log and wrong for a dialog.
 */
function createErrorMessage(caught, t) {
  if (!(caught instanceof ApiError)) return t('admins.saveFailed')
  if (caught.code === 'email_taken') return t('admins.emailTaken')
  if (caught.code === 'weak_password') return t('admins.errorPasswordPolicy')

  switch (caught.status) {
    case 400:
      return t('admins.errorInvalid')
    case 401:
      return t('admins.errorUnauthorized')
    case 403:
      return t('admins.errorForbidden')
    case 409:
      return t('admins.emailTaken')
    default:
      return t('admins.saveFailed')
  }
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
