import { useId } from 'react'
import { Check } from 'lucide-react'

// Multi-select attributes (amenities, rental rules) as toggle chips — the same
// visual language as SegmentedField, but independent choices.
function CheckboxGroup({ label, options, selected, onToggle }) {
  const id = useId()

  return (
    <div className="flex flex-col gap-1.5">
      <span id={id} className="text-sm font-medium text-text-primary">
        {label}
      </span>

      <div aria-labelledby={id} className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = selected.includes(option.id)
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onToggle(option.id)}
              className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                isSelected
                  ? 'border-primary bg-primary-light font-medium text-primary-hover dark:text-primary'
                  : 'border-border text-text-secondary hover:bg-surface-secondary hover:text-text-primary'
              }`}
            >
              {isSelected ? <Check aria-hidden="true" size={14} /> : null}
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default CheckboxGroup
