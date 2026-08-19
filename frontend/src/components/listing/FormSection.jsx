// Section wrapper for the listing form: one titled card per group of fields,
// so the form reads as sections rather than one long column of inputs.
function FormSection({ title, description, children }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      {description ? <p className="mt-1 text-xs text-text-muted">{description}</p> : null}
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  )
}

export default FormSection
