import { Search } from 'lucide-react'
import { useMemo } from 'react'
import { STATUS_LABELS, type Media } from '@shared/types'
import { airingLabel, formatLabel, minutesToHuman, titleOf } from '@/lib/format'
import { useBrowse } from '@/lib/hooks'
import { nextEpisodeOf, useApp, type Route } from '@/store/app'
import { useBehind, useContinue, useShelf, useTotals, useUpcoming } from './data'
import { WEEKDAYS, useStats } from './stats'
import { MagazineCalendar, MagazineDetailHero, MagazineDiscover, MagazineManga } from './magazine-pages'
import { MagazineBadges } from './badges-pages'
import { MagazineDetailBody } from './detail-bodies'
import type { Experience } from '.'
import { t, locale, dayNames } from '@shared/i18n'

/*
 * MAGAZINE — la bibliothèque lue comme un numéro papier : une manchette, une
 * « une » en colonnes avec article principal, brèves numérotées et programme
 * de la semaine, et une bibliothèque rangée comme l'index d'un annuaire.
 */

const NAV: { route: Route; label: string }[] = [
  { route: { name: 'home' }, label: t('À la une') },
  { route: { name: 'library' }, label: t('Index') },
  { route: { name: 'discover' }, label: t('Critiques') },
  { route: { name: 'calendar' }, label: t('Programme') },
  { route: { name: 'manga' }, label: t('Manga') },
  { route: { name: 'stats' }, label: t('Chiffres') },
  { route: { name: 'badges' }, label: t('Palmarès') },
  { route: { name: 'settings' }, label: t('Rédaction') }
]

function issueNumber(): number {
  // Un numéro par semaine depuis le début de l'année : il change sans qu'on y pense.
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 1)
  return Math.ceil((now.getTime() - start.getTime()) / (7 * 86_400_000))
}

function Nav(): React.JSX.Element {
  const route = useApp((s) => s.route)
  const navigate = useApp((s) => s.navigate)
  const setPalette = useApp((s) => s.setPalette)
  const today = new Date().toLocaleDateString(locale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })

  return (
    <nav aria-label={t('Navigation principale')} className="xm-nav shrink-0 px-12 pt-5">
      <div className="xm-rule flex items-center justify-between pb-1.5 text-[0.72rem] uppercase tracking-[0.18em]">
        <span>N° {issueNumber()}</span>
        <span>{today}</span>
        <button className="flex items-center gap-1.5 uppercase" onClick={() => setPalette(true)}>
          <Search size={12} /> {t('Rechercher')}
        </button>
      </div>
      <p className="xm-masthead select-none text-center">{t('AnimeList')}</p>
      <div className="xm-rule-double flex justify-center gap-8 py-2">
        {NAV.map(({ route: target, label }) => (
          <button
            key={target.name}
            onClick={() => navigate(target)}
            aria-current={route.name === target.name ? 'page' : undefined}
            className="xm-section"
          >
            {label}
          </button>
        ))}
      </div>
    </nav>
  )
}

function Cover({ media }: { media: Media }): React.JSX.Element {
  const state = useApp()
  const lang = state.prefs.titleLang
  const next = nextEpisodeOf(state, media.id, media.episodes)
  const seen = state.watched.get(media.id)?.size ?? 0

  return (
    <article className="xm-cover col-span-2 row-span-2 pr-8">
      <p className="xm-kicker">
        {t('Grand dossier ·')} {formatLabel(media.format)}
      </p>
      <button className="block text-left" onClick={() => state.navigate({ name: 'anime', id: media.id })}>
        <h1 className="xm-headline mt-2">{titleOf(media, lang)}</h1>
      </button>
      <p className="xm-deck mt-3">
        {seen > 0
          ? t('Tu en es à {seen} épisode{v1} sur {v2}. {v3}', {
              seen,
              v1: seen > 1 ? 's' : '',
              v2: media.episodes ?? '?',
              v3: next ? t('L’épisode {next} t’attend.', { next }) : ''
            })
          : t('La série dont tout le monde parle cette semaine.')}
      </p>
      <figure className="mt-5">
        <img src={media.banner ?? media.cover.xl} alt="" className="xm-photo aspect-[16/8] w-full object-cover" />
        <figcaption className="xm-caption mt-1.5">
          {media.studios[0] ?? t('Studio inconnu')} · {media.seasonYear ?? ''}
          {media.averageScore !== null &&
            t(' · {averageScore}/100 d’appréciation', { averageScore: media.averageScore })}
        </figcaption>
      </figure>
      {media.description && <p className="xm-body xm-dropcap mt-4 columns-2 gap-8">{media.description}</p>}
    </article>
  )
}

function Home(): React.JSX.Element {
  const navigate = useApp((s) => s.navigate)
  const lang = useApp((s) => s.prefs.titleLang)
  const continuing = useContinue()
  const behind = useBehind()
  const upcoming = useUpcoming()
  const totals = useTotals()
  const trending = useBrowse({ kind: 'trending', perPage: 10 })
  const season = useBrowse({ kind: 'season', perPage: 8 })
  const lead = continuing[0] ?? trending.items[0]

  return (
    <div className="px-12 pb-16 pt-8">
      <div className="grid grid-cols-3 gap-y-8">
        {lead ? <Cover media={lead} /> : <div className="skeleton col-span-2 row-span-2 h-[520px]" />}

        <aside className="xm-column pl-8">
          <p className="xm-kicker">{t('En bref')}</p>
          <ol className="mt-3">
            {behind.slice(0, 6).map(({ media, behind: n }, i) => (
              <li key={media.id} className="xm-brief">
                <span className="xm-num">{i + 1}</span>
                <button className="text-left" onClick={() => navigate({ name: 'anime', id: media.id })}>
                  <span className="xm-brief-title">{titleOf(media, lang)}</span>
                  <span className="xm-caption block">{t('{n} épisode{s} en retard', { n, s: n > 1 ? 's' : '' })}</span>
                </button>
              </li>
            ))}
            {behind.length === 0 && <li className="xm-caption">{t('Aucun retard à signaler.')}</li>}
          </ol>
        </aside>

        <aside className="xm-column pl-8">
          <p className="xm-kicker">{t('Au programme')}</p>
          <ul className="mt-3">
            {upcoming.slice(0, 6).map((media) => (
              <li key={media.id} className="xm-listing">
                <span className="xm-listing-time">{airingLabel(media.nextAiring!.airingAt)}</span>
                <span className="xm-leader" />
                <button className="text-left font-semibold" onClick={() => navigate({ name: 'anime', id: media.id })}>
                  {titleOf(media, lang)}{' '}
                  <span className="font-normal">
                    {t('· ép.')} {media.nextAiring!.episode}
                  </span>
                </button>
              </li>
            ))}
            {upcoming.length === 0 && <li className="xm-caption">{t('Relâche cette semaine.')}</li>}
          </ul>
          <div className="xm-stat mt-6">
            <p className="xm-kicker">{t('Le chiffre')}</p>
            <p className="xm-big">{totals.week}</p>
            <p className="xm-caption">
              {t('épisodes vus ces sept derniers jours, soit')} {minutesToHuman(totals.weekMinutes)}.
            </p>
          </div>
        </aside>
      </div>

      <div className="xm-rule-double mt-10 pt-6">
        <p className="xm-kicker">{t('Critiques de la saison')}</p>
        <div className="mt-4 grid grid-cols-4 gap-8">
          {season.items.slice(0, 4).map((media) => (
            <article key={media.id} className="xm-review">
              <button className="text-left" onClick={() => navigate({ name: 'anime', id: media.id })}>
                <img src={media.cover.large} alt="" className="xm-photo aspect-[4/5] w-full object-cover" />
                <h3 className="xm-review-title mt-3">{titleOf(media, lang)}</h3>
              </button>
              {media.description && <p className="xm-body clamp-3 mt-1.5">{media.description}</p>}
            </article>
          ))}
        </div>
      </div>

      <div className="xm-rule-double mt-10 grid grid-cols-2 gap-12 pt-6">
        <div>
          <p className="xm-kicker">{t('Palmarès de la semaine')}</p>
          <ol className="mt-3">
            {trending.items.map((media, i) => (
              <li key={media.id} className="xm-chart">
                <span className="xm-chart-rank">{String(i + 1).padStart(2, '0')}</span>
                <button className="text-left" onClick={() => navigate({ name: 'anime', id: media.id })}>
                  {titleOf(media, lang)}
                </button>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <p className="xm-kicker">{t('Sur la table de chevet')}</p>
          <div className="mt-3 grid grid-cols-3 gap-4">
            {continuing.slice(1, 7).map((media) => (
              <button key={media.id} className="text-left" onClick={() => navigate({ name: 'anime', id: media.id })}>
                <img src={media.cover.large} alt="" className="xm-photo aspect-[2/3] w-full object-cover" />
                <span className="xm-caption clamp-2 mt-1 block">{titleOf(media, lang)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Library(): React.JSX.Element {
  const shelf = useShelf()
  const navigate = useApp((s) => s.navigate)
  const lang = useApp((s) => s.prefs.titleLang)
  const watched = useApp((s) => s.watched)

  // Un index se lit dans l'ordre alphabétique, rangé sous sa lettre.
  const letters = useMemo(() => {
    const groups = new Map<string, typeof shelf>()
    const sorted = [...shelf].sort((a, b) => titleOf(a.media, lang).localeCompare(titleOf(b.media, lang), 'fr'))
    for (const row of sorted) {
      const first = titleOf(row.media, lang).charAt(0).toUpperCase()
      const key = /[A-Z]/.test(first) ? first : '#'
      groups.set(key, [...(groups.get(key) ?? []), row])
    }
    return [...groups.entries()]
  }, [shelf, lang])

  return (
    <div className="px-12 pb-16 pt-8">
      <h1 className="xm-headline">{t('Index')}</h1>
      <p className="xm-deck mt-2">
        {shelf.length} {t('titres, de A à Z.')}
      </p>
      <div className="mt-8 columns-3 gap-10">
        {letters.map(([letter, rows]) => (
          <section key={letter} className="mb-6 break-inside-avoid">
            <h2 className="xm-letter">{letter}</h2>
            {rows.map(({ media, entry }) => (
              <button key={media.id} className="xm-entry" onClick={() => navigate({ name: 'anime', id: media.id })}>
                <span className="xm-entry-title">{titleOf(media, lang)}</span>
                <span className="xm-leader" />
                <span className="xm-entry-page">
                  {watched.get(media.id)?.size ?? 0}/{media.episodes ?? '?'}
                </span>
                <span className="xm-caption col-span-3 block">{STATUS_LABELS[entry.status]}</span>
              </button>
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}

// Lundi d'abord.
const DAY_NAMES = [...dayNames().slice(1), dayNames()[0]]

/** La double page « L'année en chiffres » : gros chiffres, citation, infographies au trait. */
function Stats(): React.JSX.Element {
  const s = useStats()
  const navigate = useApp((st) => st.navigate)
  const lang = useApp((st) => st.prefs.titleLang)
  const top = s.topSeries[0]?.media
  const totalGenre = s.genres.reduce((sum, g) => sum + g.minutes, 0) || 1
  const peakMonth = Math.max(1, ...s.months.map((m) => m.episodes))
  const favDay = s.weekdays.indexOf(Math.max(...s.weekdays))
  const favHour = s.hours.indexOf(Math.max(...s.hours))

  return (
    <div className="px-12 pb-16 pt-8">
      <p className="xm-kicker">{t('Dossier spécial')}</p>
      <h1 className="xm-headline mt-2">{t('L’année en chiffres')}</h1>
      <p className="xm-deck mt-3">{t('Ce que ton historique dit de toi, du premier épisode au dernier coché.')}</p>

      <div className="xm-rule-double mt-8 grid grid-cols-4">
        {[
          [Math.round(s.minutes / 60), t('heures passées devant l’écran')],
          [s.episodes, t('épisodes cochés')],
          [s.series, t('séries commencées')],
          [s.bestStreak, t('jours d’affilée, au mieux')]
        ].map(([value, caption]) => (
          <div key={caption} className="xm-figure">
            <p className="xm-big">{value}</p>
            <p className="xm-caption mt-2">{caption}</p>
          </div>
        ))}
      </div>

      {top && (
        <blockquote className="xm-quote my-12">
          {t('« Ta série de l’année, c’est')}{' '}
          <button className="xm-quote-title" onClick={() => navigate({ name: 'anime', id: top.id })}>
            {titleOf(top, lang)}
          </button>{' '}
          : {minutesToHuman(s.topSeries[0].minutes)} {t('de ta vie. »')}
        </blockquote>
      )}

      <div className="grid grid-cols-3 gap-10">
        <section className="col-span-2">
          <p className="xm-kicker">{t('Les genres, en part du temps')}</p>
          <ol className="mt-4">
            {s.genres.map((g) => (
              <li key={g.name} className="xm-share">
                <span className="xm-share-pct">{Math.round((g.minutes / totalGenre) * 100)}%</span>
                <span className="xm-brief-title">{g.name}</span>
                <span className="xm-share-bar">
                  <span style={{ width: `${(g.minutes / totalGenre) * 100}%` }} />
                </span>
              </li>
            ))}
          </ol>
        </section>
        <aside className="xm-column pl-8">
          <p className="xm-kicker">{t('Le portrait')}</p>
          <p className="xm-body mt-3">
            {t('Tu regardes surtout le')} <strong>{DAY_NAMES[favDay]}</strong>
            {t(', vers')} <strong>{favHour} h</strong>.
            {s.record &&
              t(' Ta plus grosse journée : {episodes} épisodes, le {v1}.', {
                episodes: s.record.episodes,
                v1: new Date(s.record.at).toLocaleDateString(locale(), { day: 'numeric', month: 'long' })
              })}
            {s.avgScore !== null && t(' Tu notes en moyenne {v0} sur 10.', { v0: s.avgScore.toFixed(1) })}
          </p>
          <p className="xm-kicker mt-6">{t('Studios')}</p>
          <ol className="mt-2">
            {s.studios.map((st, i) => (
              <li key={st.name} className="xm-chart">
                <span className="xm-chart-rank">{String(i + 1).padStart(2, '0')}</span>
                <span>{st.name}</span>
                <span className="xm-entry-page ml-auto">
                  {st.episodes} {t('ép.')}
                </span>
              </li>
            ))}
          </ol>
        </aside>
      </div>

      <section className="xm-rule-double mt-12 pt-6">
        <p className="xm-kicker">{t('Mois par mois')}</p>
        <div className="mt-4 grid grid-cols-12 gap-3">
          {s.months.map((m, i) => (
            <div key={i} className="flex flex-col items-center">
              <div className="flex h-[140px] w-full items-end justify-center">
                <span className="xm-month" style={{ height: `${Math.max(2, (m.episodes / peakMonth) * 100)}%` }} />
              </div>
              <span className="xm-caption mt-2 uppercase">{m.label}</span>
              <span className="xm-entry-page">{m.episodes}</span>
            </div>
          ))}
        </div>
        <div className="mt-6 flex justify-between">
          {s.weekdays.map((n, i) => (
            <span key={i} className="xm-caption">
              {WEEKDAYS[i]} <strong className="text-[#1a1a1a]">{n}</strong>
            </span>
          ))}
        </div>
      </section>
    </div>
  )
}

export const magazine: Experience = {
  Nav,
  Home,
  Library,
  Stats,
  Discover: MagazineDiscover,
  Calendar: MagazineCalendar,
  Manga: MagazineManga,
  DetailHero: MagazineDetailHero,
  Badges: MagazineBadges,
  DetailBody: MagazineDetailBody,
  motion: {
    initial: { opacity: 0, rotateY: -8, x: 30, transformPerspective: 1400, originX: 0 },
    animate: { opacity: 1, rotateY: 0, x: 0 },
    exit: { opacity: 0, x: -20 },
    transition: { duration: 0.5, ease: [0.25, 1, 0.5, 1] }
  }
}
