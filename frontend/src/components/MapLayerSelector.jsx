import { useCallback, useRef, useState } from 'react'
import { Check, Layers } from 'lucide-react'
import { useLocale } from '../context/LocaleContext'
import { useDismiss } from '../hooks/useDismiss'
import { MAP_LAYERS, getMapLayerById } from '../data/mapLayers'

// Small stylised map previews, drawn inline rather than fetched: the Yandex
// raster tile endpoints are undocumented, and a preview must never depend on
// a network round-trip to render.
function LayerThumb({ layerId, className = '' }) {
  const common = { className: `size-full ${className}`, viewBox: '0 0 64 48', 'aria-hidden': true }

  if (layerId === 'satellite') {
    return (
      <svg {...common}>
        <rect width="64" height="48" fill="#33502f" />
        <path d="M0 30c10-6 18 2 28-3s22 3 36-4v25H0z" fill="#2b4428" />
        <path d="M0 12c12 4 20-3 30 1s22-2 34 2" stroke="#4a6b3f" strokeWidth="5" fill="none" />
        <path d="M14 0c4 12-6 20 2 30s16 6 22 18" stroke="#6d8f5c" strokeWidth="2" fill="none" />
        <circle cx="48" cy="14" r="6" fill="#3f5c37" />
      </svg>
    )
  }

  if (layerId === 'traffic') {
    return (
      <svg {...common}>
        <rect width="64" height="48" fill="#eef1e9" />
        <rect x="4" y="4" width="18" height="14" rx="2" fill="#e2e8f0" />
        <rect x="42" y="30" width="18" height="14" rx="2" fill="#e2e8f0" />
        <path d="M0 24h64" stroke="#fff" strokeWidth="7" />
        <path d="M26 0v48" stroke="#fff" strokeWidth="7" />
        <path d="M0 24h22" stroke="#059669" strokeWidth="3.5" />
        <path d="M22 24h20" stroke="#f59e0b" strokeWidth="3.5" />
        <path d="M42 24h22" stroke="#e11d48" strokeWidth="3.5" />
        <path d="M26 0v18" stroke="#059669" strokeWidth="3.5" />
        <path d="M26 30v18" stroke="#e11d48" strokeWidth="3.5" />
      </svg>
    )
  }

  return (
    <svg {...common}>
      <rect width="64" height="48" fill="#eef1e9" />
      <rect x="4" y="4" width="16" height="12" rx="2" fill="#e2e8f0" />
      <rect x="44" y="6" width="16" height="12" rx="2" fill="#e2e8f0" />
      <rect x="6" y="30" width="14" height="14" rx="2" fill="#e2e8f0" />
      <rect x="40" y="28" width="20" height="16" rx="2" fill="#d9f0e2" />
      <path d="M0 22h64" stroke="#fff" strokeWidth="6" />
      <path d="M30 0v48" stroke="#fff" strokeWidth="6" />
      <path d="M0 22h64" stroke="#f8c57c" strokeWidth="2" />
      <path d="M30 0v48" stroke="#f8c57c" strokeWidth="2" />
      <path d="M0 38h30" stroke="#fff" strokeWidth="3" />
    </svg>
  )
}

// Google-Maps-style layer picker: a compact preview card that expands into a
// horizontal row of layer cards. Kept separate from MapControls so the
// location/zoom buttons stay a plain icon row.
// `layers` narrows the choices for a caller that has no use for all of them —
// the listing form's location picker offers street and satellite but not
// traffic. Defaults to the full set, so the Map page passes nothing.
function MapLayerSelector({ layerId, onLayerChange, layers = MAP_LAYERS }) {
  const { t } = useLocale()
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef(null)

  const close = useCallback(() => setIsOpen(false), [])
  useDismiss(containerRef, isOpen, close)

  const activeLayer = getMapLayerById(layerId)

  return (
    // Intentionally not `relative`: the panel is positioned against the shared
    // control container (MapPage), so it aligns with the whole group's right
    // edge rather than this button's, and fits on narrow screens.
    <div ref={containerRef}>
      {isOpen ? (
        <div
          role="dialog"
          aria-label={t('map.layers')}
          className="absolute bottom-full right-0 mb-3 max-w-[calc(100vw-1.5rem)] overflow-x-auto rounded-xl border border-border bg-surface p-2 shadow-[0_4px_16px_rgba(15,23,42,0.12)] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <ul className="flex items-stretch gap-2">
            {layers.map((layer) => {
              const isActive = layer.id === layerId
              return (
                <li key={layer.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onLayerChange(layer.id)
                      close()
                    }}
                    aria-pressed={isActive}
                    className="group flex w-20 shrink-0 flex-col gap-1 focus:outline-none"
                  >
                    <span
                      className={`relative block h-12 w-full overflow-hidden rounded-lg border transition-colors ${
                        isActive
                          ? 'border-primary ring-2 ring-primary'
                          : 'border-border group-hover:border-primary/50'
                      }`}
                    >
                      <LayerThumb layerId={layer.id} />
                      {isActive ? (
                        <span className="absolute bottom-0.5 right-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-white shadow-sm">
                          <Check aria-hidden="true" size={11} strokeWidth={3} />
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={`text-center text-[11px] leading-tight ${
                        isActive ? 'font-semibold text-primary' : 'text-text-secondary'
                      }`}
                    >
                      {t(layer.labelKey)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        title={t('map.layers')}
        className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          isOpen ? 'bg-white/70 text-primary' : 'text-slate-600 dark:text-slate-700 hover:bg-white/70 hover:text-primary'
        }`}
      >
        <span className="block size-6 shrink-0 overflow-hidden rounded-full border border-white/70">
          <LayerThumb layerId={activeLayer.id} />
        </span>
        <Layers aria-hidden="true" size={12} className="shrink-0" />
        <span className="whitespace-nowrap text-xs font-medium leading-none">
          {t('map.layersShort')}
        </span>
      </button>
    </div>
  )
}

export default MapLayerSelector
