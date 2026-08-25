import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
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
import ProfilePage from './pages/ProfilePage'
import OwnerDashboardPage from './pages/OwnerDashboardPage'
import DashboardPage from './pages/DashboardPage'
import DashboardListingsPage from './pages/DashboardListingsPage'
import DashboardChatsPage from './pages/DashboardChatsPage'
import DashboardEditProfilePage from './pages/DashboardEditProfilePage'
import CreateListingPage from './pages/CreateListingPage'
import NotFoundPage from './pages/NotFoundPage'
import { ToastProvider } from './context/ToastContext'
import AdminLayout from './components/admin/AdminLayout'
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
import { ADMIN_ROUTES } from './routes/adminPaths'
import { LISTING_STATUS } from './data/listingStatus'
import { ROUTES } from './routes/paths'

function App() {
  return (
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
                        <Route element={<RequireAuth />}>
                          <Route
                            path={ROUTES.wishlist}
                            element={<Navigate to={ROUTES.dashboardSaved} replace />}
                          />
                          <Route path={ROUTES.profile} element={<ProfilePage />} />
                          <Route path={ROUTES.owner} element={<OwnerDashboardPage />} />
                        </Route>
                        <Route path="*" element={<NotFoundPage />} />
                      </Route>

                      {/* The admin area. Its own shell rather than the public
                          layout: it answers to a different person and shares
                          only the design tokens.

                          Access is unguarded for now — admin authentication is
                          explicitly not part of this stage, and adding a check
                          against a role the API does not yet return would be a
                          lock with no key. */}
                      <Route path={ADMIN_ROUTES.dashboard} element={<AdminLayout />}>
                        <Route index element={<AdminDashboardPage />} />

                        <Route path="users" element={<AdminUsersPage />} />
                        <Route path="users/:id" element={<AdminUserDetailPage />} />

                        <Route
                          path="listings"
                          element={<AdminListingsPage title="All Listings" />}
                        />
                        <Route
                          path="listings/pending"
                          element={<AdminListingsPage status={LISTING_STATUS.pending} title="Pending" />}
                        />
                        <Route
                          path="listings/active"
                          element={<AdminListingsPage status={LISTING_STATUS.active} title="Active" />}
                        />
                        <Route
                          path="listings/closed"
                          element={<AdminListingsPage status={LISTING_STATUS.closed} title="Closed" />}
                        />
                        <Route
                          path="listings/drafts"
                          element={<AdminListingsPage status={LISTING_STATUS.draft} title="Drafts" />}
                        />
                        <Route
                          path="listings/deleted"
                          element={<AdminListingsPage status={LISTING_STATUS.deleted} title="Deleted" />}
                        />
                        <Route path="listings/detail/:id" element={<AdminListingDetailPage />} />

                        <Route path="chats" element={<AdminChatsPage />} />
                        <Route path="reports" element={<AdminReportsPage />} />
                        <Route path="analytics" element={<AdminAnalyticsPage />} />
                        <Route path="notifications" element={<AdminNotificationsPage />} />

                        <Route path="admins" element={<AdminAdminsPage />} />
                        <Route path="roles" element={<AdminRolesPage />} />
                        <Route path="audit-logs" element={<AdminAuditLogsPage />} />

                        <Route path="settings" element={<AdminSettingsPage panel="general" title="General" />} />
                        <Route
                          path="settings/listings"
                          element={<AdminSettingsPage panel="listings" title="Listings" />}
                        />
                        <Route
                          path="settings/chat"
                          element={<AdminSettingsPage panel="chat" title="Chat" />}
                        />
                        <Route
                          path="settings/security"
                          element={<AdminSettingsPage panel="security" title="Security" />}
                        />
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
                  </BrowserRouter>
                  </ToastProvider>
                </WishlistProvider>
              </SearchProvider>
            </ListingsProvider>
          </ChatProvider>
        </AuthProvider>
      </ThemeProvider>
    </LocaleProvider>
  )
}

export default App
