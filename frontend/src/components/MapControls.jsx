import { LocateFixed, Minus, Plus } from 'lucide-react'
import { useLocale } from '../context/LocaleContext'

const BUTTON_CLASS =
  'flex size-8 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-white/70 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary'

// My Location / Zoom in / Zoom out. The layer picker is its own card next to
// this row — see MapLayerSelector.
function MapControls({ onLocate, onZoomIn, onZoomOut, orientation = 'horizontal' }) {
  const { t } = useLocale()

  return (
    <div
      className={`flex items-center gap-1 ${
        orientation === 'vertical' ? 'flex-col' : 'justify-end'
      }`}
    >
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
