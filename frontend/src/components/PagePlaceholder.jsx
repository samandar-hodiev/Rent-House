import Container from './Container'

function PagePlaceholder({ title, description }) {
  return (
    <Container className="py-16">
      <h1 className="text-2xl font-semibold text-text-primary">{title}</h1>
      {description ? (
        <p className="mt-2 max-w-2xl text-text-secondary">{description}</p>
      ) : null}
    </Container>
  )
}

export default PagePlaceholder
