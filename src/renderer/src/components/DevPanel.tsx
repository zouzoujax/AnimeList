/**
 * Le panneau secret : ↑ ↑ ↓ ↓ ← → ← → B A, n'importe où dans l'app.
 *
 * Des outils de développement qu'on ne veut pas dans les Réglages : l'état des
 * caches annexes (titres ANN, citations, fillers) avec de quoi les vider, la
 * santé d'AniList, les versions, et les DevTools. Rien d'irréversible ici :
 * chaque cache se reconstitue tout seul.
 */

import { Bug, Database, FolderOpen, RefreshCw, Trash2, Wrench } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { ApiHealth } from '@shared/api-health'
import { ageLabel } from '@shared/api-recovery'
import { Modal } from './ui'
import { useApp } from '@/store/app'
import { dec, num } from '@/lib/format'
import { useNow } from '@/lib/hooks'
import { t } from '@shared/i18n'

const KONAMI = [
  'arrowup',
  'arrowup',
  'arrowdown',
  'arrowdown',
  'arrowleft',
  'arrowright',
  'arrowleft',
  'arrowright',
  'b',
  'a'
]

/** Appelle `onCode` quand la séquence est tapée en entier, hors d'un champ de saisie. */
function useKonami(onCode: () => void): void {
  useEffect(() => {
    let step = 0
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return
      const key = e.key.toLowerCase()
      // Une fausse note recommence la séquence — mais un ↑ peut en ouvrir une nouvelle.
      step = key === KONAMI[step] ? step + 1 : key === KONAMI[0] ? 1 : 0
      if (step === KONAMI.length) {
        step = 0
        onCode()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCode])
}

type Info = Awaited<ReturnType<typeof window.api.app.info>>
type Stats = Awaited<ReturnType<typeof window.api.dev.stats>>

function Line({ label, children }: { label: string; children: ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-[0.8rem]">
      <span className="text-muted">{label}</span>
      <span className="flex min-w-0 items-center gap-2 text-right tabular-nums">{children}</span>
    </div>
  )
}

function Block({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }): React.JSX.Element {
  return (
    <section className="border-b px-5 py-3.5 last:border-b-0" style={{ borderColor: 'var(--line)' }}>
      <p className="label mb-1.5 flex items-center gap-1.5">
        {icon}
        {title}
      </p>
      {children}
    </section>
  )
}

const small = 'btn !h-7 !px-2.5 text-[0.74rem]'

const DOT: Record<ApiHealth['state'], string> = {
  ok: '#34d399',
  limited: '#fbbf24',
  down: '#f87171',
  off: '#6b7392',
  unknown: '#6b7392'
}

const STATE_LABEL: Record<ApiHealth['state'], string> = {
  ok: t('Répond'),
  limited: t('Limite atteinte'),
  down: t('En panne'),
  off: t('Non configuré'),
  unknown: t('Inconnu')
}

export function DevPanel(): React.JSX.Element {
  const toast = useApp((s) => s.toast)
  const [open, setOpen] = useState(false)
  const [info, setInfo] = useState<Info | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [cache, setCache] = useState<{ entries: number; bytes: number } | null>(null)
  const [apis, setApis] = useState<ApiHealth[] | null>(null)
  const [probing, setProbing] = useState(false)

  const probeAll = useCallback(async () => {
    setProbing(true)
    try {
      setApis(await window.api.dev.apis())
    } finally {
      setProbing(false)
    }
  }, [])

  const refresh = useCallback(() => {
    void window.api.app.info().then(setInfo)
    void window.api.dev.stats().then(setStats)
    void window.api.cache.stats().then(setCache)
  }, [])

  const show = useCallback(() => {
    setOpen(true)
    refresh()
    setApis(null)
    void probeAll()
  }, [refresh, probeAll])
  useKonami(show)

  const clear = async (what: 'ann' | 'quotes' | 'filler', label: string): Promise<void> => {
    await window.api.dev.clear(what)
    toast(t('{label} vidé.', { label }), 'ok')
    refresh()
  }

  const now = useNow(30_000)

  return (
    <Modal open={open} onClose={() => setOpen(false)} width={520}>
      <div className="flex items-center gap-2 border-b px-5 py-4" style={{ borderColor: 'var(--line)' }}>
        <Bug size={16} style={{ color: 'var(--accent)' }} />
        <p className="text-[0.95rem] font-semibold">{t('Panneau secret')}</p>
        <span className="ml-auto text-[0.7rem] text-faint">↑↑↓↓←→←→BA</span>
      </div>

      <div className="max-h-[66vh] overflow-y-auto">
        <Block title={t('Version')} icon={<Wrench size={12} />}>
          <Line label="AnimeList">
            {info?.version ?? '…'} {import.meta.env.DEV ? t('(dev)') : t('(installée)')}
          </Line>
          <Line label="Electron · Chromium">{info ? `${info.electron} · ${info.chrome}` : '…'}</Line>
          <Line label={t('Schéma de données')}>
            {info ? `v${info.schema.version} / v${info.schema.expected}` : '…'}
            {info?.schema.readOnly && <span style={{ color: '#ff8080' }}>{t('lecture seule')}</span>}
          </Line>
          <Line label={t('Fichier de données')}>
            <span className="truncate text-[0.72rem] text-faint" title={info?.dbPath}>
              {info?.dbPath ?? '…'}
            </span>
            <button className={small} onClick={() => void window.api.data.reveal()} aria-label={t('Ouvrir le dossier')}>
              <FolderOpen size={12} />
            </button>
          </Line>
        </Block>

        <Block title={t('Services')} icon={<RefreshCw size={12} />}>
          <div className="mb-1 flex items-center justify-between gap-3 text-[0.72rem] text-faint">
            <span>{t('Vert : répond · orange : limite atteinte · rouge : en panne')}</span>
            <button className={small} disabled={probing} onClick={() => void probeAll()}>
              {probing ? t('Sondage…') : t('Sonder')}
            </button>
          </div>
          {apis === null && <p className="py-2 text-[0.78rem] text-faint">{t('Sondage…')}</p>}
          {apis?.map((a) => (
            <div key={a.id} className="flex items-start gap-2.5 py-1.5 text-[0.8rem]">
              <span
                className="mt-[5px] h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: DOT[a.state], boxShadow: a.state === 'off' ? 'none' : `0 0 8px ${DOT[a.state]}` }}
                title={STATE_LABEL[a.state]}
                aria-label={STATE_LABEL[a.state]}
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{a.name}</p>
                <p className="text-[0.7rem] text-faint">{a.purpose}</p>
              </div>
              <div className="max-w-[55%] text-right">
                <p className="text-[0.74rem] text-muted">{a.detail}</p>
                {a.ms !== null && (
                  <p className="text-[0.68rem] tabular-nums text-faint">{t('{ms} ms', { ms: a.ms })}</p>
                )}
              </div>
            </div>
          ))}
        </Block>

        <Block title={t('Caches')} icon={<Database size={12} />}>
          <Line label={t('AniList')}>
            {cache ? t('{n} réponses · {mo} Mo', { n: num(cache.entries), mo: dec(cache.bytes / 1048576) }) : '…'}
            <button
              className={small}
              onClick={async () => {
                await window.api.cache.purge()
                toast(t('{label} vidé.', { label: 'AniList' }), 'ok')
                refresh()
              }}
              aria-label={t('Vider')}
            >
              <Trash2 size={12} />
            </button>
          </Line>
          <Line label={t('Titres d’épisodes (ANN)')}>
            {stats ? t('{titled} titrées sur {series}', stats.ann) : '…'}
            <button className={small} onClick={() => void clear('ann', 'ANN')} aria-label={t('Vider')}>
              <Trash2 size={12} />
            </button>
          </Line>
          <Line label={t('Citations (AnimeChan)')}>
            {stats
              ? t('{quotes} citations · {asked} séries demandées', stats.quotes) +
                (stats.quotes.at ? ` · ${ageLabel(stats.quotes.at, now)}` : '') +
                (stats.quotes.pausedUntil && stats.quotes.pausedUntil > now ? ` · ${t('quota atteint')}` : '')
              : '…'}
            <button className={small} onClick={() => void clear('quotes', t('Citations'))} aria-label={t('Vider')}>
              <Trash2 size={12} />
            </button>
          </Line>
          <Line label={t('Fillers (Jikan)')}>
            {stats ? t('{series} séries', stats.filler) : '…'}
            <button className={small} onClick={() => void clear('filler', 'Fillers')} aria-label={t('Vider')}>
              <Trash2 size={12} />
            </button>
          </Line>
        </Block>

        <Block title={t('Actions')} icon={<Bug size={12} />}>
          <div className="flex flex-wrap gap-2 pt-1">
            <button className={small} onClick={() => void window.api.dev.devtools()}>
              {t('Ouvrir les DevTools')}
            </button>
            <button className={small} onClick={() => location.reload()}>
              {t('Recharger la fenêtre')}
            </button>
            <button
              className={small}
              onClick={async () => {
                const res = await window.api.anime.sweepSequels()
                toast(
                  t('{n} suite(s) ajoutée(s) sur {checked} séries.', { n: res.added.length, checked: res.checked }),
                  'ok'
                )
              }}
            >
              {t('Chercher les suites')}
            </button>
          </div>
        </Block>
      </div>
    </Modal>
  )
}
