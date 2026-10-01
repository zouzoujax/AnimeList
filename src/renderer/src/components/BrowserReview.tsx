/**
 * La revue de ce qui a été regardé dans le navigateur.
 *
 * Le suivi coche tout seul, pendant qu'on regarde ailleurs : quand on revient
 * dans l'app, on voit ce qui a été coché, et ce qu'on a regardé hors de la
 * bibliothèque. Une coche automatique ne doit jamais passer inaperçue — c'est
 * la bibliothèque qu'elle modifie.
 *
 * Deux parties, qui ne se décident pas pareil :
 *
 * - **coché** : c'est déjà écrit. Cliquer un épisode le décoche aussitôt, et
 *   le suivi ne le recoche pas ; fermer garde le reste ;
 * - **pas dans ta bibliothèque** : rien n'est écrit. La série a été retrouvée
 *   sur AniList d'après le titre du site, qui peut se tromper — elle n'entre
 *   que sur « Ajouter et cocher ». Fermer l'ignore.
 *
 * Pas de bouton « Confirmer » : chaque bouton agit tout de suite, et la revue
 * se referme d'elle-même quand il ne reste rien à trancher.
 */

import { Check, Globe, Plus, Undo2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { BrowserFind, BrowserTick } from '@shared/browser-watch'
import type { Media } from '@shared/types'
import { Modal, Poster } from '@/components/ui'
import { titleOf } from '@/lib/format'
import { useApp } from '@/store/app'
import { t as tr, locale } from '@shared/i18n'

const keyOf = (t: { episode: number } & ({ animeId: number } | { media: Media })): string =>
  `${'animeId' in t ? t.animeId : t.media.id}:${t.episode}`

/** « 14 h 32 », ou la date devant quand ce n'est pas aujourd'hui. */
function whenLabel(at: number): string {
  const d = new Date(at)
  const time = d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }).replace(':', ' h ')
  return d.toDateString() === new Date().toDateString()
    ? time
    : `${d.toLocaleDateString(locale(), { day: 'numeric', month: 'short' })}, ${time}`
}

/** « Ép. 3 », « Ép. 3, 4 ». */
const episodesLabel = (episodes: number[]): string => tr('Ép. {list}', { list: episodes.join(', ') })

/** Regroupe par série, épisodes dans l'ordre. */
function bySeries<T extends { episode: number }>(items: T[], idOf: (t: T) => number): { id: number; items: T[] }[] {
  const map = new Map<number, T[]>()
  for (const t of items) map.set(idOf(t), [...(map.get(idOf(t)) ?? []), t])
  return [...map.entries()].map(([id, list]) => ({ id, items: [...list].sort((a, b) => a.episode - b.episode) }))
}

export function BrowserReview(): React.JSX.Element {
  const mediaMap = useApp((s) => s.media)
  const lang = useApp((s) => s.prefs.titleLang)
  const toast = useApp((s) => s.toast)
  const [ticks, setTicks] = useState<BrowserTick[]>([])
  const [finds, setFinds] = useState<BrowserFind[]>([])
  /** Les épisodes décochés depuis la revue. */
  const [dropped, setDropped] = useState<Set<string>>(new Set())

  useEffect(() => {
    // Seulement quand la fenêtre a la main : c'est le retour dans l'app qui
    // montre la revue, pas la coche elle-même, arrivée pendant qu'on était ailleurs.
    const pull = (): void => {
      if (!document.hasFocus()) return
      void window.api.browserWatch.takeReview().then((batch) => {
        const merge = <T,>(prev: T[], next: T[], key: (t: T) => string): T[] => {
          const known = new Set(prev.map(key))
          return [...prev, ...next.filter((t) => !known.has(key(t)))]
        }
        if (batch.ticks.length) setTicks((prev) => merge(prev, batch.ticks, keyOf))
        if (batch.finds.length) setFinds((prev) => merge(prev, batch.finds, keyOf))
      })
    }
    pull()
    window.addEventListener('focus', pull)
    const off = window.api.browserWatch.onTicked(pull)
    return () => {
      window.removeEventListener('focus', pull)
      off()
    }
  }, [])

  const tickGroups = useMemo(() => bySeries(ticks, (t) => t.animeId), [ticks])
  const findGroups = useMemo(() => bySeries(finds, (t) => t.media.id), [finds])

  const close = (): void => {
    setTicks([])
    setFinds([])
    setDropped(new Set())
  }

  /** Retire une série proposée ; la revue se ferme s'il ne reste rien. */
  const settleFind = (id: number): void => {
    const rest = finds.filter((f) => f.media.id !== id)
    setFinds(rest)
    if (!rest.length && !ticks.length) close()
  }

  const toggleTick = (t: BrowserTick): void => {
    const off = !dropped.has(keyOf(t))
    setDropped((prev) => {
      const next = new Set(prev)
      if (off) next.add(keyOf(t))
      else next.delete(keyOf(t))
      return next
    })
    void window.api.library.setWatched(t.animeId, t.episode, !off)
  }

  const untickAll = async (): Promise<void> => {
    const kept = ticks.filter((t) => !dropped.has(keyOf(t)))
    setDropped(new Set(ticks.map(keyOf)))
    for (const t of kept) await window.api.library.setWatched(t.animeId, t.episode, false)
    toast(kept.length > 1 ? tr('{length} épisodes décochés', { length: kept.length }) : tr('Épisode décoché'), 'ok')
  }

  const add = async (items: BrowserFind[]): Promise<void> => {
    const media = items[0].media
    settleFind(media.id)
    await window.api.library.setEntry(media.id, { status: 'watching' }, media)
    for (const f of items) await window.api.library.setWatched(media.id, f.episode, true)
    toast(
      tr('{v0} ajoutée · {v1} coché', { v0: titleOf(media, lang), v1: episodesLabel(items.map((f) => f.episode)) }),
      'ok'
    )
  }

  const heading =
    ticks.length && finds.length
      ? tr('Regardé dans ton navigateur')
      : ticks.length
        ? ticks.length > 1
          ? tr('{length} épisodes regardés dans ton navigateur', { length: ticks.length })
          : tr('Un épisode regardé dans ton navigateur')
        : findGroups.length > 1
          ? tr('{length} séries regardées hors de ta bibliothèque', { length: findGroups.length })
          : tr('Une série regardée hors de ta bibliothèque')

  return (
    <Modal open={ticks.length + finds.length > 0} onClose={close} width={520}>
      <div className="p-6">
        <h3 className="title-xl mb-1 flex items-center gap-2 text-[1.1rem]">
          <Globe size={18} />
          {heading}
        </h3>
        <p className="mb-5 text-[0.8rem] leading-relaxed text-muted">
          {ticks.length > 0 && tr('Coché pendant que tu regardais ailleurs : clique sur un épisode pour le décocher. ')}
          {finds.length > 0 && tr('Retrouvé sur AniList d’après le titre du site : rien n’est ajouté sans toi.')}
        </p>

        <div className="mb-5 flex max-h-[50vh] flex-col gap-4 overflow-y-auto">
          {tickGroups.length > 0 && (
            <section>
              {finds.length > 0 && <p className="label mb-2">{tr('Coché')}</p>}
              <ul className="flex flex-col gap-2.5">
                {tickGroups.map(({ id, items }) => {
                  const media = mediaMap.get(id)
                  return (
                    <li key={id} className="glass flex gap-3 rounded-[14px] p-2.5">
                      <Poster
                        src={media?.cover.large ?? ''}
                        alt=""
                        className="h-[74px] w-[52px] shrink-0"
                        rounded="rounded-[9px]"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="clamp-2 text-[0.86rem] font-semibold leading-snug">
                          {media ? titleOf(media, lang) : tr('Série {id}', { id })}
                        </p>
                        <p className="mt-0.5 text-[0.72rem] text-faint">
                          {items[0].site} · {whenLabel(items[items.length - 1].at)}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {items.map((t) => {
                            const on = !dropped.has(keyOf(t))
                            return (
                              <button
                                key={t.episode}
                                className="btn !h-7 !px-2.5 text-[0.74rem]"
                                aria-pressed={on}
                                title={on ? tr('Décocher cet épisode') : tr('Le recocher')}
                                style={on ? undefined : { opacity: 0.5, textDecoration: 'line-through' }}
                                onClick={() => toggleTick(t)}
                              >
                                {on && <Check size={13} />}
                                {tr('Ép. {n}', { n: t.episode })}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {findGroups.length > 0 && (
            <section>
              <p className="label mb-2">{tr('Pas dans ta bibliothèque')}</p>
              <ul className="flex flex-col gap-2.5">
                {findGroups.map(({ id, items }) => {
                  const media = items[0].media
                  return (
                    <li key={id} className="glass flex gap-3 rounded-[14px] p-2.5">
                      <Poster
                        src={media.cover.large}
                        alt=""
                        className="h-[74px] w-[52px] shrink-0"
                        rounded="rounded-[9px]"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="clamp-2 text-[0.86rem] font-semibold leading-snug">{titleOf(media, lang)}</p>
                        <p className="mt-0.5 text-[0.72rem] text-faint">
                          {episodesLabel(items.map((f) => f.episode))} · {items[0].site} ·{' '}
                          {whenLabel(items[items.length - 1].at)}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <button
                            className="btn btn-primary !h-7 !px-2.5 text-[0.74rem]"
                            onClick={() => void add(items)}
                          >
                            <Plus size={13} />
                            {tr('Ajouter et cocher')}
                          </button>
                          <button className="btn !h-7 !px-2.5 text-[0.74rem]" onClick={() => settleFind(id)}>
                            <X size={13} />
                            {tr('Ignorer')}
                          </button>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </div>

        <div className="flex justify-end gap-2">
          {ticks.length > 0 && dropped.size < ticks.length && (
            <button className="btn" onClick={() => void untickAll()}>
              <Undo2 size={14} />
              {tr('Tout décocher')}
            </button>
          )}
          <button className="btn" onClick={close}>
            {tr('Fermer')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
