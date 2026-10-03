/**
 * Titres d'épisodes venus d'Anime News Network.
 *
 * AniList ne titre que les épisodes qu'une plateforme de streaming lui a
 * déclarés : sans elle, la grille n'affiche que « Épisode 12 ». L'encyclopédie
 * d'ANN titre presque tout, sans clé ni compte — mais ses fiches n'ont rien en
 * commun avec celles d'AniList, ni identifiant, ni découpage garanti. Il faut
 * donc retrouver la bonne fiche, et ce module ne fait que ça : lire le XML et
 * choisir. Le réseau et le cache sont dans `main/ann.ts`.
 *
 * **La date de début décide.** Un nom ne suffit pas : « Frieren » renvoie trois
 * saisons au même titre. Le mois de sortie, lui, sépare deux saisons à coup
 * sûr. Sans date, on ne devine pas — aucun titre vaut mieux que ceux d'une
 * autre saison.
 */

import type { MediaFormat } from './types'

export interface AnnEntry {
  id: number
  type: string
  names: string[]
  start: { year: number; month: number | null } | null
  /** Toutes les dates « Vintage » : avant-première, diffusion, rediffusion… */
  starts: { year: number; month: number | null }[]
  /** Nombre d'épisodes annoncé, quand la fiche le dit. */
  count: number | null
  titles: Record<number, string>
}

export interface AnnTarget {
  romaji: string
  english: string | null
  format: MediaFormat | null
  year: number | null
  month: number | null
  episodes: number | null
}

/** Ce que la fenêtre envoie pour demander les titres d'une série. */
export interface AnnRequest extends AnnTarget {
  id: number
  airing: boolean
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

export function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, e: string) => {
    if (e[0] === '#')
      return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
    return ENTITIES[e] ?? whole
  })
}

/** Toutes les fiches d'une réponse de `api.xml`. */
export function parseAnn(xml: string): AnnEntry[] {
  const entries: AnnEntry[] = []
  for (const block of xml.matchAll(/<anime\b([^>]*)>([\s\S]*?)<\/anime>/g)) {
    const attrs = block[1]
    const body = block[2]
    const id = Number(/\bid="(\d+)"/.exec(attrs)?.[1])
    if (!id) continue

    const names = new Set<string>()
    const name = /\bname="([^"]*)"/.exec(attrs)?.[1]
    if (name) names.add(decodeXml(name))
    for (const m of body.matchAll(/<info\b[^>]*type="(?:Main title|Alternative title)"[^>]*>([^<]*)<\/info>/g)) {
      names.add(decodeXml(m[1]).trim())
    }

    // « Vintage » peut être répété : une avant-première en festival précède
    // parfois la diffusion d'un mois ou plus. Toutes les dates sont gardées.
    const starts: AnnEntry['starts'] = []
    for (const m of body.matchAll(/<info\b[^>]*type="Vintage"[^>]*>(\d{4})(?:-(\d{2}))?/g)) {
      starts.push({ year: Number(m[1]), month: m[2] ? Number(m[2]) : null })
    }
    const order = (d: { year: number; month: number | null }): number => d.year * 12 + (d.month ?? 12)
    const start = [...starts].sort((a, b) => order(a) - order(b))[0] ?? null
    // Mais pas les rediffusions à l'étranger, des années plus tard (« Brazil,
    // Funimation ») : elles feraient passer la saison 1 pour une suite sortie
    // ce mois-là. Avant-première et diffusion tiennent en six mois.
    const near = start ? starts.filter((d) => order(d) - order(start) <= 6) : []

    const countText = /<info\b[^>]*type="Number of episodes"[^>]*>(\d+)/.exec(body)?.[1]

    const titles: Record<number, string> = {}
    for (const m of body.matchAll(/<episode\b[^>]*num="(\d+)"[^>]*>([\s\S]*?)<\/episode>/g)) {
      const english = /<title\b[^>]*lang="EN"[^>]*>([^<]*)<\/title>/.exec(m[2])?.[1]
      if (english?.trim()) titles[Number(m[1])] = decodeXml(english).trim()
    }

    entries.push({
      id,
      type: /\btype="([^"]*)"/.exec(attrs)?.[1] ?? '',
      names: [...names],
      start,
      starts: near,
      count: countText ? Number(countText) : null,
      titles
    })
  }
  return entries
}

/** Le type ANN qui correspond à un format AniList. */
const ANN_TYPES: Record<MediaFormat, string[]> = {
  TV: ['TV', 'ONA'],
  TV_SHORT: ['TV', 'ONA'],
  ONA: ['ONA', 'TV'],
  OVA: ['OAV', 'ONA'],
  SPECIAL: ['special', 'OAV', 'TV'],
  MOVIE: ['movie'],
  MUSIC: ['music']
}

const normalize = (s: string): string =>
  s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')

/**
 * La fiche ANN qui est cette série, ou `null` s'il n'y a pas de certitude.
 *
 * Il faut la même année de sortie, et le même mois à un près quand les deux le
 * disent. Entre plusieurs fiches qui passent, le type puis le nombre
 * d'épisodes départagent.
 */
export function pickAnn(entries: AnnEntry[], target: AnnTarget): AnnEntry | null {
  if (target.year === null) return null
  const wanted = target.format ? ANN_TYPES[target.format] : []

  const fits = entries.filter((e) => {
    const dated = e.starts.some(
      (d) =>
        d.year === target.year && (d.month === null || target.month === null || Math.abs(d.month - target.month) <= 1)
    )
    if (!dated) return false
    // Un film ou un clip n'est jamais une série, même sorti le même mois.
    if (wanted.length && !wanted.includes(e.type) && (e.type === 'movie' || e.type === 'music')) return false
    return true
  })
  if (!fits.length) return null

  const names = [target.romaji, target.english].filter((n): n is string => !!n).map(normalize)
  const score = (e: AnnEntry): number => {
    let s = 0
    if (wanted.includes(e.type)) s += 4
    if (e.names.some((n) => names.includes(normalize(n)))) s += 2
    if (target.episodes && e.count === target.episodes) s += 2
    if (target.month !== null && e.starts.some((d) => d.year === target.year && d.month === target.month)) s += 1
    return s
  }
  return [...fits].sort((a, b) => score(b) - score(a))[0]
}

/**
 * Les titres renumérotés comme AniList les compte.
 *
 * Une saison découpée en deux chez AniList peut garder chez ANN la numérotation
 * de la série entière (13 à 24) : quand le décalage est net — numéros suivis,
 * autant que d'épisodes annoncés — on le retire. Sinon on garde tels quels.
 */
export function renumber(titles: Record<number, string>, episodes: number | null): Record<number, string> {
  const nums = Object.keys(titles)
    .map(Number)
    .sort((a, b) => a - b)
  if (!nums.length || nums[0] === 1 || !episodes) return titles
  const shift = nums[0] - 1
  if (nums[nums.length - 1] - shift !== episodes) return titles
  const out: Record<number, string> = {}
  for (const n of nums) out[n - shift] = titles[n]
  return out
}
