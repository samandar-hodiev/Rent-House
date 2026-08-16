function Container({ children, className = '' }) {
  return (
    <div className={`mx-auto w-full max-w-336 px-4 sm:px-6 ${className}`}>
      {children}
    </div>
  )
}

export default Container
