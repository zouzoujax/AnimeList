import { humanMessage, isOutage } from '@shared/api-outage'
import {
  ArrowLeft,
  Bell,
  BellOff,
  Bookmark,
  Check,
  CheckCheck,
  Eye,
  EyeOff,
  ExternalLink,
  FolderPlus,
  GitBranch,
  Heart,
  Maximize2,
  Play,
  Repeat,
  RotateCcw,
  Star,
  Trash2,
  TriangleAlert,
  Users
} from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  EMOTIONS,
  GENRE_LABELS,
  STATUS_LABELS,
  type EmotionId,
  type LibraryStatus,
  type Manga,
  type Media,
  type MediaDetail
} from '@shared/types'
import { aliasesOf, parseAliases } from '@shared/search'
import { statusBlocked } from '@/lib/status'
import { MiniCard } from '@/components/AnimeCard'
import EpisodeEditor from '@/components/EpisodeEditor'
import ListPicker from '@/components/ListPicker'
import LocalFiles from '@/components/LocalFiles'
import { MangaSheet } from '@/components/MangaSheet'
import {
  CountUp,
  ErrorBox,
  FicheSkeleton,
  Modal,
  Poster,
  ProgressRing,
  RowScroller,
  Section,
  Skeleton,
  Spinner
} from '@/components/ui'
import { StaleNote } from '@/components/StaleNote'
import { Franchise } from '@/components/Franchise'
import { LANG_LABELS, langUrl, type Lang } from '@shared/langs'
import { originTitle } from '@shared/origin'
import { rgba, toneAccent } from '@/lib/color'
import { countdown, formatLabel, isUnaired, minutesToHuman, otherTitles, seasonLabel, titleOf } from '@/lib/format'
import { useAnimeSama, useDetail, useFiller, useFranchiseFilms, useSeasons, useTranslated } from '@/lib/hooks'
import { WATCH_BADGE, isWatchDisabled, otherPlatforms, watchLinks } from '@/lib/watch'
import { nextEpisodeOf, useApp } from '@/store/app'
import { useExperience, type DetailHeroProps, type DetailParts } from '@/experiences'
import { useNewDesign } from '@/lib/nd'
import { NdDetailBody, NdDetailHero } from '@/pages/nd/detail'
import { Stars } from '@/components/Stars'
import { t, locale } from '@shared/i18n'

const STATUS_ORDER: LibraryStatus[] = ['watching', 'planned', 'completed', 'paused', 'dropped']

/**
 * Season strip.
 *
 * AniList has no "season 3": entries are linked pairwise by prequel and sequel,
 * so the number here is a position in that chain — which is what a viewer means
 * by season 3 even when the entry is titled "Part 2".
 */
function SeasonStrip({ animeId }: { animeId: number }): React.JSX.Element | null {
  const seasons = useSeasons(animeId)
  const navigate = useApp((s) => s.navigate)
  const entries = useApp((s) => s.entries)
  const watched = useApp((s) => s.watched)

  if (seasons.length < 2) return null

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      <span className="label mr-0.5">{t('Saisons')}</span>
      {seasons.map((season) => {
        const current = season.id === animeId
        const seen = watched.get(season.id)?.size ?? 0
        const done = season.episodes ? seen >= season.episodes : false
        const tracked = entries.has(season.id)

        return (
          <button
            key={season.id}
            className="chip"
            data-on={current}
            aria-current={current ? 'page' : undefined}
            onClick={() => !current && navigate({ name: 'anime', id: season.id })}
            title={`${season.title}${season.year ? ` · ${season.year}` : ''}${
              season.episodes ? t(' · {episodes} ép.', { episodes: season.episodes }) : ''
            }${tracked ? t(' · {seen} vus', { seen }) : t(' · pas dans ta bibliothèque')}`}
          >
            S{season.number}
            {/* Deux cours partagent un numéro : sans ça la bande afficherait
                « S2 S2 » sans dire lequel est lequel. */}
            {season.part !== null && <span className="opacity-60">P{season.part}</span>}
            {/* A dot rather than a colour alone, so the state is not carried by
                hue only. */}
            {tracked && (
              <span
                className="h-[5px] w-[5px] rounded-full"
                style={{ background: done ? 'var(--accent-2)' : 'var(--color-faint)' }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}

function EpisodeGrid({
  detail,
  glow,
  watchUrl
}: {
  detail: MediaDetail
  glow: string
  /** Page d'épisodes d'Anime-Sama, quand il y en a une : chaque case diffusée
   *  gagne alors un bouton qui l'ouvre au bon numéro. */
  watchUrl: string | null
}): React.JSX.Element {
  const seen = useApp((s) => s.watched.get(detail.id))
  const next = useApp((s) => nextEpisodeOf(s, detail.id, detail.episodes))
  const entry = useApp((s) => s.entries.get(detail.id))
  const events = useApp((s) => s.events)
  const toggleEpisode = useApp((s) => s.toggleEpisode)
  const markUpTo = useApp((s) => s.markUpTo)
  const clearProgress = useApp((s) => s.clearProgress)
  const startRewatch = useApp((s) => s.startRewatch)
  const cancelRewatch = useApp((s) => s.cancelRewatch)
  const toast = useApp((s) => s.toast)
  const progress = useApp((st) => st.progress)
  const [hovered, setHovered] = useState<number | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  /**
   * Les cases qui viennent d'être cochées, pour leur donner un éclat.
   *
   * Tenu au clic plutôt que déduit des coches : à l'ouverture, toutes les cases
   * déjà vues s'allumeraient d'un coup. `round` rejoue l'effet si l'on recoche.
   */
  const [burst, setBurst] = useState<{ from: number; to: number; round: number } | null>(null)
  const [hideFiller, setHideFiller] = useState(false)
  const fillerInfo = useFiller(detail.idMal)

  const rawEpisodes = detail.episodeMeta
  /**
   * Les titres d'épisodes, traduits eux aussi.
   *
   * Une seule requête pour toute la grille plutôt qu'une par case : trois cent
   * cinquante-neuf allers-retours pour One Piece épuiseraient n'importe quel
   * quota, et le service accepte justement les envois groupés.
   */
  const titles = useTranslated(rawEpisodes.map((ep) => ep.title ?? ''))
  const episodes = rawEpisodes.map((ep, i) => (ep.title ? { ...ep, title: titles[i] || ep.title } : ep))

  if (!episodes.length) {
    return (
      <p className="glass rounded-2xl px-4 py-6 text-center text-[0.82rem] text-faint">
        {t("La liste d'épisodes n'est pas encore publiée pour ce titre.")}
      </p>
    )
  }

  const hoveredMeta = hovered ? episodes[hovered - 1] : null
  const count = seen?.size ?? 0
  const pass = entry?.rewatches ?? 0
  const finished = count === episodes.length && count > 0

  /** Episodes carrying a note or a mood, in any pass — worth flagging. */
  const annotated = new Set(
    events.filter((e) => e.animeId === detail.id && (e.note || e.emotions?.length)).map((e) => e.episode)
  )
  // Marqué « à revoir » : la pastille sert aussi à ça, sinon il faudrait le
  // chercher à l'œil dans trois cent cinquante-neuf cases.
  const pinned = new Set(events.filter((e) => e.animeId === detail.id && e.pinned).map((e) => e.episode))

  // Recaps are filler for the purpose of skipping: neither advances the story.
  const filler = new Set([...(fillerInfo?.filler ?? []), ...(fillerInfo?.recap ?? [])])
  const shown = hideFiller ? episodes.filter((ep) => !filler.has(ep.number)) : episodes

  /**
   * Last episode already broadcast. `nextAiring.episode` is the one still to
   * come, so everything from it onwards cannot have been watched.
   */
  const lastAired = detail.nextAiring ? detail.nextAiring.episode - 1 : episodes.length
  const unaired = (n: number): boolean => isUnaired(detail, n)

  return (
    <div>
      <SeasonStrip animeId={detail.id} />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {/* Stops at the last broadcast episode: marking one that has not aired
            would invent a viewing. */}
        <button
          className="btn !h-8"
          onClick={() => markUpTo(detail.id, Math.min(episodes.length, lastAired), detail)}
          disabled={count >= Math.min(episodes.length, lastAired)}
          title={
            lastAired < episodes.length
              ? t("Jusqu'à l'épisode {lastAired}, le dernier diffusé", { lastAired })
              : undefined
          }
        >
          <CheckCheck size={14} />
          {t('Tout marquer')}
        </button>
        <button className="btn !h-8" onClick={() => clearProgress(detail.id)} disabled={count === 0}>
          <RotateCcw size={14} />
          {t('Réinitialiser')}
        </button>

        {/* Only offered when MyAnimeList actually labelled something: a switch
            that never changes anything is worse than no switch. */}
        {filler.size > 0 && (
          <button
            className="btn !h-8"
            data-on={hideFiller}
            onClick={() => setHideFiller((v) => !v)}
            aria-pressed={hideFiller}
            title={
              hideFiller
                ? t('Réafficher les épisodes hors intrigue')
                : t('{size} épisode{v1} hors intrigue (filler ou résumé)', {
                    size: filler.size,
                    v1: filler.size > 1 ? 's' : ''
                  })
            }
            style={hideFiller ? { borderColor: 'var(--accent)' } : undefined}
          >
            {hideFiller ? <Eye size={14} /> : <EyeOff size={14} />}
            {hideFiller ? t('Tout afficher') : t('Sans filler')}
            <span className="tabular-nums opacity-60">{filler.size}</span>
          </button>
        )}

        {entry && finished && (
          <button
            className="btn btn-primary !h-8"
            onClick={() => {
              void startRewatch(detail.id)
              toast(t('Nouveau visionnage commencé — l’historique précédent est conservé.'), 'ok')
            }}
          >
            <Repeat size={14} />
            {t('Revoir')}
          </button>
        )}

        {pass > 0 && (
          <>
            {/* The tint and the outline carry the accent; the text stays ink, so
                the badge is readable whatever accent and theme are in use. */}
            <span
              className="rounded-full px-2.5 py-1 text-[0.72rem] font-medium"
              style={{
                background: rgba(glow, 0.16),
                border: `1px solid ${rgba(glow, 0.5)}`,
                color: 'var(--color-ink)'
              }}
            >
              {pass === 1 ? '2ᵉ' : `${pass + 1}ᵉ`} {t('visionnage')}
            </span>
            <button className="btn !h-8 text-[0.75rem]" onClick={() => void cancelRewatch(detail.id)}>
              {t('Annuler ce visionnage')}
            </button>
          </>
        )}

        {/* Toujours sur sa propre ligne, et toujours sur une seule.
            Dans le flux des boutons, la phrase d'aide passait à la ligne et un
            titre court non : survoler un épisode faisait donc perdre une ligne
            à l'en-tête et sauter toute la grille de 25 px. `truncate` couvre
            l'autre moitié du piège, un titre assez long pour tenir sur deux. */}
        <p className="min-h-[1.2rem] basis-full truncate text-right text-[0.76rem] text-muted">
          {hoveredMeta?.title ? (
            <span>
              <span className="text-faint">EP {hoveredMeta.number} · </span>
              {hoveredMeta.title}
            </span>
          ) : (
            <span className="text-faint">
              {hideFiller
                ? t('{v0} épisode{v1} hors intrigue masqué{v2}', {
                    v0: episodes.length - shown.length,
                    v1: episodes.length - shown.length > 1 ? 's' : '',
                    v2: episodes.length - shown.length > 1 ? 's' : ''
                  })
                : t('Clic pour cocher · Maj+clic jusque-là · Clic droit pour éditer{v0}', {
                    v0: watchUrl ? t(' · ▶ pour regarder') : ''
                  })}
            </span>
          )}
        </p>
      </div>

      <EpisodeEditor
        animeId={detail.id}
        episode={editing}
        title={editing ? (episodes[editing - 1]?.title ?? null) : null}
        url={editing ? (episodes[editing - 1]?.url ?? null) : null}
        thumbnail={editing ? (episodes[editing - 1]?.thumbnail ?? null) : null}
        onClose={() => setEditing(null)}
      />

      <div className="flex flex-wrap gap-1.5">
        {shown.map((ep) => {
          const watched = seen?.has(ep.number) ?? false
          const isNext = ep.number === next
          const isFiller = filler.has(ep.number)
          const notOut = unaired(ep.number)
          // Interdire de cocher un épisode à venir, oui ; interdire de le
          // décocher enferme la coche qui a réussi à passer. La porte doit
          // s'ouvrir dans les deux sens.
          const locked = notOut && !watched
          const fresh = watched && burst !== null && ep.number >= burst.from && ep.number <= burst.to
          const freshDelay = fresh ? `${Math.min(ep.number - burst.from, 24) * 22}ms` : undefined
          /**
           * L'épisode en train d'être lu, et où il en est.
           *
           * Seulement tant qu'il n'est pas coché : passé les neuf dixièmes la
           * case devient pleine et colorée, et un remplissage par-dessus
           * n'ajouterait rien qu'un artefact.
           */
          const lecture =
            !watched && progress && progress.animeId === detail.id && progress.episode === ep.number
              ? progress.ratio
              : null
          const label = ep.title
            ? t('EP {number} — {title}', { number: ep.number, title: ep.title })
            : t('Épisode {number}', { number: ep.number })
          const note = notOut
            ? watched
              ? t(' · pas encore diffusé — clic pour décocher')
              : t(' · pas encore diffusé')
            : isFiller
              ? t(' · hors intrigue')
              : ''
          return (
            <button
              key={ep.number}
              disabled={locked}
              onMouseEnter={() => setHovered(ep.number)}
              onMouseLeave={() => setHovered(null)}
              onClick={(e) => {
                const upTo = e.shiftKey && !notOut
                if (upTo || !watched)
                  setBurst((b) => ({
                    from: upTo ? (next ?? ep.number) : ep.number,
                    to: ep.number,
                    round: (b?.round ?? 0) + 1
                  }))
                void (upTo ? markUpTo(detail.id, ep.number, detail) : toggleEpisode(detail.id, ep.number, detail))
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                if (!notOut) setEditing(ep.number)
              }}
              title={`${label}${note}${lecture !== null ? t(' · en cours, {v0} %', { v0: Math.round(lecture * 100) }) : ''}`}
              className={`group relative grid h-[38px] w-[42px] place-items-center rounded-[10px] text-[0.75rem] font-semibold tabular-nums transition-all duration-150 ${
                locked ? 'cursor-not-allowed' : 'hover:scale-110'
              }`}
              style={
                watched
                  ? { background: `linear-gradient(140deg, ${glow}, var(--accent-2))`, color: '#07080f' }
                  : notOut
                    ? {
                        // Not a disabled control so much as a date not yet reached.
                        background: 'transparent',
                        border: '1px solid var(--line)',
                        color: 'var(--color-faint)',
                        opacity: 0.45
                      }
                    : isNext
                      ? {
                          background: 'rgba(255,255,255,.05)',
                          border: `1.5px solid ${rgba(glow, 0.85)}`,
                          color: '#fff',
                          boxShadow: `0 0 18px -4px ${rgba(glow, 0.9)}`
                        }
                      : isFiller
                        ? {
                            // Dashed and dimmed: skippable, not unavailable.
                            background: 'transparent',
                            border: '1px dashed var(--line-2)',
                            color: 'var(--color-faint)'
                          }
                        : {
                            background: 'rgba(255,255,255,.045)',
                            border: '1px solid var(--line)',
                            color: 'var(--color-muted)'
                          }
              }
            >
              {lecture !== null && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 left-0 rounded-[9px] transition-[width] duration-700"
                  style={{ width: `${lecture * 100}%`, background: rgba(glow, 0.34) }}
                />
              )}
              {fresh && (
                <span
                  key={burst.round}
                  aria-hidden
                  className="ep-burst pointer-events-none absolute inset-0 rounded-[10px]"
                  style={{ '--tone': glow, animationDelay: freshDelay } as React.CSSProperties}
                />
              )}
              <span
                key={fresh ? `vu-${burst.round}` : watched ? 'vu' : 'num'}
                className={`relative ${fresh ? 'ep-check' : ''}`}
                style={{ animationDelay: freshDelay }}
              >
                {watched ? <Check size={14} strokeWidth={3} /> : ep.number}
              </span>
              {(annotated.has(ep.number) || pinned.has(ep.number)) && (
                <span
                  className="absolute right-1 top-1 h-[5px] w-[5px] rounded-full"
                  style={{ background: watched ? '#07080f' : glow }}
                  title={pinned.has(ep.number) ? t('À revoir') : t('Cet épisode a une note')}
                />
              )}
              {/* Coin bas-droit : le haut-droit porte déjà la pastille des
                  notes. Absent des épisodes à venir — il n'y a rien à ouvrir. */}
              {watchUrl && !notOut && (
                <span
                  role="button"
                  tabIndex={-1}
                  title={t("Ouvrir l'épisode {number} sur Anime-Sama", { number: ep.number })}
                  onClick={(e) => {
                    e.stopPropagation()
                    void window.api.watch.openEpisode(watchUrl, ep.number, detail.id)
                  }}
                  className="absolute -bottom-1.5 -right-1.5 grid h-[17px] w-[17px] place-items-center rounded-full opacity-0 transition group-hover:opacity-100"
                  style={{ background: glow, color: '#07080f', boxShadow: '0 2px 6px rgba(0,0,0,.5)' }}
                >
                  <Play size={9} fill="currentColor" strokeWidth={0} className="ml-[1px]" />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * The trailer plays right here, in place of the thumbnail.
 *
 * The frame's source is a loopback page rather than YouTube directly — see
 * `src/main/trailer.ts` for why: the embedded player refuses to start on a page
 * that sends no `Referer`, and this renderer runs on `file://`.
 *
 * The poster is kept until the first click so no video is fetched by merely
 * opening an anime, and so the page has something to show while the player
 * loads.
 */
function Trailer({
  id,
  animeId,
  cover,
  title
}: {
  /** Identifiant de la vidéo chez YouTube, pas celui de la série. */
  id: string
  animeId: number
  cover: string
  title: string
}): React.JSX.Element {
  const toast = useApp((s) => s.toast)
  const [thumb, setThumb] = useState(`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`)
  const [src, setSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const onThumbError = (): void =>
    setThumb((current) => (current.includes('maxresdefault') ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : cover))

  const play = async (): Promise<void> => {
    setLoading(true)
    try {
      const url = await window.api.app.trailerUrl(id, title)
      if (url) {
        setSrc(url)
        return
      }
      // A malformed id, or the loopback port would not bind.
      toast(t('Lecture impossible dans l’app, ouverture sur YouTube.'), 'info')
      void window.api.app.openExternal(`https://www.youtube.com/watch?v=${id}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="group relative aspect-video w-full overflow-hidden rounded-[18px]"
      style={{ border: '1px solid var(--line)', background: '#000' }}
    >
      {src ? (
        <iframe
          src={src}
          title={t('Bande-annonce de {title}', { title })}
          allow="autoplay; encrypted-media; fullscreen"
          allowFullScreen
          className="h-full w-full"
          style={{ border: 0 }}
        />
      ) : (
        <button
          onClick={() => void play()}
          className="absolute inset-0"
          aria-label={t('Lire la bande-annonce de {title}', { title })}
        >
          <img
            src={thumb}
            alt=""
            onError={onThumbError}
            className="h-full w-full object-cover opacity-70 transition duration-500 group-hover:scale-[1.03] group-hover:opacity-90"
          />
          <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />
          <span className="absolute inset-0 grid place-items-center">
            <span
              className="grid h-16 w-16 place-items-center rounded-full transition-transform group-hover:scale-110"
              style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', color: '#07080f' }}
            >
              <Play size={24} fill="currentColor" strokeWidth={0} className="ml-1" />
            </span>
          </span>
          <span className="absolute bottom-3 left-4 text-[0.8rem] font-semibold">
            {loading ? t('Chargement…') : 'Bande-annonce'}
          </span>
        </button>
      )}

      {/* Once the player has the frame it also owns the clicks, so these sit
          outside it and only show on hover. */}
      <div
        className={`absolute right-3 top-3 flex gap-1.5 transition-opacity ${
          src ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
        }`}
      >
        {src && (
          <button
            onClick={() => void window.api.app.popoutTrailer(id, title, animeId)}
            className="flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[0.72rem] text-white/85 transition-colors hover:bg-black/80 hover:text-white"
            title={t('Ouvrir dans une fenêtre plus grande')}
          >
            <Maximize2 size={12} />
            {t('Agrandir')}
          </button>
        )}
        <button
          onClick={() => void window.api.app.openExternal(`https://www.youtube.com/watch?v=${id}`)}
          className="flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[0.72rem] text-white/85 transition-colors hover:bg-black/80 hover:text-white"
          title={t('Ouvrir dans le navigateur')}
        >
          {t('YouTube')}
          <ExternalLink size={12} />
        </button>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="shrink-0 text-[0.74rem] text-faint">{label}</span>
      <span className="text-right text-[0.79rem] font-medium">{value}</span>
    </div>
  )
}

export default function DetailPage({ id }: { id: number }): React.JSX.Element {
  const navigate = useApp((s) => s.navigate)
  const back = useApp((s) => s.back)
  const { data, loading, error, retry } = useDetail(id)
  const mediaCache = useApp((s) => s.media)
  const cached = mediaCache.get(id)
  const entry = useApp((s) => s.entries.get(id))
  const lang = useApp((s) => s.prefs.titleLang)
  const seenCount = useApp((s) => s.watched.get(id)?.size ?? 0)
  const defaultRuntime = useApp((s) => s.prefs.defaultRuntime)
  const aliases = useApp((s) => s.prefs.aliases)
  const setPrefs = useApp((s) => s.setPrefs)
  /**
   * Le même total que celui que la fiche affiche.
   *
   * Il était lu dans la bibliothèque seule : pour une série qui n'y est pas —
   * un film ouvert depuis l'arbre d'une franchise —, le total était inconnu,
   * la recherche de l'épisode suivant ne s'arrêtait jamais, et un film d'un
   * seul épisode proposait « Marquer l'épisode 2 » une fois le premier coché.
   */
  const next = useApp((s) => nextEpisodeOf(s, id, (data ?? s.media.get(id))?.episodes ?? null))
  const saveEntry = useApp((s) => s.saveEntry)
  const removeEntry = useApp((s) => s.removeEntry)
  const toggleEpisode = useApp((s) => s.toggleEpisode)
  const toast = useApp((s) => s.toast)
  // Une expérience peut remplacer l'en-tête ; le corps de la fiche reste commun.
  const xp = useExperience()
  // Une expérience garde la main sur sa fiche ; sinon, le nouveau design s'il est allumé.
  const nd = useNewDesign('detail')
  const Hero = xp?.DetailHero ?? (nd ? NdDetailHero : null)
  const Body = xp?.DetailBody ?? (nd ? NdDetailBody : null)

  const media: Media | MediaDetail | undefined = data ?? cached
  /**
   * Le résumé en français.
   *
   * Posé ici, avec les autres crochets et avant tout retour anticipé : la
   * fiche rend un squelette tant que rien n'est chargé, et un crochet appelé
   * après ce retour ne le serait pas à tous les rendus.
   *
   * AniList ne publie ses résumés qu'en anglais ; sans clé DeepL, l'original
   * ressort tel quel.
   */
  const [synopsis] = useTranslated(media?.description ? [media.description] : [])
  const [draft, setDraft] = useState<{ animeId: number; text: string }>({ animeId: id, text: entry?.notes ?? '' })
  /**
   * Les surnoms en cours de frappe.
   *
   * À part des préférences le temps de la saisie, comme le mot de passe de la
   * télécommande : découper sur les virgules à chaque touche effacerait celle
   * qu'on vient de taper. Ils partent quand on quitte le champ.
   */
  const [nicknames, setNicknames] = useState<{ animeId: number; text: string } | null>(null)
  const [expanded, setExpanded] = useState(false)
  // ESSAI — arbre des franchises. Ici, et non dans la grille : l'arbre n'a
  // besoin que d'un identifiant, alors que la grille n'est pas même montée
  // quand la fiche AniList manque à l'appel.
  const [tree, setTree] = useState(false)
  /**
   * La langue choisie, tant que la fiche est ouverte.
   *
   * Elle est aussi écrite dans la bibliothèque, mais on ne redemande pas au
   * processus principal de recalculer l'adresse : le basculement doit être
   * instantané, et la même fonction sert des deux côtés.
   */
  const [spoken, setSpoken] = useState<Lang | null>(null)
  const [picking, setPicking] = useState(false)

  /**
   * Le manga s'ouvre par une requête à part : la relation ne porte qu'un
   * identifiant et une couverture, de quoi faire une vignette et rien de plus.
   * La fenêtre s'ouvre donc avant la réponse, sinon le clic ne fait rien
   * pendant une seconde.
   */
  const [mangaId, setMangaId] = useState<number | null>(null)
  const [mangaSheet, setMangaSheet] = useState<{ id: number; data: Manga | null; error: string | null }>({
    id: 0,
    data: null,
    error: null
  })

  useEffect(() => {
    if (mangaId === null) return
    let alive = true
    void window.api.manga
      .detail(mangaId)
      .then((data) => alive && setMangaSheet({ id: mangaId, data, error: null }))
      .catch((err: Error) => alive && setMangaSheet({ id: mangaId, data: null, error: humanMessage(err.message) }))
    return () => {
      alive = false
    }
  }, [mangaId])
  const lists = useApp((s) => s.lists)

  // Ranger une série demandait jusqu'ici de retourner dans la bibliothèque et
  // d'ouvrir une sélection. Depuis sa fiche, c'est un bouton.
  const inLists = lists.filter((l) => l.animeIds.includes(id))
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // La saisie appartient à une fiche. Tant que c'est la même, c'est elle qui
  // fait foi — sinon l'enregistrement différé, en revenant par `entry`,
  // écraserait ce qu'on est en train de taper. Changer de fiche suffit à la
  // rendre caduque, sans remise à zéro.
  const notes = draft.animeId === id ? draft.text : (entry?.notes ?? '')
  const setNotes = (text: string): void => setDraft({ animeId: id, text })

  const glow = useMemo(() => toneAccent(media?.cover.color), [media?.cover.color])
  const animeSama = useAnimeSama(media ?? null)
  const langs = animeSama?.languages ?? []
  const current = spoken ?? animeSama?.language ?? null
  // Un film introuvable dans leur liste n'a pas de lecteur à ouvrir : le ▶
  // lancerait le premier film venu, et la coche marquerait celui-ci vu.
  const unplaced = !!animeSama?.side && !animeSama.entry
  const watchUrl = animeSama?.episodes && !unplaced ? (current ? langUrl(animeSama.url, current) : animeSama.url) : null
  const franchiseFilms = useFranchiseFilms(media ?? null)

  // Franchise-wide sweep first, then any film this entry links to that the
  // sweep missed — deduplicated, current entry excluded.
  const filmRow = useMemo(() => {
    const out = new Map<number, { id: number; title: string; cover: string; caption: string | null }>()
    for (const film of franchiseFilms) {
      if (film.id === id) continue
      const year = film.startDate?.year ?? film.seasonYear
      out.set(film.id, {
        id: film.id,
        title: titleOf(film, lang),
        cover: film.cover.large,
        caption: year ? String(year) : null
      })
    }
    for (const relation of data?.relations ?? []) {
      if (relation.format !== 'MOVIE' || relation.id === id || out.has(relation.id)) continue
      out.set(relation.id, {
        id: relation.id,
        title: relation.title,
        cover: relation.cover,
        caption: relation.extra
      })
    }
    return [...out.values()]
  }, [franchiseFilms, data, id, lang])
  const total = media?.episodes ?? null
  const ratio = total ? Math.min(1, seenCount / total) : 0
  const watchedMinutes = seenCount * (media?.duration || 24)

  const patch = async (values: Parameters<typeof saveEntry>[1]): Promise<void> => {
    if (!media) return
    await saveEntry(id, values, media)
  }

  const onNotes = (value: string): void => {
    setNotes(value)
    if (notesTimer.current) clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(() => void patch({ notes: value }), 600)
  }

  /** Enregistre les surnoms quand on quitte le champ, rangés et dédoublonnés. */
  const saveNicknames = (text: string): void => {
    const kept = parseAliases(text)
    const before = aliasesOf(aliases, id)
    setNicknames(null)
    if (kept.join(' ') === before.join(' ')) return
    const next = { ...aliases }
    // Effacé : on retire la clé plutôt que d'y laisser un tableau vide, qui
    // finirait par peupler les préférences d'une ligne par série ouverte.
    if (kept.length) next[String(id)] = kept
    else delete next[String(id)]
    void setPrefs({ aliases: next })
  }

  const toggleEmotion = async (emotion: EmotionId): Promise<void> => {
    const current = entry?.emotions ?? []
    await patch({ emotions: current.includes(emotion) ? current.filter((e) => e !== emotion) : [...current, emotion] })
  }

  if (!media && !error) {
    return (
      <FicheSkeleton>
        <button className="btn !h-8" onClick={back}>
          <ArrowLeft size={14} />
          {t('Retour')}
        </button>
      </FicheSkeleton>
    )
  }

  if (!media) {
    return (
      <div className="mx-auto max-w-[1400px] px-7 py-7">
        {/* Ici surtout : une fiche qui n'a pas chargé est le moment où l'on a
            le plus besoin de repartir, et c'est le seul écran qui n'avait rien
            d'autre à offrir qu'un message d'erreur. */}
        <button className="btn mb-5 !h-8" onClick={back}>
          <ArrowLeft size={14} />
          {t('Retour')}
        </button>
        {error ? (
          /**
           * Le message général ne convient pas ici.
           *
           * « Ta bibliothèque n'en dépend pas » est vrai, mais on arrive sur
           * cet écran depuis l'arbre d'une franchise, en cliquant sur un film
           * qu'on n'a justement pas — et cette fiche-là, elle, en dépend
           * entièrement. Lui répondre par une phrase rassurante sur autre
           * chose se lit comme une erreur mal rattrapée.
           */
          <ErrorBox
            message={
              isOutage(error)
                ? t('Cette série n’est pas dans ta bibliothèque, et le catalogue est indisponible : ') +
                  t('il n’y a rien à afficher pour l’instant. Sa fiche s’ouvrira dès qu’AniList aura rallumé.')
                : error
            }
            onRetry={retry}
          />
        ) : null}
      </div>
    )
  }

  const detail = data

  // L'épisode où on en est, s'il a un lien direct chez une plateforme. Une
  // simple lecture de tableau : un mémo ici serait un hook après un retour
  // anticipé, et coûterait plus cher que le calcul.
  /**
   * L'épisode qu'on peut réellement aller voir.
   *
   * `next` est le prochain non coché, diffusé ou non. Proposer d'ouvrir un
   * épisode à venir mène nulle part — et chez Anime-Sama, dont le menu s'arrête
   * aux épisodes parus, leur code retombe sur le dernier disponible : la
   * fenêtre s'ouvrirait sur le 8 après avoir annoncé le 9.
   */
  /**
   * Ce qu'il reste à voir de cette série, en temps.
   *
   * Le compte d'épisodes ne dit pas la soirée qu'il faut y consacrer. La durée
   * vient d'AniList quand elle est connue, du réglage par défaut sinon —
   * comme partout ailleurs dans l'app.
   */
  const episodesSubtitle = ((): string => {
    if (!total) return t('{seenCount} épisodes vus', { seenCount })
    const left = Math.max(0, total - seenCount)
    if (left === 0) return t('{seenCount} vus sur {total} · terminé', { seenCount, total })
    const minutes = left * (media.duration || defaultRuntime)
    return t('{seenCount} vus sur {total} · {left} à voir, {v3}', {
      seenCount,
      total,
      left,
      v3: minutesToHuman(minutes)
    })
  })()

  const watchAt = next !== null && media && !isUnaired(media, next) ? next : null
  const found = watchAt === null ? undefined : detail?.episodeMeta[watchAt - 1]
  const nextLink = found?.url ? found : null
  const others = otherPlatforms(detail)
  const knownMedia = [...mediaCache.values()]
  // Films get their own row below, so they don't belong in the relations rail.
  const relationRow = (detail?.relations ?? []).filter((r) => r.format !== 'MOVIE')
  const mangaRow = detail?.manga ?? []
  const alsoKnownAs = otherTitles(media, lang)

  // Le corps de la fiche en blocs nommés : la mise en page classique les
  // empile en deux colonnes, une expérience les dispose à sa façon.
  const parts: DetailParts = {
    synopsis: media.description ? (
      <section className="mb-8">
        <h2 className="label mb-2">{t('Synopsis')}</h2>
        <p className={`whitespace-pre-line text-[0.885rem] leading-relaxed text-muted ${expanded ? '' : 'clamp-3'}`}>
          {synopsis ?? media.description}
        </p>
        {media.description.length > 240 && (
          <button
            className="mt-1.5 text-[0.78rem] font-semibold"
            style={{ color: 'var(--accent-2)' }}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? t('Réduire') : t('Lire la suite')}
          </button>
        )}
      </section>
    ) : null,
    trailer: media.trailer ? (
      <section className="mb-8">
        {/* Keyed by the video: moving to another anime must start from the
                  poster again rather than carry the previous player over. */}
        <Trailer
          key={media.trailer.id}
          id={media.trailer.id}
          animeId={media.id}
          cover={media.banner ?? media.cover.xl}
          title={titleOf(media, lang)}
        />
      </section>
    ) : null,
    /* Deux langues chez Anime-Sama, deux pastilles — les mêmes que sur
              leur page. Rien quand il n'y a rien à choisir : un bouton unique
              n'est pas un choix, c'est du bruit. */
    language:
      langs.length > 1 ? (
        <div className="mb-4 flex items-center gap-2">
          <span className="label mr-0.5">{t('Langue')}</span>
          {langs.map((code) => (
            <button
              key={code}
              className="chip"
              data-on={code === current}
              aria-pressed={code === current}
              title={code === 'vostfr' ? t('Version originale sous-titrée') : t('Version française')}
              onClick={() => {
                setSpoken(code)
                void window.api.watch.setLanguage(id, code)
              }}
            >
              {LANG_LABELS[code]}
            </button>
          ))}
        </div>
      ) : null,
    /* ESSAI — arbre des franchises. Supprimer ce bloc, l'état `tree` et
              l'import suffit à le retirer. */
    franchise: (
      <>
        <button className="btn mb-4 !h-8 text-[0.75rem]" onClick={() => setTree(true)}>
          <GitBranch size={13} />
          {t('Arbre de la franchise')}
        </button>
        <Modal open={tree} onClose={() => setTree(false)} width={680}>
          {tree && (
            <Franchise
              animeId={id}
              onOpen={(other) => {
                setTree(false)
                navigate({ name: 'anime', id: other })
              }}
            />
          )}
        </Modal>
      </>
    ),
    episodes: (
      <Section title={t('Épisodes')} subtitle={episodesSubtitle}>
        {loading && !detail ? (
          <Skeleton className="h-28 w-full" />
        ) : detail ? (
          <EpisodeGrid detail={detail} glow={glow} watchUrl={watchUrl} />
        ) : (
          // Sans cette ligne, la section n'affichait rien : un titre, un
          // décompte, puis un trou. On croit l'app cassée alors qu'elle a
          // simplement perdu le catalogue.
          <p className="text-[0.82rem] text-faint">
            {t('La liste des épisodes n’a pas pu être chargée. Ta progression, elle, est intacte.')}
          </p>
        )}
      </Section>
    ),
    files: <LocalFiles animeId={id} title={titleOf(media, lang)} glow={glow} />,
    cast:
      detail && detail.characters.length > 0 ? (
        <Section title={t('Personnages')} subtitle={t('Voix japonaises')}>
          <RowScroller>
            {detail.characters.map((c, i) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.025 }}
                className="glass w-[168px] shrink-0 rounded-[15px] p-2.5"
              >
                <div className="flex gap-2">
                  <Poster
                    src={c.image ?? media.cover.large}
                    alt=""
                    className="h-[74px] w-[52px]"
                    rounded="rounded-[9px]"
                  />
                  {c.vaImage && (
                    <Poster src={c.vaImage} alt="" className="h-[74px] w-[52px] opacity-75" rounded="rounded-[9px]" />
                  )}
                </div>
                {/* « Où l'ai-je déjà entendu ? » est l'une des questions
                        qu'on se pose le plus souvent devant un anime, et rien
                        ici n'était cliquable. */}
                <button
                  className="clamp-2 mt-2 text-left text-[0.75rem] font-semibold leading-snug transition hover:text-white"
                  onClick={() => navigate({ name: 'person', kind: 'character', id: c.id })}
                  title={t('Voir ses autres apparitions')}
                >
                  {c.name}
                </button>
                <p className="mt-0.5 text-[0.67rem] text-faint">{c.role}</p>
                {c.va &&
                  (c.vaId ? (
                    <button
                      className="clamp-2 mt-1 text-left text-[0.67rem] text-muted transition hover:text-white"
                      onClick={() => navigate({ name: 'person', kind: 'staff', id: c.vaId as number })}
                      title={t('Voir ses autres rôles')}
                    >
                      {c.va}
                    </button>
                  ) : (
                    <p className="clamp-2 mt-1 text-[0.67rem] text-muted">{c.va}</p>
                  ))}
              </motion.div>
            ))}
          </RowScroller>
        </Section>
      ) : null,
    relations:
      relationRow.length > 0 ? (
        <Section title={t('Dans la même série')}>
          <RowScroller>
            {relationRow.map((r, i) => (
              <MiniCard key={`${r.id}-${i}`} id={r.id} title={r.title} cover={r.cover} caption={r.extra} index={i} />
            ))}
          </RowScroller>
        </Section>
      ) : null,
    /* Pas de sous-titre : chaque vignette dit déjà « Source » ou
              « Adaptation », et en affirmer un ici se tromperait une fois sur deux.

              Le titre, lui, suit le pays d'origine : « Le manga » sous Solo
              Leveling, tiré d'un manhwa coréen, était simplement faux. */
    manga:
      mangaRow.length > 0 ? (
        <Section title={originTitle(mangaRow.map((m) => m.origin ?? 'other'))}>
          <RowScroller>
            {mangaRow.map((m, i) => (
              <MiniCard
                key={m.id}
                id={m.id}
                title={m.title}
                cover={m.cover}
                caption={m.extra}
                index={i}
                onOpen={() => setMangaId(m.id)}
              />
            ))}
          </RowScroller>
        </Section>
      ) : null,
    films:
      filmRow.length > 0 ? (
        <Section title={t('Films de la série')} subtitle={t('{length} longs métrages', { length: filmRow.length })}>
          <RowScroller>
            {filmRow.map((film, i) => (
              <MiniCard
                key={film.id}
                id={film.id}
                title={film.title}
                cover={film.cover}
                caption={film.caption}
                index={i}
              />
            ))}
          </RowScroller>
        </Section>
      ) : null,
    recommendations:
      detail && detail.recommendations.length > 0 ? (
        <Section title={t('Tu aimeras peut-être')}>
          <RowScroller>
            {detail.recommendations.map((r, i) => (
              <MiniCard key={r.id} id={r.id} title={r.title} cover={r.cover} caption={r.extra} index={i} />
            ))}
          </RowScroller>
        </Section>
      ) : null,
    progress: (
      <div className="glass rounded-[20px] p-4">
        <div className="flex items-center gap-4">
          {/* Un halo repart à chaque épisode coché : la clé change avec le
              compte, ce qui remonte l'élément et rejoue son animation. */}
          <div className="relative">
            <span
              key={seenCount}
              aria-hidden
              className="progress-halo pointer-events-none absolute inset-0 rounded-full"
              style={{ '--tone': glow } as React.CSSProperties}
            />
            <ProgressRing value={ratio} size={68} stroke={5}>
              <span className="text-[0.78rem] font-bold tabular-nums">
                <CountUp value={Math.round(ratio * 100)} suffix="%" />
              </span>
            </ProgressRing>
          </div>
          <div className="min-w-0">
            <p className="stat-num text-[1.5rem] leading-none">
              <motion.span
                key={seenCount}
                className="inline-block"
                initial={{ y: -10, opacity: 0, scale: 1.25 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 420, damping: 22 }}
              >
                {seenCount}
              </motion.span>
              <span className="text-[0.9rem] text-faint"> / {total ?? '?'}</span>
            </p>
            <p className="mt-1.5 text-[0.74rem] text-faint">
              {minutesToHuman(watchedMinutes)} {t('de visionnage')}
            </p>
          </div>
        </div>
      </div>
    ),
    rating: (
      <div className="glass rounded-[20px] p-4">
        <h3 className="label mb-2.5">{t('Ma note')}</h3>
        <Stars value={entry?.score ?? null} onChange={(score) => patch({ score })} />

        <h3 className="label mb-2 mt-5">{t('Ressenti')}</h3>
        <div className="flex flex-wrap gap-1.5">
          {EMOTIONS.map((emotion) => {
            const on = entry?.emotions.includes(emotion.id) ?? false
            return (
              <button
                key={emotion.id}
                onClick={() => toggleEmotion(emotion.id)}
                title={emotion.label}
                data-on={on}
                className="chip !h-8 !px-2.5 !text-[0.95rem]"
              >
                <span style={{ filter: on ? 'none' : 'grayscale(.65)' }}>{emotion.emoji}</span>
              </button>
            )
          })}
        </div>

        <h3 className="label mb-2 mt-5">{t('Mes notes')}</h3>
        <textarea
          value={notes}
          onChange={(e) => onNotes(e.target.value)}
          rows={3}
          placeholder={t('Une pensée, un moment marquant…')}
          className="field w-full !h-auto resize-y py-2 text-[0.8rem] leading-relaxed"
        />

        {/* La recherche pardonne déjà les accents, les abréviations et les
            fautes de frappe. Ce qu'elle ne peut pas deviner, c'est le nom que
            tu lui donnes, toi, et qu'aucun des trois titres ne contient. */}
        <h3 className="label mb-2 mt-5">{t('Ses surnoms')}</h3>
        <input
          type="text"
          value={nicknames?.animeId === id ? nicknames.text : aliasesOf(aliases, id).join(', ')}
          onChange={(e) => setNicknames({ animeId: id, text: e.target.value })}
          onBlur={(e) => saveNicknames(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              setNicknames(null)
              e.currentTarget.blur()
            }
          }}
          placeholder={t('jjk, le truc des sorciers')}
          className="field w-full !h-[34px] text-[0.8rem]"
          spellCheck={false}
        />
        <p className="mt-1.5 text-[0.72rem] leading-snug text-faint">
          {t("Séparés par des virgules. Ils ne servent qu'à retrouver la série dans ta bibliothèque.")}
        </p>
      </div>
    ),
    info: (
      <div className="glass rounded-[20px] p-4">
        <h3 className="label mb-1.5">{t('Informations')}</h3>
        <InfoRow label={t('Format')} value={formatLabel(media.format)} />
        <InfoRow label={t('Épisodes')} value={total ?? '—'} />
        <InfoRow label={t('Durée')} value={media.duration ? `${media.duration} min` : '—'} />
        <InfoRow label={t('Diffusion')} value={seasonLabel(media.season, media.seasonYear)} />
        <InfoRow label={t('Studio')} value={media.studios.join(', ') || '—'} />
        <InfoRow
          label={t('Score AniList')}
          value={
            media.averageScore !== null ? (
              <span className="inline-flex items-center gap-1">
                <Star size={11} className="text-amber-300" fill="currentColor" strokeWidth={0} />
                {media.averageScore}%
              </span>
            ) : (
              '—'
            )
          }
        />
        <InfoRow
          label={t('Popularité')}
          value={
            <span className="inline-flex items-center gap-1">
              <Users size={11} />
              {media.popularity.toLocaleString(locale())}
            </span>
          }
        />

        {detail && detail.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {detail.tags.map((tag) => (
              <button
                key={tag}
                className="chip !h-6 !text-[0.65rem]"
                title={t('Découvrir les séries « {tag} »', { tag })}
                onClick={() => navigate({ name: 'discover', tag })}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>
    ),
    watch: (
      <div className="glass rounded-[20px] p-4">
        <h3 className="label mb-2.5">{t('Regarder')}</h3>
        {/* Les rangées suivantes visent la série ; celle-ci vise l'épisode
                où tu en es. C'est AniList qui fournit l'adresse exacte —
                l'identifiant d'un épisode Crunchyroll ne se devine pas. */}
        {nextLink && (
          <button
            onClick={() => void window.api.app.openExternal(nextLink.url as string)}
            title={nextLink.url ?? undefined}
            className="mb-2.5 flex w-full items-center gap-2.5 rounded-[12px] px-3 py-2.5 text-left transition hover:brightness-110"
            style={{ background: rgba(glow, 0.16), border: `1px solid ${rgba(glow, 0.4)}` }}
          >
            <Play size={14} fill="currentColor" strokeWidth={0} style={{ color: rgba(glow, 1) }} />
            <span className="min-w-0 flex-1">
              <span className="block text-[0.8rem] font-semibold">
                {t('Épisode')} {nextLink.number}
              </span>
              {nextLink.title && <span className="block truncate text-[0.68rem] text-faint">{nextLink.title}</span>}
            </span>
            <ExternalLink size={13} className="shrink-0 text-faint" />
          </button>
        )}
        <div className="flex flex-col gap-1.5">
          {watchLinks(media, detail, animeSama, knownMedia, watchAt).map((link) => (
            <div key={link.id} className="flex flex-col gap-1.5">
              <button
                onClick={() => {
                  if (!link.url) return
                  // Anime-Sama n'a pas d'adresse par épisode : une fenêtre de
                  // l'app peut poser le numéro avant que leur page ne le
                  // lise, ce que le navigateur système ne permet pas. Si
                  // l'ouverture est refusée, on retombe sur le navigateur.
                  if (link.id === 'anime-sama' && link.pick) {
                    void window.api.watch.openEpisode(link.url, watchAt, id).then((ok) => {
                      if (!ok && link.url) void window.api.app.openExternal(link.url)
                    })
                    return
                  }
                  void window.api.app.openExternal(link.url)
                }}
                disabled={isWatchDisabled(link.kind)}
                title={link.url ? `${link.hint}\n${link.url}` : link.hint}
                className="group flex items-center gap-2.5 rounded-[12px] border border-white/8 bg-white/5 px-3 py-2.5 text-left transition enabled:hover:border-white/20 enabled:hover:bg-white/10 disabled:cursor-default disabled:opacity-45"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: link.color, boxShadow: `0 0 10px ${link.color}` }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.82rem] font-semibold">{link.label}</span>
                  {link.pick && <span className="block truncate text-[0.66rem] text-faint">{link.pick}</span>}
                </span>
                <span
                  className="shrink-0 text-[0.62rem] font-bold uppercase tracking-wider"
                  style={{ color: WATCH_BADGE[link.kind].color }}
                >
                  {WATCH_BADGE[link.kind].label}
                </span>
                {!isWatchDisabled(link.kind) && (
                  <ExternalLink size={12} className="shrink-0 text-faint transition group-hover:text-white" />
                )}
              </button>
              {/* Leur site n'a pas d'adresse par épisode : l'app retrouve la
                    saison, le film ou l'OAV, puis l'épisode, d'après leurs
                    pages — qui changent sans prévenir. Mieux vaut le dire
                    avant le clic que laisser croire à une adresse exacte. */}
              {link.id === 'anime-sama' && !isWatchDisabled(link.kind) && (
                <p
                  role="note"
                  className="flex items-start gap-2 rounded-[12px] px-3 py-2 text-[0.7rem] leading-snug text-amber-100/85"
                  style={{ background: 'rgba(252, 211, 77, 0.07)', border: '1px solid rgba(252, 211, 77, 0.45)' }}
                >
                  <TriangleAlert size={13} className="mt-[1px] shrink-0 text-amber-300" />
                  <span>
                    <b className="font-semibold text-amber-300">{t('Attention')}</b>{' '}
                    {t(
                      '— le lecteur Anime-Sama peut ouvrir un mauvais épisode, film ou saison : vérifie ce qui se lance.'
                    )}
                  </span>
                </p>
              )}
            </div>
          ))}
        </div>

        {media.status === 'NOT_YET_RELEASED' && (
          <p className="mt-3 text-[0.73rem] leading-snug text-faint">
            {t(
              'Aucun service ne diffuse encore ce titre. Ajoute-le à « À voir » pour être prévenu à la sortie du premier épisode.'
            )}
          </p>
        )}

        {others.length > 0 && media.status !== 'NOT_YET_RELEASED' && (
          <>
            <div className="hairline my-3.5" />
            <h4 className="label mb-2">{t('Autres plateformes')}</h4>
            <div className="flex flex-wrap gap-1.5">
              {others.map((link) => (
                <button key={link.url} className="chip" onClick={() => window.api.app.openExternal(link.url)}>
                  {link.site}
                  <ExternalLink size={11} />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    ),
    // La fiche servie depuis le cache le dit à la place d'une erreur : c'est
    // la même place, celle d'une réponse qu'AniList n'a pas donnée.
    error: error ? (
      <ErrorBox message={error} onRetry={retry} />
    ) : data?.stale ? (
      <StaleNote at={data?.cachedAt ?? null} what={t('cette fiche')} />
    ) : null
  }

  const heroProps: DetailHeroProps = {
    media,
    entry,
    next: next && total !== 0 && !isUnaired(media, next) ? next : null,
    seen: seenCount,
    total,
    alsoKnownAs,
    inLists: inLists.length,
    onBack: back,
    onMark: () => {
      if (!next) return
      void toggleEpisode(id, next, media).then(() => toast(t('Épisode {next} coché', { next })))
    },
    onAdd: () => void patch({ status: 'planned' }),
    onStatus: (status) => void patch({ status }),
    onFavorite: () => void patch({ favorite: !entry?.favorite }),
    onLists: () => setPicking(true)
  }

  return (
    <div className="pb-14">
      {/* ---------------------------------------------------------------- hero */}
      {Hero ? (
        <Hero {...heroProps} />
      ) : (
        <div className="relative">
          {/*
          Revenir en arrière n'existait que dans la barre de titre : un chevron
          de sept pixels, collé au bord de la fenêtre, à sept cents pixels de ce
          qu'on est en train de lire. Les pages Personne et Studio ont leur
          « Retour » dans la page ; la fiche d'un anime, la plus profonde des
          trois, n'en avait pas.

          Posé en absolu par-dessus la bannière : ajouté dans le flux, il
          aurait décalé de trente pixels une mise en page calée au pixel sur la
          hauteur de l'image.
        */}
          <div className="absolute inset-x-0 top-0 z-10 mx-auto max-w-[1400px] px-7 pt-5">
            <button className="btn !h-8" onClick={back}>
              <ArrowLeft size={14} />
              {t('Retour')}
            </button>
          </div>

          <div className="absolute inset-x-0 top-0 h-[330px] overflow-hidden">
            {/* La bannière arrive un peu grossie et se pose, le temps que la
                page sorte du flou. */}
            <motion.div
              className="h-full w-full"
              initial={{ scale: 1.08, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
            >
              {media.banner ? (
                <img src={media.banner} alt="" className="h-full w-full object-cover" />
              ) : (
                <img src={media.cover.xl} alt="" className="h-full w-full scale-110 object-cover blur-2xl" />
              )}
            </motion.div>
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(180deg, ${rgba(glow, 0.22)} 0%, rgba(5,6,12,.72) 45%, var(--bg) 100%)`
              }}
            />
          </div>

          <div className="relative mx-auto flex max-w-[1400px] gap-7 px-7 pt-[168px]">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 220, damping: 26 }}
              className="hidden shrink-0 md:block"
            >
              <Poster src={media.cover.xl} alt="" className="h-[286px] w-[194px]" rounded="rounded-[18px]" />
            </motion.div>

            <motion.div
              className="min-w-0 flex-1 pb-1"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08, type: 'spring', stiffness: 220, damping: 26 }}
            >
              <div className="mb-2 flex flex-wrap items-center gap-2 text-[0.74rem] text-muted">
                <span
                  className="chip !cursor-default !h-6"
                  style={{ background: rgba(glow, 0.2), color: '#fff', borderColor: rgba(glow, 0.4) }}
                >
                  {formatLabel(media.format)}
                </span>
                <span>{seasonLabel(media.season, media.seasonYear)}</span>
                {media.studios[0] && <span>· {media.studios[0]}</span>}
                {media.averageScore !== null && (
                  <span>
                    · {media.averageScore}
                    {t('% AniList')}
                  </span>
                )}
              </div>

              <h1 className="title-xl text-[2.35rem] leading-[1.06]">{titleOf(media, lang)}</h1>
              {alsoKnownAs.length > 0 && <p className="mt-1 text-[0.86rem] text-faint">{alsoKnownAs.join(' · ')}</p>}

              {media.nextAiring && (
                <p
                  className="mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[0.76rem] font-semibold"
                  style={{ background: rgba(glow, 0.18), color: rgba(glow, 1) }}
                >
                  {t('Épisode')} {media.nextAiring.episode} {countdown(media.nextAiring.airingAt)}
                </p>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-2">
                {next && total !== 0 && !isUnaired(media, next) && (
                  <button
                    className="btn btn-primary"
                    onClick={async () => {
                      await toggleEpisode(id, next, media)
                      toast(t('Épisode {next} coché', { next }))
                    }}
                  >
                    <Play size={14} fill="currentColor" strokeWidth={0} />
                    {t("Marquer l'épisode")} {next}
                  </button>
                )}

                {!entry ? (
                  <button className="btn" onClick={() => patch({ status: 'planned' })}>
                    <Bookmark size={14} />
                    {t('Ajouter à ma liste')}
                  </button>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {STATUS_ORDER.map((status) => {
                      // On ne termine pas une série qui n'a pas fini de sortir.
                      const blocked = statusBlocked(status, media, entry)
                      return (
                        <button
                          key={status}
                          data-on={entry.status === status}
                          className="chip !h-[38px] !px-3"
                          disabled={!!blocked}
                          title={blocked ?? undefined}
                          onClick={() => patch({ status })}
                        >
                          {STATUS_LABELS[status]}
                        </button>
                      )
                    })}
                  </div>
                )}

                <button
                  className="icon-btn !h-[38px] !w-[38px]"
                  onClick={() => patch({ favorite: !entry?.favorite })}
                  aria-label={t('Favori')}
                  style={entry?.favorite ? { color: '#fb7185', background: 'rgba(251,113,133,.12)' } : undefined}
                >
                  <Heart size={16} fill={entry?.favorite ? 'currentColor' : 'none'} />
                </button>

                {entry && (
                  <button
                    className="icon-btn !h-[38px] !w-[38px]"
                    onClick={() => setPicking(true)}
                    aria-label={t('Listes')}
                    title={inLists.length > 0 ? inLists.map((l) => l.name).join(', ') : t('Ranger dans une liste')}
                    style={inLists.length > 0 ? { color: 'var(--accent)', background: 'var(--panel-2)' } : undefined}
                  >
                    <FolderPlus size={15} />
                  </button>
                )}

                {entry && (
                  <button
                    className="icon-btn !h-[38px] !w-[38px]"
                    onClick={() => patch({ notify: entry.notify === false })}
                    aria-label={
                      entry.notify === false ? t('Réactiver les notifications') : t('Couper les notifications')
                    }
                    title={
                      entry.notify === false
                        ? t('Notifications coupées pour cette série')
                        : t('Prévenir quand un épisode sort')
                    }
                    style={entry.notify === false ? { color: 'var(--color-faint)' } : undefined}
                  >
                    {entry.notify === false ? <BellOff size={15} /> : <Bell size={15} />}
                  </button>
                )}

                {entry && (
                  <button
                    className="icon-btn !h-[38px] !w-[38px]"
                    onClick={async () => {
                      await removeEntry(id)
                      toast(t('Retiré de ta bibliothèque'), 'info')
                    }}
                    aria-label={t('Retirer de ma liste')}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>

              {media.genres.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {media.genres.map((g) => (
                    <span key={g} className="chip !h-6 !cursor-default !text-[0.68rem]">
                      {GENRE_LABELS[g] ?? g}
                    </span>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- body */}
      {Body ? (
        <Body media={media} parts={parts} />
      ) : (
        <div className="mx-auto mt-9 grid max-w-[1400px] gap-7 px-7 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            {parts.synopsis}
            {parts.trailer}
            {parts.language}
            {parts.franchise}
            {parts.episodes}
            {parts.files}
            {parts.cast}
            {parts.relations}
            {parts.manga}
            {parts.films}
            {parts.recommendations}
          </div>
          <aside className="flex flex-col gap-4">
            {parts.progress}
            {parts.rating}
            {parts.info}
            {parts.watch}
            {parts.error}
          </aside>
        </div>
      )}

      <ListPicker open={picking} onClose={() => setPicking(false)} animeIds={[id]} />

      <Modal open={mangaId !== null} onClose={() => setMangaId(null)} width={640}>
        {mangaSheet.id !== mangaId ? (
          <div className="p-12">
            <Spinner label={t('Chargement de la fiche…')} />
          </div>
        ) : mangaSheet.data ? (
          <MangaSheet manga={mangaSheet.data} onClose={() => setMangaId(null)} />
        ) : (
          <div className="p-5">
            <ErrorBox message={mangaSheet.error ?? t('Fiche introuvable.')} />
          </div>
        )}
      </Modal>
    </div>
  )
}
