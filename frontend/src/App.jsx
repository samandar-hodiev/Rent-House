import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { LocaleProvider } from './context/LocaleContext'
import { ThemeProvider } from './context/ThemeContext'
import { SearchProvider } from './context/SearchContext'
import { WishlistProvider } from './context/WishlistContext'
import RootLayout from './layouts/RootLayout'
import DashboardLayout from './components/dashboard/DashboardLayout'
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
import DashboardSettingsPage from './pages/DashboardSettingsPage'
import CreateListingPage from './pages/CreateListingPage'
import NotFoundPage from './pages/NotFoundPage'
import { ROUTES } from './routes/paths'

function App() {
  return (
    <LocaleProvider>
      <ThemeProvider>
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
                <Route path={ROUTES.login} element={<LoginPage />} />
                <Route path={ROUTES.register} element={<RegisterPage />} />
                <Route path={ROUTES.profile} element={<ProfilePage />} />
                <Route path={ROUTES.owner} element={<OwnerDashboardPage />} />
                <Route path={ROUTES.admin} element={<AdminPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>

              {/* Account area: its own shell (no public search bar, no
                  login/register buttons) instead of RootLayout. */}
              <Route element={<DashboardLayout />}>
                <Route path={ROUTES.dashboard}>
                  <Route index element={<Navigate to={ROUTES.dashboardProfile} replace />} />
                  <Route path="profile" element={<DashboardPage />} />
                  <Route path="listings" element={<DashboardListingsPage />} />
                  <Route path="chats" element={<DashboardChatsPage />} />
                  <Route path="settings" element={<DashboardSettingsPage />} />
                </Route>
                <Route path={ROUTES.createListing} element={<CreateListingPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </WishlistProvider>
      </SearchProvider>
      </ThemeProvider>
    </LocaleProvider>
  )
}

export default App
