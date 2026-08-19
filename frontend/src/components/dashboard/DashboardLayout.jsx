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

      <div className="mx-auto flex w-full max-w-336 flex-1 gap-6 px-4 py-6 sm:px-6">
        <DashboardSidebar />
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>

      <DashboardMobileMenu isOpen={isMenuOpen} onClose={closeMenu} />
    </div>
  )
}

export default DashboardLayout
