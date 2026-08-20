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
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ProfilePage from './pages/ProfilePage'
import OwnerDashboardPage from './pages/OwnerDashboardPage'
import AdminPage from './pages/AdminPage'
import DashboardPage from './pages/DashboardPage'
import DashboardListingsPage from './pages/DashboardListingsPage'
import DashboardChatsPage from './pages/DashboardChatsPage'
import DashboardEditProfilePage from './pages/DashboardEditProfilePage'
import CreateListingPage from './pages/CreateListingPage'
import NotFoundPage from './pages/NotFoundPage'
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
                  <BrowserRouter>
                    <Routes>
                      <Route element={<RootLayout />}>
                        <Route path={ROUTES.home} element={<HomePage />} />
                        <Route path={ROUTES.search} element={<SearchPage />} />
                        <Route path={ROUTES.apartmentDetails} element={<ApartmentDetailsPage />} />
                        <Route path={ROUTES.map} element={<MapPage />} />
                        <Route path={ROUTES.wishlist} element={<WishlistPage />} />
                        <Route path={ROUTES.profile} element={<ProfilePage />} />
                        <Route path={ROUTES.owner} element={<OwnerDashboardPage />} />
                        <Route path={ROUTES.admin} element={<AdminPage />} />
                        <Route path="*" element={<NotFoundPage />} />
                      </Route>

                      {/* Authentication owns the full viewport: no header, no
                          search bar, no footer. Someone signing in has one job,
                          and every other control is a way to fail at it. These
                          routes therefore sit outside RootLayout entirely. */}
                      <Route path={ROUTES.login} element={<LoginPage />} />
                      <Route path={ROUTES.register} element={<RegisterPage />} />

                      {/* Account area: its own shell (no public search bar, no
                          login/register buttons) instead of RootLayout, and
                          behind RequireAuth — these routes show a real
                          account, so an unauthenticated visitor is sent to
                          the login page. */}
                      <Route element={<RequireAuth />}>
                        <Route element={<DashboardLayout />}>
                          <Route path={ROUTES.dashboard}>
                            <Route index element={<Navigate to={ROUTES.dashboardProfile} replace />} />
                            <Route path="profile" element={<DashboardPage />} />
                            <Route path="listings" element={<DashboardListingsPage />} />
                            <Route path="chats" element={<DashboardChatsPage />} />
                            <Route path="edit-profile" element={<DashboardEditProfilePage />} />
                          </Route>
                          <Route path={ROUTES.createListing} element={<CreateListingPage />} />
                          {/* Same form component in edit mode — see CreateListingPage. */}
                          <Route path={ROUTES.editListing} element={<CreateListingPage />} />
                        </Route>
                      </Route>
                    </Routes>
                  </BrowserRouter>
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
