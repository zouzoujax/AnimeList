/**
 * La jaquette en grand, le titre centré dessous.
 *
 * Posée dans <body> comme les autres fenêtres : sous un parent transformé, un
 * `position: fixed` se calerait sur la page au lieu de l'écran. Échap ou un
 * clic n'importe où la referme — il n'y a rien d'autre à faire ici que
 * regarder.
 */

import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { t } from '@shared/i18n'

export function CoverViewer({
  open,
  src,
  title,
  subtitle,
  onClose
}: {
  open: boolean
  src: string
  title: string
  subtitle?: string | null
  onClose: () => void
}): React.JSX.Element {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="fixed inset-0 z-[60] flex cursor-zoom-out flex-col items-center justify-center gap-5 bg-black/85 p-8 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
        >
          <motion.img
            src={src}
            alt={title}
            className="max-h-[calc(100vh-180px)] max-w-[min(92vw,900px)] rounded-[20px] object-contain shadow-2xl"
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.97, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
          />
          <div className="max-w-[min(92vw,900px)] text-center">
            <p className="title-xl text-[1.5rem] leading-tight text-white">{title}</p>
            {subtitle && <p className="mt-1 text-[0.84rem] text-white/60">{subtitle}</p>}
          </div>
          <span className="sr-only">{t('Fermer')}</span>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
