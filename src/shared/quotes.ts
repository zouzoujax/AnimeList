/**
 * La partie sans réseau de la citation du jour : reconnaître une série,
 * choisir la citation d'une date.
 */

export interface Quote {
  text: string
  character: string
  /** Le nom de l'anime selon AnimeChan. */
  anime: string
  /** La série AniList qui a servi à la trouver. */
  animeId: number
}

const normalize = (s: string): string =>
  s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')

/**
 * Le nom renvoyé par AnimeChan désigne-t-il cette série ?
 *
 * Sa recherche est large : « Naruto » ramène aussi Boruto. On exige donc que
 * l'un des noms contienne l'un des titres, ou l'inverse, une fois débarrassés
 * de la ponctuation et des accents — et au moins quatre caractères en commun,
 * pour qu'un titre court ne valide pas n'importe quoi.
 */
export function quoteMatches(names: string[], titles: string[]): boolean {
  const a = names.map(normalize).filter((n) => n.length >= 4)
  const b = titles.map(normalize).filter((t) => t.length >= 4)
  return a.some((n) => b.some((t) => n.includes(t) || t.includes(n)))
}

/** Le numéro du jour, en heure locale : la citation change à minuit. */
const dayNumber = (date: Date): number =>
  Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000)

/**
 * La citation de ce jour. La même toute la journée, une autre le lendemain,
 * et toutes passent avant qu'une revienne.
 */
export function pickQuote(quotes: Quote[], date: Date): Quote | null {
  if (!quotes.length) return null
  // Un ordre stable, indépendant de l'ordre d'arrivée dans la réserve.
  const sorted = [...quotes].sort((x, y) => (x.text < y.text ? -1 : x.text > y.text ? 1 : 0))
  return sorted[dayNumber(date) % sorted.length]
}
