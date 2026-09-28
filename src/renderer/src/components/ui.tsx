import { ChevronLeft, ChevronRight, LoaderCircle, TriangleAlert } from 'lucide-react'
import { AnimatePresence, animate, motion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function Section({
  id,
  title,
  subtitle,
  action,
  children
}: {
  /** Anchor, so a link or the screenshot run can jump straight to the section. */
  id?: string
  title: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
}): React.JSX.Element {
  return (
    <section id={id} className="mb-9">
      <header className="mb-3.5 flex items-end justify-between gap-4 px-1">
        <div>
          <h2 className="title-xl text-[1.32rem] leading-tight">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[0.8rem] text-muted">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

/** Horizontal rail with edge fades and hover arrows. */
export function RowScroller({ children }: { children: ReactNode }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })

  const measure = (): void => {
    const el = ref.current
    if (!el) return
    setEdges({
      left: el.scrollLeft > 8,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 8
    })
  }

  useEffect(() => {
    measure()
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [children])

  const scrollBy = (dir: number): void =>
    ref.current?.scrollBy({ left: dir * Math.max(320, ref.current.clientWidth * 0.8), behavior: 'smooth' })

  return (
    <div className="group/row relative">
      <div ref={ref} onScroll={measure} className="scroll-x flex gap-3.5 px-1 pb-2 pt-1">
        {children}
      </div>
      {(['left', 'right'] as const).map((side) =>
        edges[side] ? (
          <button
            key={side}
            onClick={() => scrollBy(side === 'left' ? -1 : 1)}
            aria-label={side === 'left' ? 'Précédent' : 'Suivant'}
            className="glass-blur absolute top-1/2 z-10 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full opacity-0 transition group-hover/row:opacity-100 hover:!bg-white/12"
            style={{ [side]: '-6px' }}
          >
            {side === 'left' ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
          </button>
        ) : null
      )}
    </div>
  )
}

export function Poster({
  src,
  alt,
  className = '',
  rounded = 'rounded-[14px]'
}: {
  src: string
  alt: string
  className?: string
  rounded?: string
}): React.JSX.Element {
  const [loaded, setLoaded] = useState(false)
  return (
    <div className={`relative overflow-hidden bg-white/4 ${rounded} ${className}`}>
      {!loaded && <div className="skeleton absolute inset-0" />}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        draggable={false}
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        className="h-full w-full object-cover transition-[opacity,transform] duration-500 ease-[cubic-bezier(.2,.8,.2,1)]"
        style={{ opacity: loaded ? 1 : 0 }}
      />
    </div>
  )
}

export function Skeleton({
  className = '',
  style
}: {
  className?: string
  style?: React.CSSProperties
}): React.JSX.Element {
  return <div className={`skeleton rounded-[14px] ${className}`} style={style} />
}

export function PosterSkeletons({ count = 8 }: { count?: number }): React.JSX.Element {
  return (
    <div className="flex gap-3.5 px-1">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="w-[168px] shrink-0">
          <Skeleton className="aspect-[2/3] w-full" />
          <Skeleton className="mt-2.5 h-3 w-4/5 rounded-md" />
          <Skeleton className="mt-1.5 h-2.5 w-1/2 rounded-md" />
        </div>
      ))}
    </div>
  )
}

/**
 * La fiche d'un anime avant ses données : la bannière, l'affiche, le titre, la
 * grille d'épisodes et la colonne de droite, aux places qu'ils prendront. La
 * page se remplit au lieu de sauter d'un bloc gris à une mise en page entière.
 */
export function FicheSkeleton({ children }: { children?: ReactNode }): React.JSX.Element {
  return (
    <div className="fiche-skeleton pb-14" aria-busy="true" aria-label="Chargement de la fiche">
      <div className="relative">
        {children && <div className="absolute inset-x-0 top-0 z-10 mx-auto max-w-[1400px] px-7 pt-5">{children}</div>}
        <div className="skeleton absolute inset-x-0 top-0 h-[330px] !rounded-none opacity-60" />
        <div
          className="absolute inset-x-0 top-0 h-[330px]"
          style={{ background: 'linear-gradient(180deg, transparent 30%, var(--bg) 100%)' }}
        />
        <div className="relative mx-auto flex max-w-[1400px] gap-7 px-7 pt-[168px]">
          <Skeleton className="hidden h-[286px] w-[194px] shrink-0 !rounded-[18px] md:block" />
          <div className="min-w-0 flex-1 pt-[92px]">
            <div className="mb-3 flex gap-2">
              <Skeleton className="h-6 w-14 !rounded-full" />
              <Skeleton className="h-6 w-28 !rounded-full" />
            </div>
            <Skeleton className="h-9 w-[min(520px,80%)] !rounded-lg" />
            <Skeleton className="mt-2.5 h-3.5 w-[min(300px,50%)] !rounded-md" />
            <div className="mt-6 flex gap-2">
              <Skeleton className="h-[38px] w-44 !rounded-xl" />
              <Skeleton className="h-[38px] w-24 !rounded-xl" />
              <Skeleton className="h-[38px] w-[38px] !rounded-xl" />
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto mt-9 grid max-w-[1400px] gap-7 px-7 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <Skeleton className="h-5 w-32 !rounded-md" />
          <div className="mt-4 space-y-2">
            {[100, 96, 98, 72].map((w, i) => (
              <Skeleton key={i} className="h-3 !rounded-md" style={{ width: `${w}%` }} />
            ))}
          </div>
          <Skeleton className="mt-10 h-5 w-28 !rounded-md" />
          <div className="mt-4 flex flex-wrap gap-1.5">
            {Array.from({ length: 24 }, (_, i) => (
              <Skeleton key={i} className="h-[38px] w-[42px] !rounded-[10px]" />
            ))}
          </div>
        </div>
        <aside className="flex flex-col gap-4">
          <Skeleton className="h-[100px] w-full !rounded-[20px]" />
          <Skeleton className="h-[150px] w-full !rounded-[20px]" />
          <Skeleton className="h-[220px] w-full !rounded-[20px]" />
        </aside>
      </div>
    </div>
  )
}

export function Spinner({ label }: { label?: string }): React.JSX.Element {
  return (
    <div className="flex items-center justify-center gap-2.5 py-10 text-sm text-muted">
      <LoaderCircle size={17} className="animate-spin" />
      {label ?? 'Chargement…'}
    </div>
  )
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }): React.JSX.Element {
  return (
    <div className="glass flex flex-wrap items-center gap-x-3.5 gap-y-2.5 rounded-2xl px-4 py-3.5 text-sm">
      <TriangleAlert size={18} className="shrink-0 text-amber-300" />
      {/* `min-w-[10rem]` force le bouton à passer dessous plutôt que de réduire
          le texte à un ruban : cet encadré s'affiche aussi dans la colonne
          étroite d'une fiche. */}
      <span className="min-w-[10rem] flex-1 text-muted">{message}</span>
      {onRetry && (
        <button className="btn" onClick={onRetry}>
          Réessayer
        </button>
      )}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  hint,
  action
}: {
  icon: ReactNode
  title: string
  hint?: string
  action?: ReactNode
}): React.JSX.Element {
  return (
    <div className="glass flex flex-col items-center gap-3 rounded-3xl px-6 py-14 text-center">
      <div
        className="grid h-14 w-14 place-items-center rounded-2xl text-white/80"
        style={{ background: 'color-mix(in oklab, var(--accent) 18%, transparent)' }}
      >
        {icon}
      </div>
      <h3 className="title-xl text-[1.05rem]">{title}</h3>
      {hint && <p className="max-w-sm text-[0.83rem] leading-relaxed text-faint">{hint}</p>}
      {action}
    </div>
  )
}

/**
 * Un nombre qui défile jusqu'à sa valeur plutôt que d'y sauter. Écrit dans le
 * DOM à chaque image, sans repasser par React.
 */
export function CountUp({ value, suffix = '' }: { value: number; suffix?: string }): React.JSX.Element {
  const ref = useRef<HTMLSpanElement>(null)
  const from = useRef(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const controls = animate(from.current, value, {
      duration: document.body.classList.contains('reduce-motion') ? 0 : 0.9,
      ease: [0.2, 0.8, 0.2, 1],
      onUpdate: (v) => {
        from.current = v
        el.textContent = `${Math.round(v)}${suffix}`
      }
    })
    return () => controls.stop()
  }, [value, suffix])
  return <span ref={ref}>{`0${suffix}`}</span>
}

export function ProgressRing({
  value,
  size = 44,
  stroke = 3.5,
  children
}: {
  value: number
  size?: number
  stroke?: number
  children?: ReactNode
}): React.JSX.Element {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const id = `ring-${size}-${stroke}`
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--accent-2)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth={stroke} />
        {/* Part de zéro à l'affichage : l'anneau se remplit jusqu'où on en est,
            puis suit chaque épisode coché. */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - Math.max(0, Math.min(1, value))) }}
          transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  )
}

export function Modal({
  open,
  onClose,
  children,
  width = 620
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  width?: number
}): React.JSX.Element {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  /*
   * Posée dans <body>, jamais dans la page.
   *
   * Une fenêtre est en `position: fixed`, donc calée sur l'écran — sauf si un
   * ancêtre porte un `transform`, un `filter` ou un `clip-path`, qui en font un
   * nouveau repère. Les transitions de page des expériences en posent un : la
   * fenêtre s'ouvrait alors en haut du document, et le `clip-path` du Cockpit la
   * découpait entièrement.
   */
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-start justify-center pt-[14vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
        >
          <div className="absolute inset-0 bg-black/55 backdrop-blur-[3px]" onClick={onClose} />
          <motion.div
            className="glass-blur relative w-[92vw] overflow-hidden rounded-[22px] shadow-2xl"
            style={{ maxWidth: width }}
            initial={{ y: 14, scale: 0.985, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 8, scale: 0.99, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
