import { describe, expect, it } from 'vitest'
import { ADMIN_NAV, CONFIGURABLE_NAV, isNavVisible } from './AdminSidebar'
import { ADMIN_ROLE } from '../../context/AdminSettingsContext'

// /admin/settings and /admin/admins are RequireOwner()'d unconditionally on
// the server (cmd/server/main.go) — no sidebar setting can ever let a super
// admin through. A switch offered for them on the owner's Sidebar Control
// page would be a lie: turning it "on" could never actually grant access.
describe('sections the owner cannot hand to a super admin', () => {
  const ownerOnlyIds = ['sidebarControl', 'adminManagement', 'settings']

  it('are excluded from the switches the owner is offered', () => {
    const configurableIds = CONFIGURABLE_NAV.map((item) => item.id)
    for (const id of ownerOnlyIds) {
      expect(configurableIds).not.toContain(id)
    }
  })

  it('stay hidden from a super admin even if the stored sidebar says otherwise', () => {
    // A stale or tampered config saying "on" must not resurrect access the
    // server refuses regardless.
    const sidebar = Object.fromEntries(ownerOnlyIds.map((id) => [id, true]))
    for (const id of ownerOnlyIds) {
      const item = ADMIN_NAV.find((entry) => entry.id === id)
      expect(isNavVisible(item, { role: ADMIN_ROLE.superAdmin, sidebar })).toBe(false)
    }
  })

  it('stay visible to the owner regardless of the stored sidebar', () => {
    const sidebar = Object.fromEntries(ownerOnlyIds.map((id) => [id, false]))
    for (const id of ownerOnlyIds) {
      const item = ADMIN_NAV.find((entry) => entry.id === id)
      expect(isNavVisible(item, { role: ADMIN_ROLE.owner, sidebar })).toBe(true)
    }
  })
})

describe('sections the owner can toggle for a super admin', () => {
  it('follow the stored sidebar setting', () => {
    const reports = ADMIN_NAV.find((entry) => entry.id === 'reports')
    expect(isNavVisible(reports, { role: ADMIN_ROLE.superAdmin, sidebar: { reports: false } }))
      .toBe(false)
    expect(isNavVisible(reports, { role: ADMIN_ROLE.superAdmin, sidebar: { reports: true } }))
      .toBe(true)
    // Unset reads as offered, matching the "on by default" sidebar the owner
    // has never touched.
    expect(isNavVisible(reports, { role: ADMIN_ROLE.superAdmin, sidebar: {} })).toBe(true)
  })
})
