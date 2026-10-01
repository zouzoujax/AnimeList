/**
 * Le journal : ce que tu as regardé, dans l'ordre où tu l'as regardé.
 *
 * Chaque épisode coché laisse une trace — une date, une durée, parfois un
 * ressenti ou quelques lignes écrites depuis sa fiche. Jusqu'ici ces notes ne
 * se relisaient que série par série, à condition de se souvenir de laquelle il
 * s'agissait. Ici elles reviennent toutes, à leur date, et un clic rouvre
 * l'épisode pour les corriger.
 *
 * Ce qui est montré se décide dans `lib/journal` : le nouveau design en donne
 * une autre forme, pas un autre contenu.
 */

import { NotebookPen, Pencil, Search, Star, X } from 'lucide-react'
import { useState } from 'react'
import { EMOTIONS, type EmotionId } from '@shared/types'
import EpisodeEditor from '@/components/EpisodeEditor'
import { JournalExport } from '@/components/JournalExport'
import { EmptyState, Poster } from '@/components/ui'
import { formatTime, minutesToHuman, pluralize, relativeDay, titleOf } from '@/lib/format'
import { JOURNAL_FILTERS, emotionOf, passLabel, useJournal } from '@/lib/journal'
import { useApp } from '@/store/app'
import { t } from '@shared/i18n'

function Emotions({ ids }: { ids: EmotionId[] }): React.JSX.Element {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {ids.map((id) => {
        const emotion = emotionOf(id)
        if (!emotion) return null
        return (
          <span key={id} title={emotion.label} className="text-[0.85rem] leading-none">
            <span aria-hidden>{emotion.emoji}</span>
            <span className="sr-only">{emotion.label}</span>
          </span>
        )
      })}
    </span>
  )
}

export default function JournalPage(): React.JSX.Element {
  const lang = useApp((s) => s.prefs.titleLang)
  const j = useJournal()
  const [editing, setEditing] = useState<{ animeId: number; episode: number } | null>(null)

  return (
    <div className="mx-auto max-w-[900px] px-7 py-7">
      <h1 className="title-xl mb-1 text-[1.85rem]">{t('Journal')}</h1>
      <p className="mb-1 text-[0.88rem] text-muted">
        {j.total === 0
          ? t('Chaque épisode coché viendra se poser ici, à sa date.')
          : t('{v0}, dont {v1}{v2}.', {
              v0: pluralize(j.total, t('épisode regardé'), t('épisodes regardés')),
              v1: pluralize(j.noted, t('porte une note'), t('portent une note')),
              v2: j.pinned > 0 ? t(' et {v}', { v: pluralize(j.pinned, t('est à revoir'), t('sont à revoir')) }) : ''
            })}
      </p>
      {/* Dit une fois, sans y revenir : sans cette phrase, quelqu'un qui a
          importé sa liste croirait à des épisodes perdus. */}
      {j.imported > 0 && (
        <p className="mb-6 text-[0.78rem] text-faint">
          {pluralize(j.imported, t('ligne importée reste'), t('lignes importées restent'))}{' '}
          {t(
            "en dehors : leur date est celle du pointage dans l'app d'origine, pas celle d'une soirée. La corriger depuis sa fiche la fait entrer ici."
          )}
        </p>
      )}

      {j.total > 0 && (
        <div className="mb-6 mt-5 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[16rem] flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <input
                type="search"
                className="field w-full !pl-9"
                placeholder={t('Chercher dans tes notes et tes séries…')}
                value={j.search}
                onChange={(e) => j.setSearch(e.target.value)}
              />
            </div>
            {JOURNAL_FILTERS.map((f) => (
              <button
                key={f.id}
                data-on={j.filter === f.id}
                className="chip"
                title={f.hint}
                onClick={() => j.setFilter(f.id)}
              >
                {f.id === 'pinned' && <Star size={12} fill={j.filter === 'pinned' ? 'currentColor' : 'none'} />}
                {f.label}
              </button>
            ))}
            <JournalExport rows={j.rows} filtered={j.rows.length !== j.total} />
          </div>

          {j.emotionCounts.size > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="label mr-1">{t('Ressenti')}</span>
              {EMOTIONS.filter((e) => j.emotionCounts.has(e.id)).map((e) => (
                <button
                  key={e.id}
                  data-on={j.emotion === e.id}
                  className="chip !h-7 text-[0.72rem]"
                  // Recliquer sur le filtre actif l'enlève : sans ça, il
                  // faudrait chercher un bouton « tous » qui n'existe pas.
                  onClick={() => j.setEmotion(j.emotion === e.id ? null : e.id)}
                >
                  <span aria-hidden>{e.emoji}</span>
                  {e.label}
                  <span className="ml-0.5 tabular-nums text-faint">{j.emotionCounts.get(e.id)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {j.total === 0 ? (
        <EmptyState
          icon={<NotebookPen size={22} />}
          title={j.imported > 0 ? t('Rien de daté pour l’instant') : t('Ton journal est vide')}
          hint={
            j.imported > 0
              ? t(
                  "Tout ton historique vient d'un import, et ces dates sont celles du pointage, pas du visionnage. Le prochain épisode que tu coches ici ouvrira le journal."
                )
              : t(
                  "Coche un épisode et il apparaîtra ici. Depuis sa fiche, tu peux lui ajouter un ressenti et quelques lignes — c'est ce que cette page te redonne, des mois plus tard."
                )
          }
        />
      ) : j.rows.length === 0 ? (
        <EmptyState
          icon={<Search size={22} />}
          title={t('Rien ne correspond')}
          hint={JOURNAL_FILTERS.find((f) => f.id === j.filter)?.hint}
          action={
            <button className="btn mt-1" onClick={j.reset}>
              <X size={13} />
              {t('Tout afficher')}
            </button>
          }
        />
      ) : (
        <>
          {j.days.map(({ day, rows: dayRows }) => {
            const minutes = dayRows.reduce((sum, r) => sum + r.event.minutes, 0)
            return (
              <section key={day} className="mb-7">
                <header className="mb-2.5 flex items-baseline gap-2 px-1">
                  <h2 className="text-[0.92rem] font-semibold">
                    {relativeDay(day).replace(/^./, (c) => c.toUpperCase())}
                  </h2>
                  <span className="text-[0.74rem] text-faint">
                    {pluralize(dayRows.length, t('épisode'), t('épisodes'))}
                    {minutes > 0 && ` · ${minutesToHuman(minutes)}`}
                  </span>
                </header>

                <ul className="flex flex-col gap-1.5">
                  {dayRows.map(({ event, media: m }) => {
                    const pass = event.pass ?? 0
                    const note = event.note?.trim()
                    return (
                      <li key={`${event.animeId}:${event.episode}:${pass}`}>
                        <button
                          className="glass group flex w-full gap-3 rounded-2xl p-2.5 text-left transition-colors hover:bg-white/5"
                          onClick={() => setEditing({ animeId: event.animeId, episode: event.episode })}
                          title={t('Ouvrir cet épisode')}
                        >
                          <Poster
                            src={m.cover.large}
                            alt=""
                            className="h-[62px] w-[44px] shrink-0"
                            rounded="rounded-lg"
                          />
                          {/* Centré verticalement : sans note, deux lignes de
                              texte contre une affiche de soixante pixels
                              laisseraient un creux sous le titre. */}
                          <div className="flex min-w-0 flex-1 flex-col justify-center">
                            <div className="flex items-baseline gap-2">
                              <span className="truncate text-[0.86rem] font-semibold">{titleOf(m, lang)}</span>
                              <span className="ml-auto shrink-0 text-[0.72rem] tabular-nums text-faint">
                                {formatTime(event.at)}
                              </span>
                            </div>
                            <p className="mt-0.5 flex items-center gap-1.5 text-[0.75rem] text-muted">
                              <span>{t('Épisode {n}', { n: event.episode })}</span>
                              {pass > 0 && (
                                <span
                                  className="rounded-full px-1.5 py-px text-[0.66rem] text-faint"
                                  style={{ background: 'var(--line)' }}
                                >
                                  {passLabel(pass)}
                                </span>
                              )}
                              {event.pinned && (
                                <span
                                  className="flex items-center gap-0.5 text-[0.7rem] text-faint"
                                  title={t('À revoir')}
                                >
                                  <Star size={11} fill="currentColor" />
                                  {t('À revoir')}
                                </span>
                              )}
                              {event.emotions && event.emotions.length > 0 && <Emotions ids={event.emotions} />}
                            </p>
                            {note && (
                              <p className="mt-1.5 whitespace-pre-wrap text-[0.78rem] leading-relaxed text-muted">
                                {note}
                              </p>
                            )}
                          </div>
                          <Pencil
                            size={13}
                            className="mt-0.5 shrink-0 self-center text-faint opacity-0 transition-opacity group-hover:opacity-100"
                          />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}

          {j.remaining > 0 && (
            <div className="flex justify-center py-2">
              <button className="btn" onClick={j.more}>
                {t('Afficher plus (')}
                {j.remaining} {t('restants)')}
              </button>
            </div>
          )}
        </>
      )}

      {editing && (
        <EpisodeEditor
          animeId={editing.animeId}
          episode={editing.episode}
          title={null}
          url={null}
          thumbnail={null}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
