/**
 * Relie les saisons d'une franchise AniList aux sections d'une série chez Anime-Sama.
 *
 * Deviner une saison d'après son seul titre a montré ses limites : leur
 * « Saison 2 » de Demon Slayer est le troisième maillon d'AniList, l'arc du
 * Train de l'infini s'intercalant entre les deux ; Mushoku Tensei range sa
 * deuxième moitié de saison 1 dans `saison1` et coupe la saison 2 en
 * `saison2-1` et `saison2-2` ; le remake de Dragon Ball Super vit dans
 * `saison1hs`, sous « Saison 1 Remake 2026 ».
 *
 * On relie donc les deux listes d'un bloc. Chacune est dans son ordre — de
 * sortie pour AniList, de leur page pour Anime-Sama — et ces ordres
 * concordent : une fiche ne passe jamais avant une section déjà prise par une
 * fiche plus ancienne. Plusieurs fiches peuvent partager une section (les
 * cours d'une même saison), une fiche peut n'avoir aucune section (un arc
 * qu'ils n'ont pas), une section aucune fiche (une version sans fillers).
 * Parmi tous ces appariements, on garde celui que les indices soutiennent le
 * mieux :
 *
 * - le numéro de saison, quand le titre l'écrit (« Season 2 », « II ») ;
 * - la partie (« Part 2 » contre « Saison 2 Partie 2 ») ;
 * - l'année quand leur nom en porte une (« Remake 2026 ») ;
 * - les mots de leur nom retrouvés dans les titres (« Train » de l'infini
 *   dans « Mugen Train Arc ») ;
 * - le nombre d'épisodes de leur menu, quand la fenêtre de lecture l'a vu.
 *
 * Pur et testé : rien ici ne touche au réseau.
 */

import { compact, deaccent } from './titles'

/** Une section de saison chez eux, dans l'ordre de leur page. */
export interface SiteSeason {
  base: string
  name: string
  /** Épisodes de leur menu, relevés dans la fenêtre de lecture ; `null` tant qu'on ne l'a pas vu. */
  count: number | null
}

/** Un maillon de la franchise AniList, dans l'ordre de sortie. */
export interface ChainSeason {
  id: number
  /** Tous ses titres connus : romaji, anglais. */
  titles: string[]
  year: number | null
  episodes: number | null
}

export interface Placement {
  base: string
  /** Épisodes des fiches qui précèdent celle-ci dans la même section ; `null` si l'un manque. */
  offset: number | null
  /** Épisodes de toutes les fiches de la section ; `null` si l'un manque. */
  span: number | null
}

/** Les sections qui portent des saisons : ni films, ni OAV, ni scans. */
export const isSeasonal = (base: string): boolean => !/^(?:film|oav|scan)/.test(base)

/** Les mots de leur vocabulaire, qui ne désignent aucune saison en particulier. */
const GENERIC = new Set([
  'saison',
  'season',
  'partie',
  'part',
  'cour',
  'episode',
  'episodes',
  'arc',
  'remake',
  'avec',
  'sans',
  'filler',
  'fillers',
  'the',
  'des',
  'les',
  'and'
])

const words = (text: string): string[] =>
  deaccent(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)

interface SectionCue {
  num: number | null
  part: number | null
  /** Autre chose que `saison<N>` ou `saison<N>-<k>` : `saison1hs`, `kai`… */
  variant: boolean
  year: number | null
  tokens: string[]
}

function sectionCue(s: SiteSeason): SectionCue {
  const m = s.base.match(/^saison(\d+)(?:-(\d+))?([a-z]*)$/)
  const namedPart = Number(s.name.match(/partie\s*(\d+)/i)?.[1])
  return {
    num: m ? Number(m[1]) : null,
    part: m?.[2] ? Number(m[2]) : namedPart || null,
    variant: !m || !!m[3],
    year: Number(s.name.match(/\b(?:19|20)\d{2}\b/)?.[0]) || null,
    tokens: words(s.name).filter((w) => w.length >= 3 && !GENERIC.has(w) && !/^\d+$/.test(w))
  }
}

const ROMAN: Record<string, number> = { II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8 }

/**
 * Le numéro de saison que le titre écrit lui-même, ou `null`.
 *
 * Pas celui de la chaîne : AniList numérote par rang de sortie, et leur site
 * non — l'arc du Train de l'infini y est le deuxième maillon de Demon Slayer,
 * mais pas leur « Saison 2 ».
 */
export function writtenSeason(raw: string): number | null {
  // « Part 2 », « Cour 2 » : une partie, pas une saison.
  const title = raw.replace(/\s*\b(?:part|cour)\s*\d+.*$/i, '')
  const season = title.match(/\bseason\s+(\d+)/i) ?? title.match(/\b(\d+)(?:st|nd|rd|th)\s+season/i)
  if (season) return Number(season[1])
  const roman = title.match(/\s(II|III|IV|V|VI|VII|VIII)(?=\s*[:(\-–]|\s*$)/)
  if (roman) return ROMAN[roman[1]]
  // « Kaiju No. 8 » : le chiffre appartient au nom.
  if (/(?:\bn(?:o|°|º)\.?|#)\s*\d+\s*$/i.test(title)) return null
  const trailing = title.match(/\s(\d)\s*$/)
  return trailing ? Number(trailing[1]) : null
}

/** La partie d'une saison scindée : « Part 2 », « Cour 2 ». */
export function writtenPart(title: string): number | null {
  const m = title.match(/\b(?:part|cour)\s*(\d+)/i)
  return m ? Number(m[1]) : null
}

interface EntryCue {
  num: number | null
  part: number | null
  year: number | null
  episodes: number | null
  hay: string
}

function entryCues(chain: ChainSeason[]): EntryCue[] {
  const out: EntryCue[] = []
  for (const [i, e] of chain.entries()) {
    const written = e.titles.map(writtenSeason).find((n) => n !== null) ?? null
    const part = e.titles.map(writtenPart).find((n) => n !== null) ?? null
    // Une partie prolonge la saison d'avant ; la première fiche est la saison 1.
    const num = written ?? (part && part > 1 && i > 0 ? out[i - 1].num : i === 0 ? 1 : null)
    out.push({ num, part, year: e.year, episodes: e.episodes, hay: e.titles.map(compact).join(' ') })
  }
  return out
}

/** Ce que les indices disent d'une fiche posée dans une section. */
function pairScore(e: EntryCue, s: SectionCue): number {
  let score = 1
  if (e.num !== null && s.num !== null) score += e.num === s.num ? 3 : -3
  if (s.part !== null) score += (e.part ?? 1) === s.part ? 2 : -2

  // Une variante (`hs`, « Kai »…) ne se prend que si son nom la justifie.
  let vouched = false
  if (s.year !== null) {
    if (e.year === s.year) {
      score += 4
      vouched = true
    } else score -= 3
  }
  if (s.tokens.length) {
    const hits = s.tokens.filter((t) => e.hay.includes(t)).length
    if (hits * 2 >= s.tokens.length) {
      score += 2
      vouched = true
    } else if (s.tokens.length >= 2) score -= 1.5
  }
  if (s.variant && !vouched) score -= 0.5
  return score
}

/**
 * Rejoindre la fiche précédente dans sa section : naturel pour une « Part 2 »,
 * l'exception pour le reste. Sans cette différence, « Alicization » de Sword
 * Art Online rejoignait la saison 2 aussi volontiers qu'il ouvrait la 3.
 */
const merge = (e: EntryCue): number => (e.part && e.part > 1 ? 0.2 : 1.2)

const fits = (count: number, episodes: number): boolean =>
  Math.abs(count - episodes) <= Math.max(2, Math.ceil(episodes * 0.25))

/**
 * Où chaque fiche de la franchise vit chez eux.
 *
 * Les fiches sans section n'apparaissent pas dans la réponse.
 */
export function placeSeasons(sections: SiteSeason[], chain: ChainSeason[]): Map<number, Placement> {
  const cues = sections.map(sectionCue)
  const entries = entryCues(chain)
  const memo = new Map<string, { score: number; picks: number[] }>()

  /** Le menu relevé confirme ou dément ce qu'on a mis dans la section qu'on quitte. */
  const close = (j: number, sum: number | null): number => {
    const count = j >= 0 ? sections[j].count : null
    if (count === null || sum === null || sum === 0) return 0
    return fits(count, sum) ? 2 : -2
  }
  const add = (sum: number | null, episodes: number | null): number | null =>
    sum === null || episodes === null ? null : sum + episodes

  // `last` : la section de la dernière fiche placée ; `sum` : ses épisodes.
  const best = (i: number, last: number, sum: number | null): { score: number; picks: number[] } => {
    if (i === entries.length) return { score: close(last, sum), picks: [] }
    const key = `${i}|${last}|${sum}`
    const known = memo.get(key)
    if (known) return known

    const e = entries[i]
    const skip = best(i + 1, last, sum)
    let result = { score: skip.score, picks: [-1, ...skip.picks] }

    if (last >= 0) {
      const rest = best(i + 1, last, add(sum, e.episodes))
      const score = pairScore(e, cues[last]) - merge(e) + rest.score
      if (score > result.score) result = { score, picks: [last, ...rest.picks] }
    }
    for (let j = last + 1; j < sections.length; j += 1) {
      const rest = best(i + 1, j, e.episodes)
      const score = close(last, sum) + pairScore(e, cues[j]) + rest.score
      if (score > result.score) result = { score, picks: [j, ...rest.picks] }
    }

    memo.set(key, result)
    return result
  }

  const { picks } = best(0, -1, 0)
  const out = new Map<number, Placement>()
  for (const [j, s] of sections.entries()) {
    const inside = picks.flatMap((p, i) => (p === j ? [i] : []))
    let before: number | null = 0
    const span = inside.reduce<number | null>((sum, i) => add(sum, entries[i].episodes), 0)
    for (const i of inside) {
      out.set(chain[i].id, { base: s.base, offset: before, span })
      before = add(before, entries[i].episodes)
    }
  }
  return out
}

/**
 * La fiche vit-elle sous cette série chez eux ?
 *
 * La chaîne d'AniList traverse plusieurs de leurs séries : celle de Dragon
 * Ball mêle DB, Z, GT et Super, rangés à quatre adresses. Leur page donne le
 * nom de la série et ses autres titres (« Kimetsu no Yaiba », « DBS ») : une
 * fiche en est quand l'un de ses titres commence par l'un d'eux.
 */
export function belongs(names: string[], titles: string[]): boolean {
  const heads = names.map(compact).filter((n) => n.length >= 4)
  return titles.map(compact).some((t) => heads.some((h) => t.startsWith(h)))
}
