import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { LocaleProvider } from './context/LocaleContext'
import { SearchProvider } from './context/SearchContext'
import RootLayout from './layouts/RootLayout'
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
import NotFoundPage from './pages/NotFoundPage'
import { ROUTES } from './routes/paths'

function App() {
  return (
    <LocaleProvider>
      <SearchProvider>
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
          </Routes>
        </BrowserRouter>
      </SearchProvider>
    </LocaleProvider>
  )
}

export default App
