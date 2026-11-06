import { app } from 'electron'
import { LANGS, langUrl, pickLang, type Lang } from '@shared/langs'
import {
  chooseSide,
  entriesIn,
  isSideFormat,
  sameKind,
  sectionsFor,
  sectionsIn,
  seasonBases,
  type Entry,
  type Sibling
} from '@shared/as-sections'
import { cachedMedia, cachedParentOf, relationsOf } from './anilist'
import { getMedia, getWatchLang } from './store'
import { existsSync, readFileSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { baseAndSeason, compact, searchTitles, searchVariants, similarity } from '@shared/titles'
import { overrideFor } from '@shared/watch-overrides'

/**
 * Anime-Sama slugs cannot be derived from a title — "Kaiju No. 8" lives at
 * `kaiju-n8`. So the slug is read from the site's own catalogue search, then the
 * season URL is confirmed with a real request before being offered as a direct
 * link. Anything unresolved degrades to the search page, which always works.
 */

export const ORIGIN = 'https://anime-sama.to'
const TTL = 30 * 24 * 3600_000
const MIN_SIMILARITY = 0.62

export interface WatchTarget {
  url: string
  direct: boolean
  /** Hand-checked as not present on the site — don't offer a pointless search. */
  absent?: boolean
  /**
   * L'adresse porte la liste des épisodes, et pas seulement la fiche de la
   * série. Seules ces pages-là ont un menu à positionner.
   */
  episodes?: boolean
  /**
   * Les langues trouvées sur cette saison, dans l'ordre du site.
   *
   * Vide ou à un seul élément, il n'y a rien à choisir. À deux, la fiche
   * propose les pastilles VO et VF que leur page affiche.
   */
  languages?: Lang[]
  /** Celle que `url` ouvre : le choix retenu, ou la première proposée. */
  language?: Lang
  /**
   * L'entrée nommée à viser dans le menu, pour un film ou un OAV.
   *
   * Plusieurs spéciaux partagent une même page — la section OAV de Kaiju No. 8
   * en porte trois —, et leur menu ne les numérote pas : c'est par le nom
   * qu'on retrouve le bon. Voir `@shared/as-sections`.
   */
  entry?: Entry
  /** Un film ou un OAV, dans sa section : sans `entry`, rien n'y est visé. */
  side?: boolean
}

interface Row extends WatchTarget {
  at: number
  /**
   * Version de la règle qui a produit cette réponse. Jusqu'à la 2, on s'arrêtait
   * au hub de la série — `/catalogue/<slug>/` — qui répond 200 sans contenir le
   * moindre épisode ; jusqu'à la 3, une saison inexistante suffisait pourvu
   * qu'elle réponde 200. Les réponses d'avant doivent être refaites, pas
   * attendues trente jours.
   */
  v?: number
}

// 4 : les langues d'une saison sont désormais toutes relevées, pas seulement
// la première trouvée. Les entrées d'avant n'en portent aucune.
// 5 : films, OVA et spéciaux ont leur section — ils ouvraient la saison 1.
// 6 : un film titré autrement chez eux se retrouve par sa place de sortie.
// 7 : alignement autour des films reconnus par leur nom — Shippuden décalait.
// 8 : les crossovers (lien « Personnage ») ne comptent plus parmi les films.
// 9 : un lien « Alternative » donne la série mère à défaut d'autre — les films
//     de Dragon Ball n'en avaient aucune.
// 10 : `episodes.js` répond 403 depuis la refonte du site — chaque série
//      résolue depuis tombait sur sa fiche, sans menu ni épisode à viser.
// 11 : un remake ouvre sa variante datée (« Saison 1 Remake 2026 »), pas
//      l'original.
const RULE_VERSION = 11

let cache = new Map<number, Row>()
let file = ''
let timer: NodeJS.Timeout | null = null

export function initAnimeSama(): void {
  file = join(app.getPath('userData'), 'anime-sama-cache.json')
  if (!existsSync(file)) return
  try {
    cache = new Map(JSON.parse(readFileSync(file, 'utf8')) as [number, Row][])
  } catch {
    cache = new Map()
  }
}

function persist(): void {
  if (timer) return
  timer = setTimeout(() => {
    timer = null
    fs.writeFile(file, JSON.stringify([...cache.entries()]), 'utf8').catch(() => {})
  }, 3000)
}

export function searchUrl(term: string): string {
  return `${ORIGIN}/catalogue/?search=${encodeURIComponent(term)}`
}

async function text(url: string): Promise<{ status: number; body: string }> {
  const res = await fetch(url, { redirect: 'follow' })
  return { status: res.status, body: res.status === 200 ? await res.text() : '' }
}

/**
 * Les langues qu'une page de section déclare : `var languesDispo = ["vostfr","vf"]`.
 *
 * Depuis leur refonte de novembre 2026, `episodes.js` répond 403 à toute
 * requête qui ne vient pas d'un navigateur : on ne peut plus y vérifier les
 * lecteurs. La page de la section, elle, répond, et dit ses langues.
 *
 * Elle ne prouve pas que la section existe — la saison 9 de Naruto, qu'ils
 * n'ont pas, répond 200 avec ses deux langues. C'est la page de la série qui
 * tranche : voir `declaredSections`.
 */
export function languagesIn(body: string): Lang[] {
  const raw = body.match(/var\s+languesDispo\s*=\s*(\[[^\]]*\])/)?.[1]
  if (!raw) return []
  try {
    const list: unknown = JSON.parse(raw)
    return Array.isArray(list) ? LANGS.filter((l) => list.includes(l)) : []
  } catch {
    return []
  }
}

/** Catalogue links appear in the search page markup as /catalogue/<slug>/. */
function slugsIn(html: string): string[] {
  const found = new Set<string>()
  for (const m of html.matchAll(/href="(?:https?:\/\/anime-sama\.to)?\/catalogue\/([a-z0-9-]+)\/?"/gi)) {
    found.add(m[1])
  }
  return [...found]
}

/**
 * Scored against every title variant, not just the long form: the site files
 * "Demon Slayer: Kimetsu no Yaiba" under `demon-slayer`, and comparing the full
 * title to that slug scores 0.44 — below threshold, so the right answer loses.
 */
function bestSlug(slugs: string[], variants: string[]): string | null {
  const needles = variants.map(compact).filter(Boolean)
  let best: { slug: string; score: number } | null = null
  for (const slug of slugs) {
    const candidate = compact(slug)
    for (const needle of needles) {
      const score = similarity(needle, candidate)
      if (!best || score > best.score) best = { slug, score }
    }
  }
  return best && best.score >= MIN_SIMILARITY ? best.slug : null
}

/**
 * Applique la langue retenue pour cette série.
 *
 * Fait au retour et non dans le cache : le cache décrit ce que le site propose,
 * la bibliothèque ce qu'on a choisi. Mêler les deux ferait dépendre une donnée
 * partagée d'une préférence personnelle, et changer d'avis obligerait à
 * resonder le site.
 */
function withChoice(animeId: number, target: WatchTarget): WatchTarget {
  const available = target.languages ?? []
  if (available.length === 0) return target

  const language = pickLang(available, getWatchLang(animeId))
  if (!language) return target
  return { ...target, language, url: langUrl(target.url, language) }
}

/**
 * L'entrée à viser pour cette série, si l'adresse ouverte est bien la sienne.
 *
 * Lue dans le cache plutôt que transportée par la fenêtre : la fiche, la
 * soirée et la télécommande ouvrent toutes par l'adresse et le numéro, et
 * aucune n'a à savoir qu'un spécial se vise par son nom.
 */
export function entryFor(animeId: number, url: string): Entry | null {
  return rowFor(animeId, url)?.entry ?? null
}

/** La réponse gardée pour cette série, si elle concerne bien cette adresse. */
function rowFor(animeId: number, url: string): Row | null {
  const hit = cache.get(animeId)
  if (!hit || hit.v !== RULE_VERSION) return null
  const bare = (u: string): string => u.replace(/\/(?:vostfr|vf)\/$/, '/')
  return bare(hit.url) === bare(url) ? hit : null
}

/**
 * Ce qu'il faut viser en ouvrant cette adresse : un numéro, une entrée, ou rien.
 *
 * Un film qu'on n'a pas su situer dans sa section ne doit pas recevoir le
 * numéro 1 pour autant : leur page retomberait sur le premier film, et trois
 * fiches ouvraient le même. Sans rien viser, leur page garde le dernier choix
 * et laisse choisir dans son menu.
 */
export function aimFor(
  animeId: number,
  url: string,
  episode: number | null
): { episode: number | null; entry: Entry | null } {
  const row = rowFor(animeId, url)
  if (row?.entry) return { episode, entry: row.entry }
  if (row?.side) return { episode: null, entry: null }
  return { episode, entry: null }
}

/** Le format, de la bibliothèque d'abord, de la fiche gardée sinon. */
const formatOf = (animeId: number): string | null => getMedia(animeId)?.format ?? cachedMedia(animeId)?.format ?? null

/** Le slug d'une adresse du catalogue : `naruto` dans `/catalogue/naruto/film/vostfr/`. */
export function slugOf(url: string): string | null {
  return url.match(/\/catalogue\/([a-z0-9-]+)\//i)?.[1] ?? null
}

/**
 * Le slug que l'app a déjà trouvé pour une série, sans rien demander au site.
 *
 * Sert au suivi du navigateur : le stockage d'Anime-Sama est rangé par slug,
 * et le leur ne se déduit pas toujours du titre.
 */
export function knownSlug(animeId: number): string | null {
  const override = overrideFor(animeId)
  const url = override && 'animeSama' in override ? override.animeSama : cache.get(animeId)?.url
  return url ? slugOf(url) : null
}

/**
 * Où l'app a déjà situé un film ou un OAV chez Anime-Sama : l'adresse de la
 * section et l'entrée visée, sans rien demander au site. `null` tant qu'elle
 * ne l'a pas résolu, ou avec une règle d'avant.
 */
export function cachedSideTarget(animeId: number): { url: string; entry: Entry } | null {
  const hit = cache.get(animeId)
  if (!hit || hit.v !== RULE_VERSION || !hit.entry) return null
  return { url: hit.url, entry: hit.entry }
}

/**
 * La série qui porte un film ou un OAV.
 *
 * Celle vers laquelle pointe un lien PARENT — sinon une préquelle ou une suite
 * diffusée en saison. Passe par le cache des fiches : rien n'est demandé quand
 * elles sont là, et l'API AniList coupée ne fait que retirer ce repli.
 */
async function carrierOf(animeId: number): Promise<number | null> {
  const own = await relationsOf(animeId).catch(() => [])
  const seasonal = (f: string | null): boolean => f === 'TV' || f === 'TV_SHORT' || f === 'ONA'
  return (
    own.find((e) => e.relationType === 'PARENT' && seasonal(e.format))?.id ??
    own.find((e) => ['PREQUEL', 'SEQUEL', 'SIDE_STORY'].includes(e.relationType) && seasonal(e.format))?.id ??
    // Les films de Dragon Ball ne sont liés à la série que par « Alternative » :
    // ils en racontent un arc autrement. Sans ce repli, aucun n'avait de série
    // mère, donc aucun alignement, et aucun n'était visé dans leur menu.
    own.find((e) => e.relationType === 'ALTERNATIVE' && seasonal(e.format))?.id ??
    // Sans fiche à lui — l'API coupée ne la ramènera pas —, une saison gardée
    // qui le cite suffit : celle de Naruto cite ses trois films.
    cachedParentOf(animeId)
  )
}

/**
 * Le slug d'un film ou d'un OAV, pris sur la série qui le porte.
 *
 * Leur recherche ne trouve rien pour « Naruto the Movie Legend of the Stone of
 * Gelel » — le titre est trop long, et même trouvé, `naruto` ne lui ressemble
 * pas assez. La série, elle, se résout sans peine, et ses films vivent sous le
 * même slug.
 */
async function carrierSlug(animeId: number): Promise<string | null> {
  const carrier = await carrierOf(animeId)
  if (carrier === null) return null
  const title = getMedia(carrier)?.title ?? cachedMedia(carrier)?.title
  if (!title) return null
  // La série porteuse est une saison : elle ne repasse jamais par ici.
  const target = await resolve(carrier, searchTitles(title)).catch(() => null)
  return target?.direct ? slugOf(target.url) : null
}

/**
 * Les films (ou OAV) de la série qui porte celui-ci, avec leurs titres.
 *
 * Les titres servent de repères pour aligner les deux listes : le romaji des
 * liens, et l'anglais quand la fiche de ce film est gardée.
 *
 * Un lien « Personnage » n'en fait pas partie : c'est un crossover, qui
 * partage des personnages sans être un film de la série. Dragon Ball en a un
 * — « Dr. Slump: Arale-chan » — et ce cinquième film, absent de leur menu de
 * quatre, empêchait tout alignement : aucun film n'était visé.
 */
async function releaseSiblings(animeId: number, format: string): Promise<Sibling[] | null> {
  const parent = await carrierOf(animeId)
  if (parent === null) return null

  const siblings = (await relationsOf(parent).catch(() => []))
    .filter((e) => e.relationType !== 'SUMMARY' && e.relationType !== 'CHARACTER' && sameKind(format, e.format))
    .map((e) => {
      const known = cachedMedia(e.id)?.title
      const titles = [e.title, known?.english, known?.romaji].filter((t): t is string => !!t)
      return { id: e.id, date: e.date ?? null, titles: [...new Set(titles)] }
    })
  return siblings.some((s) => s.id === animeId) ? siblings : null
}

/**
 * La page d'une section et ses langues, ou `null` si elle n'en a aucune.
 *
 * Lue en VOSTFR d'abord, en VF ensuite : une section sans VOSTFR répond 404
 * sous `vostfr/`. La langue lue doit figurer parmi celles que la page annonce,
 * faute de quoi ce n'est pas la sienne.
 */
async function sectionPage(slug: string, base: string): Promise<{ body: string; langs: Lang[] } | null> {
  for (const lang of LANGS) {
    let page: { status: number; body: string }
    try {
      page = await text(`${ORIGIN}/catalogue/${slug}/${base}/${lang}/`)
    } catch {
      // Réseau muet : inutile d'insister sur les langues suivantes.
      return null
    }
    if (page.status !== 200) continue
    const langs = languagesIn(page.body)
    if (langs.includes(lang)) return { body: page.body, langs }
  }
  return null
}

/**
 * La section d'un film ou d'un OAV, ou `null` si la série n'en déclare pas.
 *
 * Coûte, pour chaque section candidate, sa page — une seule fois, le résultat
 * est mis en cache.
 */
async function sideTarget(
  slug: string,
  hub: string,
  format: string,
  titles: string[],
  animeId: number
): Promise<WatchTarget | null> {
  const found: { base: string; name: string; names: string[]; langs: Lang[] }[] = []
  for (const section of sectionsFor(sectionsIn(hub), format).slice(0, 6)) {
    const page = await sectionPage(slug, section.base)
    if (page) found.push({ ...section, names: entriesIn(page.body), langs: page.langs })
  }

  const choice = chooseSide(found, titles, await releaseSiblings(animeId, format), animeId)
  const picked = choice && found.find((f) => f.base === choice.base)
  if (!choice || !picked) return null

  return {
    url: `${ORIGIN}/catalogue/${slug}/${picked.base}/${picked.langs[0]}/`,
    direct: true,
    episodes: true,
    languages: picked.langs,
    language: picked.langs[0],
    side: true,
    ...(choice.entry ? { entry: choice.entry } : {})
  }
}

export async function resolve(animeId: number, titles: string[]): Promise<WatchTarget> {
  // A hand-checked answer always wins, and costs no request.
  const override = overrideFor(animeId)
  if (override && 'animeSama' in override) {
    return override.animeSama ? { url: override.animeSama, direct: true } : { url: '', direct: false, absent: true }
  }

  const hit = cache.get(animeId)
  if (hit && hit.v === RULE_VERSION && Date.now() - hit.at < TTL) {
    return withChoice(animeId, {
      url: hit.url,
      direct: hit.direct,
      episodes: hit.episodes,
      languages: hit.languages,
      ...(hit.side ? { side: true } : {}),
      ...(hit.entry ? { entry: hit.entry } : {})
    })
  }

  const primary = titles[0] ?? ''
  const { base, season } = baseAndSeason(primary)
  const fallback: WatchTarget = { url: searchUrl(searchVariants(base)[0] ?? primary), direct: false }

  const queries: string[] = []
  for (const title of titles) {
    for (const variant of searchVariants(baseAndSeason(title).base)) {
      if (!queries.includes(variant)) queries.push(variant)
    }
  }

  const format = formatOf(animeId)
  let slug: string | null = isSideFormat(format) ? await carrierSlug(animeId) : null
  for (const query of slug ? [] : queries.slice(0, 3)) {
    let page: { status: number; body: string }
    try {
      page = await text(searchUrl(query))
    } catch {
      return fallback
    }
    if (page.status !== 200) continue
    slug = bestSlug(slugsIn(page.body), queries)
    if (slug) break
  }

  if (!slug) {
    cache.set(animeId, { ...fallback, at: Date.now() })
    persist()
    return fallback
  }

  /**
   * La page de la série déclare ses sections — `panneauAnime("Saison 1",
   * "saison1/vostfr")` —, celles qu'elle ne montre pas restant en commentaire.
   * C'est la seule preuve qu'une saison existe depuis que `episodes.js` nous
   * est fermé : voir `languagesIn`.
   */
  let hub: { status: number; body: string } | null = null
  try {
    hub = await text(`${ORIGIN}/catalogue/${slug}/`)
  } catch {
    // Réseau muet : on retombe sur la recherche, comme partout ailleurs.
  }
  const declared = hub?.status === 200 ? sectionsIn(hub.body) : []

  /**
   * Un film ou un OAV n'est jamais sous `saison<N>/` : chercher là ouvrait la
   * saison 1 de la série. Sans section à lui, il retombe sur la page de la
   * série plutôt que sur une saison qui n'est pas la sienne.
   */
  if (isSideFormat(format) && hub?.status === 200) {
    const side = await sideTarget(slug, hub.body, format as string, titles, animeId)
    if (side) {
      cache.set(animeId, { ...side, at: Date.now(), v: RULE_VERSION })
      persist()
      return withChoice(animeId, side)
    }
  }

  /**
   * Les épisodes vivent sous `saison<N>/<langue>/`, jamais au-dessus : le hub
   * `/catalogue/<slug>/` et la saison nue répondent 200 tous les deux, sans
   * contenir un seul épisode. Un simple code 200 ne prouvait donc rien — d'où
   * des liens qui tombaient sur la fiche de la série.
   *
   * Une saison inexistante répond 200 elle aussi : c'est ainsi que « Kaiju
   * No. 8 » ouvrait une huitième saison vide. Seule compte donc une saison que
   * la série déclare.
   *
   * Saison 0 veut dire que le titre n'a pas donné de numéro exploitable
   * (« Final Season ») : on tente la première saison, qui est le cas de très
   * loin le plus courant.
   */
  const seasons = isSideFormat(format) ? [] : season > 0 ? [...new Set([season, 1])] : [1]

  /**
   * Toutes les langues d'une saison, et non la première qui répond : sa page
   * les annonce toutes, VF comprise — longtemps introuvable dès que la VO
   * existait.
   */
  const year = getMedia(animeId)?.startDate?.year
  for (const base of seasons.flatMap((n) => seasonBases(declared, n, year))) {
    const page = await sectionPage(slug, base)
    if (!page) continue

    const target: WatchTarget = {
      url: `${ORIGIN}/catalogue/${slug}/${base}/${page.langs[0]}/`,
      direct: true,
      episodes: true,
      languages: page.langs,
      language: page.langs[0]
    }
    cache.set(animeId, { ...target, at: Date.now(), v: RULE_VERSION })
    persist()
    return withChoice(animeId, target)
  }

  // Aucune page d'épisodes trouvée : la fiche de la série reste utile, mais
  // elle n'a pas de menu, et il ne faut pas laisser croire le contraire.
  if (hub?.status === 200) {
    const target: WatchTarget = { url: `${ORIGIN}/catalogue/${slug}/`, direct: true, episodes: false }
    cache.set(animeId, { ...target, at: Date.now(), v: RULE_VERSION })
    persist()
    return target
  }

  cache.set(animeId, { ...fallback, at: Date.now(), v: RULE_VERSION })
  persist()
  return fallback
}
