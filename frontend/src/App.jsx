import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ChatProvider } from './context/ChatContext'
import { ListingsProvider } from './context/ListingsContext'
import { LocaleProvider } from './context/LocaleContext'
import { ThemeProvider } from './context/ThemeContext'
import { SearchProvider } from './context/SearchContext'
import { WishlistProvider } from './context/WishlistContext'
import RootLayout from './layouts/RootLayout'
import DashboardLayout from './components/dashboard/DashboardLayout'
import RequireAuth from './components/RequireAuth'
import HomePage from './pages/HomePage'
import SearchPage from './pages/SearchPage'
import ApartmentDetailsPage from './pages/ApartmentDetailsPage'
import MapPage from './pages/MapPage'
import WishlistPage from './pages/WishlistPage'
import MessageNotifications from './components/chat/MessageNotifications'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import OwnerLandingPage from './pages/OwnerLandingPage'
import DashboardPage from './pages/DashboardPage'
import DashboardListingsPage from './pages/DashboardListingsPage'
import DashboardChatsPage from './pages/DashboardChatsPage'
import DashboardEditProfilePage from './pages/DashboardEditProfilePage'
import CreateListingPage from './pages/CreateListingPage'
import NotFoundPage from './pages/NotFoundPage'
import { ToastProvider } from './context/ToastContext'
import { SiteSettingsProvider, useSiteSettings } from './context/SiteSettingsContext'
import MaintenancePage from './pages/MaintenancePage'
import AdminLayout, { AdminRoot } from './components/admin/AdminLayout'
import AdminDashboardPage from './pages/admin/AdminDashboardPage'
import AdminUsersPage from './pages/admin/AdminUsersPage'
import AdminUserDetailPage from './pages/admin/AdminUserDetailPage'
import AdminListingsPage from './pages/admin/AdminListingsPage'
import AdminListingDetailPage from './pages/admin/AdminListingDetailPage'
import AdminChatsPage from './pages/admin/AdminChatsPage'
import AdminReportsPage from './pages/admin/AdminReportsPage'
import AdminAnalyticsPage from './pages/admin/AdminAnalyticsPage'
import AdminNotificationsPage from './pages/admin/AdminNotificationsPage'
import AdminAdminsPage from './pages/admin/AdminAdminsPage'
import AdminRolesPage from './pages/admin/AdminRolesPage'
import AdminAuditLogsPage from './pages/admin/AdminAuditLogsPage'
import AdminSettingsPage from './pages/admin/AdminSettingsPage'
import AdminDashboardSettingsPage from './pages/admin/AdminDashboardSettingsPage'
import AdminSidebarControlPage from './pages/admin/AdminSidebarControlPage'
import AdminLoginPage from './pages/admin/AdminLoginPage'
import AdminProfilePage from './pages/admin/AdminProfilePage'
import RequireAdmin from './components/admin/RequireAdmin'
import { ADMIN_ROUTES } from './routes/adminPaths'
import { LISTING_STATUS } from './data/listingStatus'
import { ROUTES } from './routes/paths'

/**
 * Closes the marketplace while maintenance mode is on.
 *
 * The dashboard is exempt — it is how maintenance gets turned off again — and
 * so is the sign-in page that leads to it. Everything else, including a URL
 * typed by hand, gets the notice instead of the app.
 *
 * The protection is the server's: every public endpoint answers 503 while this
 * is on, so a visitor who bypasses the interface entirely is refused all the
 * same. This is what makes the refusal legible rather than a wall of errors.
 */
function MaintenanceGate({ children }) {
  const { settings } = useSiteSettings()
  const { pathname } = useLocation()

  const forAdmins = pathname === '/admin' || pathname.startsWith('/admin/')
  if (settings.maintenance_mode && !forAdmins) return <MaintenancePage />
  return children
}

function App() {
  return (
    <SiteSettingsProvider>
    <LocaleProvider>
      <ThemeProvider>
        <AuthProvider>
          <ChatProvider>
            <ListingsProvider>
              <SearchProvider>
                <WishlistProvider>
                  {/* Above the router: a confirmation usually outlives the
                      navigation that follows the action it confirms. */}
                  <ToastProvider>
                  <BrowserRouter>
                    {/* Mounted above the routes so a message arriving while
                        the reader is anywhere in the app still reaches them. */}
                    <MessageNotifications />
                    <MaintenanceGate>
                    <Routes>
                      <Route element={<RootLayout />}>
                        <Route path={ROUTES.home} element={<HomePage />} />
                        <Route path={ROUTES.search} element={<SearchPage />} />
                        <Route path={ROUTES.apartmentDetails} element={<ApartmentDetailsPage />} />
                        <Route path={ROUTES.map} element={<MapPage />} />
                        {/* These pages inside the public shell are personal:
                            saved apartments, the profile, and the owner and
                            admin surfaces. They keep the header and footer,
                            unlike the dedicated account area below.

                            The guard here is authentication only. Role
                            enforcement for the owner and admin areas belongs
                            server-side and lands with those endpoints; this
                            check is UX, not a security boundary. */}
                        {/* What this marketplace offers somebody with a flat
                            to let. Public: it is the page the footer's "for
                            property owners" link leads to, and putting it
                            behind the sign-in wall would mean the page whose
                            job is to persuade you to join could only be read
                            once you had. */}
                        <Route path={ROUTES.owner} element={<OwnerLandingPage />} />

                        <Route element={<RequireAuth />}>
                          <Route
                            path={ROUTES.wishlist}
                            element={<Navigate to={ROUTES.dashboardSaved} replace />}
                          />
                          {/* The account overview is the profile, and it lives
                              in the account area. This address is kept as a
                              redirect rather than as a second page, the same
                              way /dashboard/profile is. */}
                          <Route
                            path={ROUTES.profile}
                            element={<Navigate to={ROUTES.dashboard} replace />}
                          />
                        </Route>
                        <Route path="*" element={<NotFoundPage />} />
                      </Route>

                      {/* The admin area. Its own shell rather than the public
                          layout: it answers to a different person and shares
                          only the design tokens.

                          Two levels: everything under /admin gets the session
                          and the dictionary, and everything except the sign-in
                          page also needs a session to exist. The guard is a
                          courtesy — the API refuses an unauthenticated request
                          whatever the browser renders. */}
                      <Route path={ADMIN_ROUTES.dashboard} element={<AdminRoot />}>
                        <Route path="login" element={<AdminLoginPage />} />

                        {/* The signed-in dashboard. */}
                        <Route element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
                          <Route index element={<AdminDashboardPage />} />

                          <Route path="users" element={<AdminUsersPage />} />
                          <Route path="users/:id" element={<AdminUserDetailPage />} />

                          <Route
                            path="listings"
                            element={<AdminListingsPage titleKey="nav.allListings" />}
                          />
                          <Route
                            path="listings/pending"
                            element={<AdminListingsPage status={LISTING_STATUS.pending} titleKey="nav.pending" />}
                          />
                          <Route
                            path="listings/active"
                            element={<AdminListingsPage status={LISTING_STATUS.active} titleKey="nav.active" />}
                          />
                          <Route
                            path="listings/closed"
                            element={<AdminListingsPage status={LISTING_STATUS.closed} titleKey="nav.closed" />}
                          />
                          <Route
                            path="listings/drafts"
                            element={<AdminListingsPage status={LISTING_STATUS.draft} titleKey="nav.drafts" />}
                          />
                          <Route
                            path="listings/deleted"
                            element={<AdminListingsPage status={LISTING_STATUS.deleted} titleKey="nav.deleted" />}
                          />
                          <Route path="listings/detail/:id" element={<AdminListingDetailPage />} />

                          <Route path="chats" element={<AdminChatsPage />} />
                          <Route path="reports" element={<AdminReportsPage />} />
                          <Route path="analytics" element={<AdminAnalyticsPage />} />
                          <Route path="notifications" element={<AdminNotificationsPage />} />

                          <Route path="admins" element={<AdminAdminsPage />} />
                          <Route path="roles" element={<AdminRolesPage />} />
                          <Route path="audit-logs" element={<AdminAuditLogsPage />} />

                          {/* The owner's; the page turns a super admin away. */}
                          <Route path="sidebar-control" element={<AdminSidebarControlPage />} />

                          {/* The signed-in administrator's own account. Distinct
                              from Settings, which configures the marketplace. */}
                          <Route path="profile" element={<AdminProfilePage />} />

                          {/* The dashboard's own appearance and language, which
                              are not marketplace configuration and live apart
                              from Settings for that reason. */}
                          <Route path="dashboard-settings" element={<AdminDashboardSettingsPage />} />

                          {/* One page rather than four tabs: the marketplace
                              has two settings it actually obeys, and three
                              empty tabs to reach them was the interface
                              apologising for itself. */}
                          <Route path="settings" element={<AdminSettingsPage />} />
                        </Route>
                      </Route>

                      {/* Authentication owns the full viewport: no header, no
                          search bar, no footer. Someone signing in has one job,
                          and every other control is a way to fail at it. These
                          routes therefore sit outside RootLayout entirely. */}
                      <Route path={ROUTES.login} element={<LoginPage />} />
                      <Route path={ROUTES.register} element={<RegisterPage />} />
                      {/* Password reset, by email. Public for the same reason
                          sign-in is: somebody who has forgotten their password
                          has nothing to authenticate with. */}
                      <Route path={ROUTES.forgotPassword} element={<ForgotPasswordPage />} />
                      <Route path={ROUTES.resetPassword} element={<ResetPasswordPage />} />

                      {/* Account area: its own shell (no public search bar, no
                          login/register buttons) instead of RootLayout, and
                          behind RequireAuth — these routes show a real
                          account, so an unauthenticated visitor is sent to
                          the login page. */}
                      <Route element={<RequireAuth />}>
                        <Route element={<DashboardLayout />}>
                          <Route path={ROUTES.dashboard}>
                            {/* The account landing page is the overview, so it
                                sits at /dashboard itself. `profile` used to
                                hold it and is kept as a redirect rather than a
                                second copy, so older links still resolve. */}
                            <Route index element={<DashboardPage />} />
                            <Route
                              path="profile"
                              element={<Navigate to={ROUTES.dashboard} replace />}
                            />
                            <Route path="listings" element={<DashboardListingsPage />} />
                            {/* Saved apartments live in the account area now,
                                not the public header. */}
                            <Route path="saved" element={<WishlistPage />} />
                            <Route path="chats" element={<DashboardChatsPage />} />
                            {/* Blocks are easy to make and easy to forget;
                                this is where they can be reviewed. */}
                            {/* The blocked list moved into chat's own sidebar.
                                The old address still works — a bookmark or a
                                link from elsewhere should not dead-end. */}
                            <Route
                              path="blocked"
                              element={<Navigate to={`${ROUTES.dashboardChats}?view=blocked`} replace />}
                            />
                            <Route path="edit-profile" element={<DashboardEditProfilePage />} />
                          </Route>
                          <Route path={ROUTES.createListing} element={<CreateListingPage />} />
                          {/* Same form component in edit mode — see CreateListingPage. */}
                          <Route path={ROUTES.editListing} element={<CreateListingPage />} />
                        </Route>
                      </Route>
                    </Routes>
                    </MaintenanceGate>
                  </BrowserRouter>
                  </ToastProvider>
                </WishlistProvider>
              </SearchProvider>
            </ListingsProvider>
          </ChatProvider>
        </AuthProvider>
      </ThemeProvider>
    </LocaleProvider>
    </SiteSettingsProvider>
  )
}

export default App
