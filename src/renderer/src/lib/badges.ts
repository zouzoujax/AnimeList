import {
  Activity,
  Anchor,
  Archive,
  Atom,
  Award,
  Ban,
  Bed,
  Bookmark,
  Boxes,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  CheckCheck,
  Clapperboard,
  Clock,
  Compass,
  Crown,
  Database,
  Diamond,
  Dices,
  Drum,
  Eye,
  Factory,
  Feather,
  Film,
  Fish,
  Flame,
  Flower2,
  FolderHeart,
  Footprints,
  Gamepad2,
  Gauge,
  Gem,
  Ghost,
  Globe,
  Heart,
  HeartHandshake,
  History,
  Hourglass,
  Layers,
  Leaf,
  Library,
  ListTodo,
  Magnet,
  Medal,
  Megaphone,
  Milestone,
  Moon,
  Mountain,
  NotebookPen,
  Orbit,
  Package,
  Palette,
  Pencil,
  PenLine,
  Play,
  Popcorn,
  Puzzle,
  Radio,
  Repeat,
  Rocket,
  RotateCcw,
  Ruler,
  Scale,
  Shuffle,
  Skull,
  Smartphone,
  Snail,
  Snowflake,
  Sparkles,
  Split,
  Sprout,
  Star,
  Sun,
  Sunrise,
  Swords,
  Target,
  Tent,
  ThumbsDown,
  Ticket,
  Timer,
  Tornado,
  Trash2,
  TreePine,
  TrendingUp,
  Trophy,
  Tv,
  Umbrella,
  Undo2,
  Users,
  Warehouse,
  Waves,
  Wifi,
  Wind,
  Zap,
  Infinity as InfinityIcon
} from 'lucide-react'
import { useMemo } from 'react'
import { isEarned, UNKNOWN_DATE, unlockedAt } from '@shared/badge-log'
import { formatDate, startOfDay } from '@/lib/format'
import { useApp } from '@/store/app'
import { t } from '@shared/i18n'

/*
 * Le mur des badges, calculé une fois pour toute l’app.
 *
 * Sorti de la page Statistiques pour que les expériences, qui ont chacune leur
 * propre page, montrent exactement les mêmes badges et les mêmes progressions.
 */

const DAY_MS = 86_400_000

function streaksOf(dayKeys: number[]): { current: number; best: number } {
  if (!dayKeys.length) return { current: 0, best: 0 }
  const sorted = [...dayKeys].sort((a, b) => a - b)
  let best = 1
  let run = 1
  for (let i = 1; i < sorted.length; i += 1) {
    run = sorted[i] - sorted[i - 1] === DAY_MS ? run + 1 : 1
    best = Math.max(best, run)
  }

  const today = startOfDay(Date.now())
  const latest = sorted[sorted.length - 1]
  if (latest !== today && latest !== today - DAY_MS) return { current: 0, best }

  let current = 1
  for (let i = sorted.length - 1; i > 0; i -= 1) {
    if (sorted[i] - sorted[i - 1] !== DAY_MS) break
    current += 1
  }
  return { current, best }
}

export interface Badge {
  id: string
  label: string
  hint: string
  icon: typeof Trophy
  /**
   * L'avancement du moment : 1 ou plus, la condition est remplie aujourd'hui.
   * En dessous, il remplit la barre. Il ne dit pas à lui seul si le badge est
   * acquis — un badge gagné le reste, voir `earned`.
   */
  progress: number
  group: string
  /**
   * Le jour où il est tombé, `UNKNOWN_DATE` s'il était acquis avant que le
   * registre n'existe, `null` s'il n'y est pas encore inscrit.
   */
  unlockedAt: number | null
  /**
   * Acquis, une fois pour toutes.
   *
   * La condition est remplie maintenant, ou elle l'a été un jour et le
   * registre s'en souvient. C'est ce qu'il faut regarder pour allumer une
   * médaille ; `progress` ne sert plus qu'à la barre.
   */
  earned: boolean
}

/**
 * Ce que dit un badge quand le curseur s'y pose.
 *
 * Une seule fabrique pour les sept endroits qui affichent des badges — la page
 * classique, la nouvelle, et les cinq expériences : deux formulations pour la
 * même chose finiraient par diverger.
 */
export function badgeTitle(badge: Badge): string {
  if (!badge.earned) {
    return `${Math.round(Math.min(1, Math.max(0, badge.progress)) * 100)} % — ${badge.hint}`
  }
  if (badge.unlockedAt === null) return t('Débloqué — {hint}', { hint: badge.hint })
  // Tous les badges d'avant le registre : la date n'a jamais été notée, et
  // afficher celle du jour où il a été inventorié serait un mensonge.
  if (badge.unlockedAt === UNKNOWN_DATE) return t('Débloqué avant le suivi des dates — {hint}', { hint: badge.hint })
  return t('Débloqué le {v0} — {hint}', { v0: formatDate(badge.unlockedAt), hint: badge.hint })
}

export const BADGE_GROUPS = [
  t('Volume'),
  t('Assiduité'),
  t('Exploits'),
  t('Collection'),
  t('Curiosité'),
  t('Critique'),
  t('Époques')
] as const

export interface BadgeStats {
  minutes: number
  livedMinutes: number
  episodes: number
  importedCount: number
  perDay: Map<number, number>
  perYear: Map<number, number>
  activeDays: number
  bestDay: number
  completed: number
  watching: number
  tracked: number
  meanScore: number | null
  scoredCount: number
  genres: [string, number][]
  studios: [string, number][]
  studioCount: number
  streaks: { current: number; best: number }
  night: number
  weekend: number
  emotionsUsed: number
  notes: number
  favorites: number
  rewatches: number
  movies: number
  longDone: number
  perfect: number
  dropped: number
  morning: number
  weekdays: number
  months: number
  bestDayMinutes: number
  bestTitleDay: number
  bestVariety: number
  startedTitles: number
  topGenre: number
  topStudio: number
  releaseYears: number
  decades: Set<number>
  airSeasons: Set<string>
  oldest: number
  shortForm: number
  confidential: number
  mainstream: number
  planned: number
  scoresUsed: number
  harsh: number
  contrarian: number
  fastFinish: number
}

/** Les chiffres qui nourrissent les badges, et les badges eux-mêmes. */
export function useBadgeWall(): { stats: BadgeStats; badges: Badge[] } {
  const events = useApp((s) => s.events)
  const entries = useApp((s) => s.entries)
  const mediaMap = useApp((s) => s.media)
  const listCount = useApp((s) => s.lists.length)

  const stats = useMemo<BadgeStats>(() => {
    const perDay = new Map<number, number>()
    const perGenre = new Map<string, number>()
    const perStudio = new Map<string, number>()
    const perYear = new Map<number, number>()
    let minutes = 0
    /**
     * Les minutes réellement vécues dans l'app.
     *
     * `minutes` compte tout, imports compris ; `perDay` ne compte que ce qui a
     * été coché ici. Diviser l'un par l'autre mélange deux populations et
     * donne un rythme absurde — 268 heures par jour sur une bibliothèque
     * importée. Toute vitesse doit se calculer sur cette valeur-ci.
     */
    let livedMinutes = 0
    let importedCount = 0

    for (const ev of events) {
      // Totals and breakdowns count everything; anything keyed on a date only
      // counts episodes actually ticked in this app.
      minutes += ev.minutes
      if (ev.imported) importedCount += 1
      else {
        livedMinutes += ev.minutes
        const day = startOfDay(ev.at)
        const year = new Date(ev.at).getFullYear()
        perDay.set(day, (perDay.get(day) ?? 0) + 1)
        perYear.set(year, (perYear.get(year) ?? 0) + 1)
      }

      const media = mediaMap.get(ev.animeId)
      if (!media) continue
      for (const g of media.genres) perGenre.set(g, (perGenre.get(g) ?? 0) + 1)
      for (const s of media.studios.slice(0, 1)) perStudio.set(s, (perStudio.get(s) ?? 0) + 1)
    }

    const list = [...entries.values()]
    const scored = list.filter((e) => e.score !== null)
    const streaks = streaksOf([...perDay.keys()])

    // Habits, only from episodes actually ticked here — imported rows carry the
    // date they were checked off elsewhere, so their hour of day means nothing.
    let night = 0
    let weekend = 0
    for (const ev of events) {
      if (ev.imported) continue
      const d = new Date(ev.at)
      if (d.getHours() < 5) night += 1
      if (d.getDay() === 0 || d.getDay() === 6) weekend += 1
    }

    // Moods and notes come from two places: the series as a whole, and each
    // individual viewing.
    const emotionsUsed = new Set<string>()
    let notes = 0
    for (const ev of events) {
      for (const emotion of ev.emotions ?? []) emotionsUsed.add(emotion)
      if (ev.note?.trim()) notes += 1
    }
    let favorites = 0
    let rewatches = 0
    let movies = 0
    let longDone = 0
    let perfect = 0
    let dropped = 0
    for (const entry of list) {
      for (const emotion of entry.emotions) emotionsUsed.add(emotion)
      if (entry.notes.trim()) notes += 1
      if (entry.favorite) favorites += 1
      if (entry.score === 10) perfect += 1
      if (entry.status === 'dropped') dropped += 1
      rewatches += entry.rewatches
      const media = mediaMap.get(entry.animeId)
      if (entry.status === 'completed' && media) {
        if (media.format === 'MOVIE') movies += 1
        if ((media.episodes ?? 0) >= 100) longDone += 1
      }
    }

    // Habitudes fines : heure creuse, jour de semaine, mois de l'année, et les
    // records d'une seule journée. Toujours sans les épisodes importés, dont la
    // date vient d'une autre app et ne dit rien de l'heure à laquelle on
    // regardait.
    const weekdays = new Set<number>()
    const months = new Set<number>()
    const minutesPerDay = new Map<number, number>()
    const titlesPerDay = new Map<number, Set<number>>()
    const perTitleDay = new Map<string, number>()
    let morning = 0
    for (const ev of events) {
      if (ev.imported) continue
      const d = new Date(ev.at)
      const day = startOfDay(ev.at)
      weekdays.add(d.getDay())
      months.add(d.getMonth())
      if (d.getHours() >= 5 && d.getHours() < 9) morning += 1
      minutesPerDay.set(day, (minutesPerDay.get(day) ?? 0) + ev.minutes)
      let seen = titlesPerDay.get(day)
      if (!seen) titlesPerDay.set(day, (seen = new Set()))
      seen.add(ev.animeId)
      const key = `${day}:${ev.animeId}`
      perTitleDay.set(key, (perTitleDay.get(key) ?? 0) + 1)
    }

    // Ce que la bibliothèque couvre : époques, saisons de diffusion, formats,
    // et les deux extrêmes de la popularité AniList.
    const releaseYears = new Set<number>()
    const decades = new Set<number>()
    const airSeasons = new Set<string>()
    let oldest = Number.POSITIVE_INFINITY
    let shortForm = 0
    let confidential = 0
    let mainstream = 0
    let planned = 0
    let harsh = 0
    let contrarian = 0
    let fastFinish = 0
    for (const entry of list) {
      const media = mediaMap.get(entry.animeId)
      if (entry.status === 'planned') planned += 1
      if (entry.score !== null && entry.score <= 3) harsh += 1
      if (!media) continue
      if (media.seasonYear) {
        releaseYears.add(media.seasonYear)
        decades.add(Math.floor(media.seasonYear / 10) * 10)
        oldest = Math.min(oldest, media.seasonYear)
      }
      if (media.season) airSeasons.add(media.season)
      if (media.popularity < 5_000) confidential += 1
      if (media.popularity > 300_000) mainstream += 1
      // Un écart de 25 points entre la note donnée (sur 10) et la moyenne
      // AniList (sur 100) : deux avis qui ne parlent pas de la même série.
      if (
        entry.score !== null &&
        media.averageScore !== null &&
        Math.abs(entry.score * 10 - media.averageScore) >= 25
      ) {
        contrarian += 1
      }
      if (entry.status !== 'completed') continue
      if ((media.duration ?? 99) <= 10) shortForm += 1
      if (
        entry.startedAt !== null &&
        entry.finishedAt !== null &&
        (media.episodes ?? 0) >= 12 &&
        entry.finishedAt - entry.startedAt <= DAY_MS
      ) {
        fastFinish += 1
      }
    }

    const peak = (values: Iterable<number>): number => {
      let out = 0
      for (const v of values) out = Math.max(out, v)
      return out
    }

    return {
      minutes,
      livedMinutes,
      episodes: events.length,
      importedCount,
      perDay,
      perYear,
      activeDays: perDay.size,
      bestDay: perDay.size ? Math.max(...perDay.values()) : 0,
      completed: list.filter((e) => e.status === 'completed').length,
      watching: list.filter((e) => e.status === 'watching').length,
      tracked: list.length,
      meanScore: scored.length ? scored.reduce((sum, e) => sum + (e.score ?? 0), 0) / scored.length : null,
      scoredCount: scored.length,
      genres: [...perGenre.entries()].sort((a, b) => b[1] - a[1]),
      studios: [...perStudio.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7),
      studioCount: perStudio.size,
      streaks,
      night,
      weekend,
      emotionsUsed: emotionsUsed.size,
      notes,
      favorites,
      rewatches,
      movies,
      longDone,
      perfect,
      dropped,

      morning,
      weekdays: weekdays.size,
      months: months.size,
      bestDayMinutes: peak(minutesPerDay.values()),
      bestTitleDay: peak(perTitleDay.values()),
      bestVariety: peak([...titlesPerDay.values()].map((set) => set.size)),
      startedTitles: new Set(events.map((ev) => ev.animeId)).size,
      topGenre: peak(perGenre.values()),
      topStudio: peak(perStudio.values()),
      releaseYears: releaseYears.size,
      decades,
      airSeasons,
      oldest,
      shortForm,
      confidential,
      mainstream,
      planned,
      scoresUsed: new Set(scored.map((e) => e.score)).size,
      harsh,
      contrarian,
      fastFinish
    }
  }, [events, entries, mediaMap])

  // Ni la date ni « acquis » : la première est lue dans le registre plus bas,
  // le second s'en déduit. Ici on ne calcule que l'avancement du moment.
  const badges = useMemo<Omit<Badge, 'unlockedAt' | 'earned'>[]>(() => {
    const hours = stats.minutes / 60
    const days = stats.minutes / 1440
    return [
      // ---- Volume : nombre d'épisodes et temps cumulé
      {
        group: t('Volume'),
        id: 'first',
        label: t('Premier pas'),
        hint: t('1 épisode coché'),
        icon: Sparkles,
        progress: stats.episodes
      },
      {
        group: t('Volume'),
        id: 'c10',
        label: t('Mise en route'),
        hint: t('10 épisodes'),
        icon: Play,
        progress: stats.episodes / 10
      },
      {
        group: t('Volume'),
        id: 'c100',
        label: t('Centurion'),
        hint: t('100 épisodes'),
        icon: Medal,
        progress: stats.episodes / 100
      },
      {
        group: t('Volume'),
        id: 'c500',
        label: t('Vétéran'),
        hint: t('500 épisodes'),
        icon: Swords,
        progress: stats.episodes / 500
      },
      {
        group: t('Volume'),
        id: 'c1000',
        label: t('Millénaire'),
        hint: t('1 000 épisodes'),
        icon: Crown,
        progress: stats.episodes / 1000
      },
      {
        group: t('Volume'),
        id: 'c2500',
        label: t('Insatiable'),
        hint: t('2 500 épisodes'),
        icon: Orbit,
        progress: stats.episodes / 2500
      },
      {
        group: t('Volume'),
        id: 'c5000',
        label: t('Sans fond'),
        hint: t('5 000 épisodes'),
        icon: Atom,
        progress: stats.episodes / 5000
      },
      {
        group: t('Volume'),
        id: 'h10',
        label: t('Première soirée'),
        hint: t('10 heures'),
        icon: Clock,
        progress: hours / 10
      },
      {
        group: t('Volume'),
        id: 'h100',
        label: t('Otaku confirmé'),
        hint: t('100 heures'),
        icon: Timer,
        progress: hours / 100
      },
      {
        group: t('Volume'),
        id: 'h500',
        label: t('Légende'),
        hint: t('500 heures'),
        icon: Trophy,
        progress: hours / 500
      },
      {
        group: t('Volume'),
        id: 'd30',
        label: t('Un mois d’écran'),
        hint: t('30 jours cumulés'),
        icon: Hourglass,
        progress: days / 30
      },
      {
        group: t('Volume'),
        id: 'c7500',
        label: t('Sans limite'),
        hint: t('7 500 épisodes'),
        icon: InfinityIcon,
        progress: stats.episodes / 7500
      },
      {
        group: t('Volume'),
        id: 'h1000',
        label: t('Le millier d’heures'),
        hint: t('1 000 heures'),
        icon: Mountain,
        progress: hours / 1000
      },
      {
        group: t('Volume'),
        id: 'd100',
        label: t('Cent jours d’écran'),
        hint: t('100 jours cumulés'),
        icon: Tent,
        progress: days / 100
      },
      {
        group: t('Volume'),
        id: 'seen100',
        label: t('Cent titres entamés'),
        hint: t('100 séries commencées'),
        icon: Footprints,
        progress: stats.startedTitles / 100
      },

      // ---- Assiduité : régularité dans le temps
      {
        group: t('Assiduité'),
        id: 'streak3',
        label: t('Trois d’affilée'),
        hint: t('3 jours de suite'),
        icon: Activity,
        progress: stats.streaks.best / 3
      },
      {
        group: t('Assiduité'),
        id: 'streak7',
        label: t('Régulier'),
        hint: t('7 jours de suite'),
        icon: Flame,
        progress: stats.streaks.best / 7
      },
      {
        group: t('Assiduité'),
        id: 'streak14',
        label: t('Rituel'),
        hint: t('14 jours de suite'),
        icon: CalendarCheck,
        progress: stats.streaks.best / 14
      },
      {
        group: t('Assiduité'),
        id: 'streak30',
        label: t('Increvable'),
        hint: t('30 jours de suite'),
        icon: Rocket,
        progress: stats.streaks.best / 30
      },
      {
        group: t('Assiduité'),
        id: 'streak100',
        label: t('Métronome'),
        hint: t('100 jours de suite'),
        icon: Gauge,
        progress: stats.streaks.best / 100
      },
      {
        group: t('Assiduité'),
        id: 'days50',
        label: t('Habitué'),
        hint: t('50 jours actifs'),
        icon: CalendarDays,
        progress: stats.activeDays / 50
      },
      {
        group: t('Assiduité'),
        id: 'weekend',
        label: t('Roi du week-end'),
        hint: t('50 épisodes un samedi ou dimanche'),
        icon: Popcorn,
        progress: stats.weekend / 50
      },
      {
        group: t('Assiduité'),
        id: 'night',
        label: t('Noctambule'),
        hint: t('25 épisodes entre minuit et 5 h'),
        icon: Moon,
        progress: stats.night / 25
      },
      {
        group: t('Assiduité'),
        id: 'streak50',
        label: t('Inébranlable'),
        hint: t('50 jours de suite'),
        icon: Anchor,
        progress: stats.streaks.best / 50
      },
      {
        group: t('Assiduité'),
        id: 'streak365',
        label: t('Une année sans faute'),
        hint: t('365 jours de suite'),
        icon: Sun,
        progress: stats.streaks.best / 365
      },
      {
        group: t('Assiduité'),
        id: 'days100',
        label: t('Cent jours actifs'),
        hint: t('100 jours actifs'),
        icon: Sprout,
        progress: stats.activeDays / 100
      },
      {
        group: t('Assiduité'),
        id: 'days365',
        label: t('Une année d’activité'),
        hint: t('365 jours actifs'),
        icon: TreePine,
        progress: stats.activeDays / 365
      },
      {
        group: t('Assiduité'),
        id: 'morning',
        label: 'Lève-tôt',
        hint: t('50 épisodes entre 5 h et 9 h'),
        icon: Sunrise,
        progress: stats.morning / 50
      },
      {
        group: t('Assiduité'),
        id: 'weekdays',
        label: t('Semaine complète'),
        hint: t('regarder les 7 jours de la semaine'),
        icon: CalendarRange,
        progress: stats.weekdays / 7
      },
      {
        group: t('Assiduité'),
        id: 'months',
        label: t('Les douze mois'),
        hint: t('regarder pendant les 12 mois de l’année'),
        icon: CalendarClock,
        progress: stats.months / 12
      },

      // ---- Exploits : performances sur une journée
      {
        group: t('Exploits'),
        id: 'marathon5',
        label: t('Petite série'),
        hint: t('5 épisodes en un jour'),
        icon: Zap,
        progress: stats.bestDay / 5
      },
      {
        group: t('Exploits'),
        id: 'marathon12',
        label: t('Un cour d’un coup'),
        hint: t('12 épisodes en un jour'),
        icon: Layers,
        progress: stats.bestDay / 12
      },
      {
        group: t('Exploits'),
        id: 'marathon25',
        label: t('Nuit blanche'),
        hint: t('25 épisodes en un jour'),
        icon: Ghost,
        progress: stats.bestDay / 25
      },
      {
        group: t('Exploits'),
        id: 'marathon50',
        label: t('Hors catégorie'),
        hint: t('50 épisodes en un jour'),
        icon: Rocket,
        progress: stats.bestDay / 50
      },
      {
        group: t('Exploits'),
        id: 'long1',
        label: t('Le souffle long'),
        hint: t('terminer une série de 100+ épisodes'),
        icon: Snail,
        progress: stats.longDone
      },
      {
        group: t('Exploits'),
        id: 'long3',
        label: t('Fleuve tranquille'),
        hint: t('3 séries de 100+ épisodes'),
        icon: Undo2,
        progress: stats.longDone / 3
      },
      {
        group: t('Exploits'),
        id: 'rewatch',
        label: t('Encore une fois'),
        hint: t('un visionnage répété'),
        icon: Repeat,
        progress: stats.rewatches
      },
      {
        group: t('Exploits'),
        id: 'marathon75',
        label: t('Démesure'),
        hint: t('75 épisodes en un jour'),
        icon: Tornado,
        progress: stats.bestDay / 75
      },
      {
        group: t('Exploits'),
        id: 'day8h',
        label: t('Journée pleine'),
        hint: t('8 heures en une seule journée'),
        icon: Bed,
        progress: stats.bestDayMinutes / 480
      },
      {
        group: t('Exploits'),
        id: 'day12h',
        label: t('Sans dormir'),
        hint: t('12 heures en une seule journée'),
        icon: Skull,
        progress: stats.bestDayMinutes / 720
      },
      {
        group: t('Exploits'),
        id: 'binge12',
        label: t('D’une traite'),
        hint: t('12 épisodes de la même série en un jour'),
        icon: Drum,
        progress: stats.bestTitleDay / 12
      },
      {
        group: t('Exploits'),
        id: 'variety5',
        label: t('Zappeur'),
        hint: t('5 séries différentes en un jour'),
        icon: Shuffle,
        progress: stats.bestVariety / 5
      },
      {
        group: t('Exploits'),
        id: 'fastFinish',
        label: t('Avalée en un jour'),
        hint: t('finir une série de 12+ épisodes en 24 h'),
        icon: Wind,
        progress: stats.fastFinish
      },
      {
        group: t('Exploits'),
        id: 'long5',
        label: t('Marathonien'),
        hint: t('5 séries de 100+ épisodes'),
        icon: Waves,
        progress: stats.longDone / 5
      },
      {
        group: t('Exploits'),
        id: 'rewatch10',
        label: t('Éternel retour'),
        hint: t('10 revisionnages'),
        icon: RotateCcw,
        progress: stats.rewatches / 10
      },

      // ---- Collection : taille et forme de la bibliothèque
      {
        group: t('Collection'),
        id: 'done1',
        label: t('Générique de fin'),
        hint: t('1 série terminée'),
        icon: CheckCheck,
        progress: stats.completed
      },
      {
        group: t('Collection'),
        id: 'done10',
        label: t('Complétiste'),
        hint: t('10 séries terminées'),
        icon: Award,
        progress: stats.completed / 10
      },
      {
        group: t('Collection'),
        id: 'done50',
        label: t('Archiviste'),
        hint: t('50 séries terminées'),
        icon: Archive,
        progress: stats.completed / 50
      },
      {
        group: t('Collection'),
        id: 'done100',
        label: t('Bibliothécaire'),
        hint: t('100 séries terminées'),
        icon: Boxes,
        progress: stats.completed / 100
      },
      {
        group: t('Collection'),
        id: 'lib50',
        label: t('Collectionneur'),
        hint: t('50 titres suivis'),
        icon: Gem,
        progress: stats.tracked / 50
      },
      {
        group: t('Collection'),
        id: 'lib250',
        label: t('Conservateur'),
        hint: t('250 titres suivis'),
        icon: Database,
        progress: stats.tracked / 250
      },
      {
        group: t('Collection'),
        id: 'fav20',
        label: t('Cœur tendre'),
        hint: t('20 favoris'),
        icon: Heart,
        progress: stats.favorites / 20
      },
      {
        group: t('Collection'),
        id: 'movies10',
        label: t('Cinéphile'),
        hint: t('10 films terminés'),
        icon: Clapperboard,
        progress: stats.movies / 10
      },
      {
        group: t('Collection'),
        id: 'done25',
        label: t('Bon élève'),
        hint: t('25 séries terminées'),
        icon: Bookmark,
        progress: stats.completed / 25
      },
      {
        group: t('Collection'),
        id: 'done250',
        label: t('Rayonnage complet'),
        hint: t('250 séries terminées'),
        icon: Library,
        progress: stats.completed / 250
      },
      {
        group: t('Collection'),
        id: 'lib100',
        label: t('Étagère pleine'),
        hint: t('100 titres suivis'),
        icon: Package,
        progress: stats.tracked / 100
      },
      {
        group: t('Collection'),
        id: 'lib500',
        label: t('Entrepôt'),
        hint: t('500 titres suivis'),
        icon: Warehouse,
        progress: stats.tracked / 500
      },
      {
        group: t('Collection'),
        id: 'fav50',
        label: t('Grand cœur'),
        hint: t('50 favoris'),
        icon: HeartHandshake,
        progress: stats.favorites / 50
      },
      {
        group: t('Collection'),
        id: 'movies1',
        label: t('Séance unique'),
        hint: t('1 film terminé'),
        icon: Film,
        progress: stats.movies
      },
      {
        group: t('Collection'),
        id: 'movies25',
        label: t('Salle obscure'),
        hint: t('25 films terminés'),
        icon: Ticket,
        progress: stats.movies / 25
      },
      {
        group: t('Collection'),
        id: 'backlog50',
        label: t('Pile à voir'),
        hint: t('50 titres en attente'),
        icon: ListTodo,
        progress: stats.planned / 50
      },
      {
        group: t('Collection'),
        id: 'lists3',
        label: t('Rangement'),
        hint: t('3 listes personnalisées'),
        icon: FolderHeart,
        progress: listCount / 3
      },
      {
        group: t('Collection'),
        id: 'shortForm',
        label: t('Format court'),
        hint: t('10 séries de moins de 10 min terminées'),
        icon: Feather,
        progress: stats.shortForm / 10
      },

      // ---- Curiosité : diversité de ce qui est regardé
      {
        group: t('Curiosité'),
        id: 'genres5',
        label: 'Touche-à-tout',
        hint: t('5 genres différents'),
        icon: Dices,
        progress: stats.genres.length / 5
      },
      {
        group: t('Curiosité'),
        id: 'genres10',
        label: t('Explorateur'),
        hint: t('10 genres différents'),
        icon: Target,
        progress: stats.genres.length / 10
      },
      {
        group: t('Curiosité'),
        id: 'genresAll',
        label: t('Sans préjugé'),
        hint: t('les 18 genres'),
        icon: Globe,
        progress: stats.genres.length / 18
      },
      {
        group: t('Curiosité'),
        id: 'studios10',
        label: t('Œil averti'),
        hint: t('10 studios différents'),
        icon: Eye,
        progress: stats.studioCount / 10
      },
      {
        group: t('Curiosité'),
        id: 'studios25',
        label: t('Connaisseur'),
        hint: t('25 studios différents'),
        icon: Users,
        progress: stats.studioCount / 25
      },
      {
        group: t('Curiosité'),
        id: 'genres15',
        label: t('Sans frontière'),
        hint: t('15 genres différents'),
        icon: Compass,
        progress: stats.genres.length / 15
      },
      {
        group: t('Curiosité'),
        id: 'studios50',
        label: t('Carte des studios'),
        hint: t('50 studios différents'),
        icon: Factory,
        progress: stats.studioCount / 50
      },
      {
        group: t('Curiosité'),
        id: 'studioFan',
        label: t('Maison de confiance'),
        hint: t('250 épisodes d’un même studio'),
        icon: Magnet,
        progress: stats.topStudio / 250
      },
      {
        group: t('Curiosité'),
        id: 'genreFan',
        label: t('Genre de prédilection'),
        hint: t('500 épisodes d’un même genre'),
        icon: Puzzle,
        progress: stats.topGenre / 500
      },
      {
        group: t('Curiosité'),
        id: 'confidential',
        label: t('Hors des sentiers'),
        hint: t('suivre un titre de moins de 5 000 membres'),
        icon: Fish,
        progress: stats.confidential
      },
      {
        group: t('Curiosité'),
        id: 'mainstream',
        label: t('Grand public'),
        hint: t('suivre un titre de plus de 300 000 membres'),
        icon: Megaphone,
        progress: stats.mainstream
      },

      // ---- Critique : notes, ressentis, notes écrites
      {
        group: t('Critique'),
        id: 'rate1',
        label: t('Premier avis'),
        hint: t('1 note donnée'),
        icon: Star,
        progress: stats.scoredCount
      },
      {
        group: t('Critique'),
        id: 'rate25',
        label: t('Critique'),
        hint: t('25 notes données'),
        icon: TrendingUp,
        progress: stats.scoredCount / 25
      },
      {
        group: t('Critique'),
        id: 'rate100',
        label: t('Jury'),
        hint: t('100 notes données'),
        icon: Trophy,
        progress: stats.scoredCount / 100
      },
      {
        group: t('Critique'),
        id: 'perfect',
        label: 'Chef-d’œuvre',
        hint: t('mettre un 10/10'),
        icon: Crown,
        progress: stats.perfect
      },
      {
        group: t('Critique'),
        id: 'emotions',
        label: t('Palette complète'),
        hint: t('utiliser les 8 ressentis'),
        icon: Palette,
        progress: stats.emotionsUsed / 8
      },
      {
        group: t('Critique'),
        id: 'notes10',
        label: t('Carnet de bord'),
        hint: t('10 fiches annotées'),
        icon: Pencil,
        progress: stats.notes / 10
      },
      {
        group: t('Critique'),
        id: 'dropped',
        label: t('Sans pitié'),
        hint: t('abandonner 5 séries'),
        icon: Ban,
        progress: stats.dropped / 5
      },
      {
        group: t('Critique'),
        id: 'rate250',
        label: t('Grand jury'),
        hint: t('250 notes données'),
        icon: Scale,
        progress: stats.scoredCount / 250
      },
      {
        group: t('Critique'),
        id: 'scale',
        label: t('Toute la gamme'),
        hint: t('utiliser les 10 notes'),
        icon: Ruler,
        progress: stats.scoresUsed / 10
      },
      {
        group: t('Critique'),
        id: 'perfect5',
        label: t('Panthéon'),
        hint: t('5 notes de 10/10'),
        icon: Diamond,
        progress: stats.perfect / 5
      },
      {
        group: t('Critique'),
        id: 'harsh',
        label: t('Verdict sévère'),
        hint: t('mettre 3/10 ou moins'),
        icon: ThumbsDown,
        progress: stats.harsh
      },
      {
        group: t('Critique'),
        id: 'contrarian',
        label: t('À contre-courant'),
        hint: t('s’écarter de 25 points de la note AniList'),
        icon: Split,
        progress: stats.contrarian
      },
      {
        group: t('Critique'),
        id: 'notes1',
        label: t('Première ligne'),
        hint: t('1 fiche annotée'),
        icon: PenLine,
        progress: stats.notes
      },
      {
        group: t('Critique'),
        id: 'notes50',
        label: t('Journal intime'),
        hint: t('50 fiches annotées'),
        icon: NotebookPen,
        progress: stats.notes / 50
      },
      {
        group: t('Critique'),
        id: 'dropped25',
        label: t('Tri sans état d’âme'),
        hint: t('25 abandons'),
        icon: Trash2,
        progress: stats.dropped / 25
      },

      // ---- Époques : les années que la bibliothèque traverse
      {
        group: t('Époques'),
        id: 'era80',
        label: t('Avant la couleur'),
        hint: t('un titre d’avant 1990'),
        icon: Radio,
        progress: stats.oldest < 1990 ? 1 : 0
      },
      {
        group: t('Époques'),
        id: 'era90',
        label: t('Années 1990'),
        hint: t('un titre des années 1990'),
        icon: Tv,
        progress: stats.decades.has(1990) ? 1 : 0
      },
      {
        group: t('Époques'),
        id: 'era2000',
        label: t('Années 2000'),
        hint: t('un titre des années 2000'),
        icon: Gamepad2,
        progress: stats.decades.has(2000) ? 1 : 0
      },
      {
        group: t('Époques'),
        id: 'era2010',
        label: t('Années 2010'),
        hint: t('un titre des années 2010'),
        icon: Smartphone,
        progress: stats.decades.has(2010) ? 1 : 0
      },
      {
        group: t('Époques'),
        id: 'era2020',
        label: t('Années 2020'),
        hint: t('un titre des années 2020'),
        icon: Wifi,
        progress: stats.decades.has(2020) ? 1 : 0
      },
      {
        group: t('Époques'),
        id: 'decades4',
        label: t('Traversée du temps'),
        hint: t('4 décennies différentes'),
        icon: Milestone,
        progress: stats.decades.size / 4
      },
      {
        group: t('Époques'),
        id: 'years25',
        label: t('Vingt-cinq millésimes'),
        hint: t('25 années de sortie différentes'),
        icon: History,
        progress: stats.releaseYears / 25
      },
      {
        group: t('Époques'),
        id: 'winter',
        label: t('Hiver'),
        hint: t('un titre de la saison d’hiver'),
        icon: Snowflake,
        progress: stats.airSeasons.has('WINTER') ? 1 : 0
      },
      {
        group: t('Époques'),
        id: 'spring',
        label: t('Printemps'),
        hint: t('un titre de la saison de printemps'),
        icon: Flower2,
        progress: stats.airSeasons.has('SPRING') ? 1 : 0
      },
      {
        group: t('Époques'),
        id: 'summer',
        label: t('Été'),
        hint: t('un titre de la saison d’été'),
        icon: Umbrella,
        progress: stats.airSeasons.has('SUMMER') ? 1 : 0
      },
      {
        group: t('Époques'),
        id: 'autumn',
        label: t('Automne'),
        hint: t('un titre de la saison d’automne'),
        icon: Leaf,
        progress: stats.airSeasons.has('FALL') ? 1 : 0
      }
    ]
  }, [stats, listCount])

  // Les dates viennent du registre, à part : elles ne se déduisent de rien et
  // n'ont donc pas leur place dans le calcul qui précède.
  const log = useApp((s) => s.prefs.badgesAt)
  const dated = useMemo<Badge[]>(
    () =>
      badges.map((badge) => {
        const at = unlockedAt(badge.id, log)
        return { ...badge, unlockedAt: at, earned: isEarned(badge.progress, at) }
      }),
    [badges, log]
  )

  return { stats, badges: dated }
}
