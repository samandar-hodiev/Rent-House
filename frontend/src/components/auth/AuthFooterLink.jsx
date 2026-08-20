import { Link } from 'react-router-dom'

// The "have an account? / no account?" line under the card. Its own component
// so the prompt and link keep identical spacing and weight on both screens.
function AuthFooterLink({ prompt, to, label }) {
  return (
    <p className="mt-6 text-center text-sm text-text-secondary">
      {prompt}{' '}
      <Link
        to={to}
        className="font-medium text-primary transition-colors hover:text-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {label}
      </Link>
    </p>
  )
}

export default AuthFooterLink
