/**
 * « Ce qu'il te reste » : combien de temps pour venir à bout de sa liste.
 *
 * Deux vitesses, qu'on ne confond plus :
 * - le **rythme** : ce qu'on regarde par journée où l'on regarde. Il donne un
 *   nombre de *journées de visionnage* ;
 * - la **fréquence** : combien de jours sur sept on regarde. C'est elle qui
 *   change ces journées en temps du calendrier. Sans elle, « 232 jours à ton
 *   rythme » se lisait comme sept mois et demi, quand il en faut un an et plus
 *   à qui regarde un soir sur deux.
 *
 * La fréquence se mesure sur les 90 derniers jours au plus : une habitude
 * d'il y a deux ans ne dit rien de ce soir. Et sur les jours écoulés depuis la
 * première séance seulement, pour qu'un nouveau venu ne passe pas pour un
 * spectateur rare.
 *
 * Pur et testé.
 */

const DAY_MS = 86_400_000
export const FREQUENCY_WINDOW_DAYS = 90
/** En dessous, la projection est donnée mais signalée comme fragile. */
export const RELIABLE_DAYS = 14

export interface BacklogForecast {
  /** Minutes regardées en moyenne par journée active. */
  perActiveDay: number
  /** Journées de visionnage qu'il faut à ce rythme, ou `null` sans rythme connu. */
  viewingDays: number | null
  /** Jours actifs par semaine, sur la fenêtre récente (de 0 à 7). */
  perWeek: number
  /** Les mêmes journées, étalées au calendrier à cette fréquence ; `null` sans fréquence. */
  calendarDays: number | null
  /** Trop peu de journées pour que la projection tienne. */
  thin: boolean
}

/**
 * @param totalMinutes ce qu'il reste à regarder
 * @param livedMinutes ce qui a été regardé, rattrapages importés exclus
 * @param activeDays le début (minuit local) de chaque journée où l'on a regardé, importés exclus
 */
export function forecastBacklog(
  totalMinutes: number,
  livedMinutes: number,
  activeDays: number[],
  now: number
): BacklogForecast {
  const count = activeDays.length
  const perActiveDay = count ? livedMinutes / count : 0
  const viewingDays = perActiveDay > 0 ? Math.ceil(totalMinutes / perActiveDay) : null

  const today = new Date(now).setHours(0, 0, 0, 0)
  const first = count ? Math.min(...activeDays) : today
  const since = Math.round((today - first) / DAY_MS) + 1
  const window = Math.min(FREQUENCY_WINDOW_DAYS, since)
  const from = today - (window - 1) * DAY_MS
  const recent = activeDays.filter((d) => d >= from && d <= today).length
  const perWeek = count ? (recent / window) * 7 : 0

  return {
    perActiveDay,
    viewingDays,
    perWeek,
    calendarDays: viewingDays !== null && perWeek > 0 ? Math.ceil((viewingDays * 7) / perWeek) : null,
    thin: count > 0 && count < RELIABLE_DAYS
  }
}

/** « 3 semaines », « environ 8 mois », « environ 2,5 ans » : l'ordre de grandeur, pas une date. */
export function spanLabel(days: number): string {
  if (days < 14) return `${days} jour${days > 1 ? 's' : ''}`
  if (days < 60) return `${Math.round(days / 7)} semaines`
  if (days < 365) return `environ ${Math.round(days / 30.44)} mois`
  const years = Math.round((days / 365.25) * 2) / 2
  return years === 1 ? 'environ 1 an' : `environ ${String(years).replace('.', ',')} ans`
}

/** Des minutes en heures rondes : « 156 h » plutôt que « 6 j 12 h », qu'on lisait comme des jours de calendrier. */
export function hoursLabel(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`
  return `${Math.round(minutes / 60).toLocaleString('fr-FR')} h`
}
