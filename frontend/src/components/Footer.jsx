import { Link } from 'react-router-dom'
import { ROUTES } from '../routes/paths'
import Container from './Container'

function Footer() {
  return (
    <footer className="border-t border-border bg-surface">
      <Container className="flex flex-col gap-4 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-text-primary">RentHouse</p>
          <p className="mt-1 text-sm text-text-muted">
            Toshkentda uy-joy ijarasini qidirishning qulay usuli.
          </p>
        </div>

        <nav aria-label="Qo'shimcha havolalar" className="flex gap-5">
          <Link
            to={ROUTES.search}
            className="text-sm text-text-secondary hover:text-primary"
          >
            Qidiruv
          </Link>
          <Link to={ROUTES.map} className="text-sm text-text-secondary hover:text-primary">
            Xarita
          </Link>
          <Link
            to={ROUTES.owner}
            className="text-sm text-text-secondary hover:text-primary"
          >
            Uy egalari uchun
          </Link>
        </nav>

        <p className="text-sm text-text-muted">
          &copy; {new Date().getFullYear()} RentHouse
        </p>
      </Container>
    </footer>
  )
}

export default Footer
