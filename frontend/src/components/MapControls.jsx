import { useCallback, useRef, useState } from 'react'
import { Check, Layers, LocateFixed, Minus, Plus } from 'lucide-react'
import { useLocale } from '../context/LocaleContext'
import { useDismiss } from '../hooks/useDismiss'
import { MAP_LAYERS } from '../data/mapLayers'

const BUTTON_CLASS =
  'flex size-8 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-white/70 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary'

// Layers / My Location / Zoom in / Zoom out. Rendered horizontally inside the
// top glass bar on mobile and vertically in the map's bottom-right corner on
// desktop, so each instance keeps its own popover state.
function MapControls({
  layerId,
  onLayerChange,
  onLocate,
  onZoomIn,
  onZoomOut,
  orientation = 'horizontal',
  menuPlacement = 'bottom',
}) {
  const { t } = useLocale()
  const [isLayerMenuOpen, setIsLayerMenuOpen] = useState(false)
  const layerMenuRef = useRef(null)

  const closeLayerMenu = useCallback(() => setIsLayerMenuOpen(false), [])
  useDismiss(layerMenuRef, isLayerMenuOpen, closeLayerMenu)

  return (
    <div
      className={`flex items-center gap-1 ${
        orientation === 'vertical' ? 'flex-col' : 'justify-end'
      }`}
    >
      <div ref={layerMenuRef} className="relative">
        <button
          type="button"
          onClick={() => setIsLayerMenuOpen((open) => !open)}
          aria-haspopup="true"
          aria-expanded={isLayerMenuOpen}
          aria-label={t('map.layers')}
          title={t('map.layers')}
          className={`${BUTTON_CLASS} ${isLayerMenuOpen ? 'bg-white/70 text-primary' : ''}`}
        >
          <Layers aria-hidden="true" size={16} />
        </button>

        {isLayerMenuOpen ? (
          <div
            role="dialog"
            aria-label={t('map.layers')}
            className={`absolute right-0 z-40 w-44 rounded-md border border-border bg-surface p-1.5 shadow-md ${
              menuPlacement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
            }`}
          >
            {MAP_LAYERS.map((layer) => {
              const isActive = layer.id === layerId
              return (
                <button
                  key={layer.id}
                  type="button"
                  onClick={() => {
                    onLayerChange(layer.id)
                    closeLayerMenu()
                  }}
                  aria-pressed={isActive}
                  className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    isActive ? 'font-medium text-primary' : 'text-text-primary'
                  }`}
                >
                  {t(layer.labelKey)}
                  {isActive ? <Check aria-hidden="true" size={14} /> : null}
                </button>
              )
            })}
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onLocate}
        aria-label={t('map.locateMe')}
        title={t('map.locateMe')}
        className={BUTTON_CLASS}
      >
        <LocateFixed aria-hidden="true" size={16} />
      </button>
      <button
        type="button"
        onClick={onZoomIn}
        aria-label={t('map.zoomIn')}
        title={t('map.zoomIn')}
        className={BUTTON_CLASS}
      >
        <Plus aria-hidden="true" size={16} />
      </button>
      <button
        type="button"
        onClick={onZoomOut}
        aria-label={t('map.zoomOut')}
        title={t('map.zoomOut')}
        className={BUTTON_CLASS}
      >
        <Minus aria-hidden="true" size={16} />
      </button>
    </div>
  )
}

export default MapControls
