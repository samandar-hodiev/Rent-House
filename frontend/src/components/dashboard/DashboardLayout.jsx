import { useCallback, useState } from 'react'
import { Outlet } from 'react-router-dom'
import DashboardHeader from './DashboardHeader'
import DashboardSidebar from './DashboardSidebar'
import DashboardMobileMenu from './DashboardMobileMenu'

// Shell for the whole account area: its own header (no public search bar), a
// persistent sidebar from `lg:` up and a drawer below that.
function DashboardLayout() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const closeMenu = useCallback(() => setIsMenuOpen(false), [])

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <DashboardHeader onOpenMenu={() => setIsMenuOpen(true)} />

      {/* Full-bleed: the sidebar sits against the viewport edge and the main
          area takes the rest of the width — no centered max-width wrapper. */}
      <div className="flex flex-1">
        <DashboardSidebar />
        <main className="min-w-0 flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>

      <DashboardMobileMenu isOpen={isMenuOpen} onClose={closeMenu} />
    </div>
  )
}

export default DashboardLayout
