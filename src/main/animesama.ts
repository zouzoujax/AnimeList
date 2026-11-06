import { app } from 'electron'
import { LANGS, langUrl, pickLang, type Lang } from '@shared/langs'
import {
  chooseSide,
  entriesIn,
  isSideFormat,
  sameKind,
  sectionsFor,
  namesIn,
  sectionsIn,
  seasonBases,
  type Entry,
  type Sibling
} from '@shared/as-sections'
import { belongs, isSeasonal, placeSeasons, type Placement } from '@shared/as-match'
import { cachedMedia, cachedParentOf, relationsOf, seasonChain } from './anilist'
import { getMedia, getWatchLang } from './store'
import { existsSync, readFileSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { baseAndSeason, compact, searchTitles, searchVariants, similarity } from '@shared/titles'
import { overrideFor } from '@shared/watch-overrides'
import { judgeMenu, type Expected, type MenuVerdict } from '@shared/as-menu'

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
  /**
   * Le menu vu dans la fenêtre de lecture ne ressemblait pas à la fiche : la
   * réponse est refaite au prochain passage plutôt que gardée trente jours.
   */
  doubt?: boolean
  /**
   * Épisodes des fiches qui précèdent celle-ci dans la même section : chez
   * eux, la deuxième moitié de la saison 1 de Mushoku Tensei commence à
   * l'épisode 12 de `saison1`. Voir `@shared/as-match`.
   */
  offset?: number
  /** Épisodes de toutes les fiches de la section, pour juger leur menu. */
  span?: number
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
// 12 : la même chose pour une série hors de la bibliothèque, dont la 11
//      ignorait l'année.
// 13 : les saisons sont reliées à toute la franchise d'un bloc — l'arc du
//      Train de l'infini, les deux parties de la saison 2 de Mushoku Tensei.
const RULE_VERSION = 13

let cache = new Map<number, Row>()
let file = ''
let timer: NodeJS.Timeout | null = null

/**
 * Le nombre d'épisodes de leur menu, section par section (`naruto/saison1`).
 *
 * Seule la fenêtre de lecture le voit : leur liste est fermée à l'app hors
 * d'un navigateur. Gardé à part des réponses, parce qu'il décrit leur site et
 * non une fiche : plusieurs fiches peuvent partager une section.
 */
let menus = new Map<string, { count: number; at: number }>()
let menusFile = ''

export function initAnimeSama(): void {
  file = join(app.getPath('userData'), 'anime-sama-cache.json')
  menusFile = join(app.getPath('userData'), 'anime-sama-menus.json')
  const read = <T>(path: string): T[] => {
    if (!existsSync(path)) return []
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as T[]
    } catch {
      return []
    }
  }
  cache = new Map(read<[number, Row]>(file))
  menus = new Map(read<[string, { count: number; at: number }]>(menusFile))
}

function persist(): void {
  if (timer) return
  timer = setTimeout(() => {
    timer = null
    fs.writeFile(file, JSON.stringify([...cache.entries()]), 'utf8').catch(() => {})
    fs.writeFile(menusFile, JSON.stringify([...menus.entries()]), 'utf8').catch(() => {})
  }, 3000)
}

/** La section d'une adresse : `naruto/saison1` dans `/catalogue/naruto/saison1/vostfr/`. */
export function sectionKey(url: string): string | null {
  const m = url.match(/\/catalogue\/([a-z0-9-]+)\/([a-z0-9-]+)\/(?:vostfr|vf)\/?$/i)
  return m ? `${m[1]}/${m[2]}` : null
}

/**
 * Ce qu'AniList annonce d'une fiche, de la bibliothèque d'abord, du cache sinon.
 *
 * Une section partagée — deux cours dans `saison1` — se juge sur toutes ses
 * fiches : la première seule y paraîtrait deux fois trop courte.
 */
function expectedOf(animeId: number, row: Row): Expected {
  const known = getMedia(animeId)
  const cached = cachedMedia(animeId)
  const total = known?.episodes ?? cached?.episodes ?? null
  const next = known ? (known.nextAiring?.episode ?? null) : (cached?.nextEpisode ?? null)
  const aired = next ? next - 1 : total
  if (row.span === undefined) return { total, aired }
  return { total: row.span, aired: next ? (row.offset ?? 0) + (aired ?? 0) : row.span }
}

/**
 * Le menu relevé dans la fenêtre de lecture, jugé contre la fiche ouverte.
 *
 * Le relevé est gardé quoi qu'il arrive : il dit combien d'épisodes compte
 * cette section chez eux. Un menu qui ne ressemble pas à la fiche rend la
 * réponse douteuse, refaite au prochain passage. Films et OAV n'en sont pas
 * jugés : leur section en porte plusieurs, et c'est le nom qui les vise.
 */
export function menuCheck(animeId: number | null, url: string, found: number): MenuVerdict {
  const section = sectionKey(url)
  if (section && found > 0) {
    menus.set(section, { count: found, at: Date.now() })
    persist()
  }
  if (animeId === null) return { kind: 'ok' }

  const row = rowFor(animeId, url)
  if (!row || row.side || row.episodes === false) return { kind: 'ok' }

  const verdict = judgeMenu(found, expectedOf(animeId, row))
  if (verdict.kind !== 'ok') {
    cache.set(animeId, { ...row, doubt: true })
    persist()
  }
  return verdict
}

export function searchUrl(term: string): string {
  return `${ORIGIN}/catalogue/?search=${encodeURIComponent(term)}`
}

async function text(url: string, signal?: AbortSignal): Promise<{ status: number; body: string }> {
  const res = await fetch(url, { redirect: 'follow', signal })
  return { status: res.status, body: res.status === 200 ? await res.text() : '' }
}

/**
 * Les signes qu'Anime-Sama a changé son site.
 *
 * Leur refonte de novembre 2026 n'a rien cassé de visible : chaque série
 * retombait en silence sur sa page, et un clic sur un épisode ouvrait le
 * navigateur au lieu du lecteur. Rien ne disait pourquoi. Deux signes le
 * disent désormais, une fois par lancement :
 *
 * - `structure` : une page répond, mais ce qu'on y lit n'y est plus — la
 *   liste des sections d'une série, les langues d'une saison.
 * - `repeated` : plusieurs séries de suite trouvées dans leur catalogue, sans
 *   qu'aucune saison n'y soit reconnue. Une seule ne dit rien : une saison pas
 *   encore mise en ligne fait pareil.
 */
export type SiteTrouble = 'structure' | 'repeated'

const REPEATED_ALERT = 3
let troubleListener: ((kind: SiteTrouble) => void) | null = null
let troubleSaid = false
let missedInARow = 0

export function onSiteTrouble(listener: (kind: SiteTrouble) => void): void {
  troubleListener = listener
}

function trouble(kind: SiteTrouble): void {
  if (troubleSaid) return
  troubleSaid = true
  troubleListener?.(kind)
}

/** Une série trouvée chez eux vient d'être résolue, sur une saison ou non. */
function settled(reached: boolean): void {
  missedInARow = reached ? 0 : missedInARow + 1
  if (missedInARow >= REPEATED_ALERT) trouble('repeated')
}

/** La série témoin du diagnostic : une recherche, sa page, sa première saison. */
const WITNESS = { search: 'Kaiju No. 8', slug: 'kaiju-n8', base: 'saison1' }

export interface SiteCheck {
  /** Le premier code qui n'est pas 200 ; 0 quand le site ne répond pas. */
  status: number
  ms: number
  /** Ce qui ne se lit plus sur leurs pages, ou `null` quand tout se lit. */
  broken: 'search' | 'sections' | 'languages' | null
}

/**
 * Ce qu'il faut à l'app pour relier une série, vérifié sur une série témoin.
 *
 * Trois pages, dans l'ordre où le résolveur les lit : la recherche doit donner
 * son slug, sa page déclarer sa saison, la saison annoncer ses langues. Sert
 * au panneau secret et au test `npm run check:anime-sama`.
 */
export async function siteCheck(timeoutMs = 8000): Promise<SiteCheck> {
  const started = Date.now()
  const steps: [SiteCheck['broken'] & string, string, (body: string) => boolean][] = [
    ['search', searchUrl(WITNESS.search), (body) => slugsIn(body).includes(WITNESS.slug)],
    [
      'sections',
      `${ORIGIN}/catalogue/${WITNESS.slug}/`,
      (body) => sectionsIn(body).some((s) => s.base === WITNESS.base)
    ],
    ['languages', `${ORIGIN}/catalogue/${WITNESS.slug}/${WITNESS.base}/vostfr/`, (body) => languagesIn(body).length > 0]
  ]
  for (const [step, url, readable] of steps) {
    let page: { status: number; body: string }
    try {
      page = await text(url, AbortSignal.timeout(timeoutMs))
    } catch {
      return { status: 0, ms: Date.now() - started, broken: null }
    }
    if (page.status !== 200) return { status: page.status, ms: Date.now() - started, broken: null }
    if (!readable(page.body)) return { status: 200, ms: Date.now() - started, broken: step }
  }
  return { status: 200, ms: Date.now() - started, broken: null }
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
 * tranche : voir `resolve`.
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
  // Le second cour d'une saison partagée : son épisode 1 est leur douzième.
  if (episode !== null && row?.offset) return { episode: episode + row.offset, entry: null }
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
  // Le lien du film porte le titre de sa série : sans lui, une série mère
  // jamais ouverte — ni dans la bibliothèque, ni en cache — laissait le
  // premier film de Naruto sur une simple recherche.
  const linked = (await relationsOf(animeId).catch(() => [])).find((e) => e.id === carrier)?.title
  const title =
    getMedia(carrier)?.title ?? cachedMedia(carrier)?.title ?? (linked ? { romaji: linked, english: null } : null)
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
    if (langs.length === 0) trouble('structure')
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

/**
 * La section de cette fiche, d'après toute sa franchise. `null` sans chaîne
 * AniList, ou quand la liaison ne lui trouve aucune section.
 *
 * Ne garde de la chaîne que les fiches de cette série chez eux — celle de
 * Dragon Ball mêle DB, Z, GT et Super, rangés à quatre adresses —, et prend
 * le nombre d'épisodes des sections que la fenêtre de lecture a déjà vues.
 */
async function chainPlacement(
  animeId: number,
  slug: string,
  hub: string,
  declared: { base: string; name: string }[]
): Promise<Placement | null> {
  const chain = await seasonChain(animeId).catch(() => [])
  if (!chain.some((e) => e.id === animeId)) return null

  const names = [...namesIn(hub), slug.replace(/-/g, ' ')]
  const titlesOf = (e: (typeof chain)[number]): string[] => [e.title, e.english ?? ''].filter(Boolean)
  const group = chain.filter((e) => e.id === animeId || belongs(names, titlesOf(e)))
  const sections = declared
    .filter((s) => isSeasonal(s.base))
    .map((s) => ({ ...s, count: menus.get(`${slug}/${s.base}`)?.count ?? null }))

  const placed = placeSeasons(
    sections,
    group.map((e) => ({ id: e.id, titles: titlesOf(e), year: e.year, episodes: e.episodes }))
  )
  return placed.get(animeId) ?? null
}

/**
 * `year` vient de la fiche ouverte : une série qu'on consulte sans l'avoir
 * ajoutée n'est pas dans la bibliothèque, et sans son année un remake
 * retombait sur l'original. Voir `seasonBases`.
 */
export async function resolve(animeId: number, titles: string[], year?: number | null): Promise<WatchTarget> {
  // A hand-checked answer always wins, and costs no request.
  const override = overrideFor(animeId)
  if (override && 'animeSama' in override) {
    return override.animeSama ? { url: override.animeSama, direct: true } : { url: '', direct: false, absent: true }
  }

  const hit = cache.get(animeId)
  if (hit && hit.v === RULE_VERSION && !hit.doubt && Date.now() - hit.at < TTL) {
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
  if (hub?.status === 200 && declared.length === 0) trouble('structure')

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
      settled(true)
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
   * La section que la liaison à la franchise désigne passe d'abord : voir
   * `@shared/as-match`. Les règles d'avant — le numéro écrit dans le titre,
   * l'année d'un remake — restent derrière, pour quand AniList ne donne pas
   * la chaîne.
   */
  const placed =
    !isSideFormat(format) && hub?.status === 200 ? await chainPlacement(animeId, slug, hub.body, declared) : null
  const released = year ?? getMedia(animeId)?.startDate?.year
  const candidates = [
    ...(placed ? [placed.base] : []),
    ...seasons.flatMap((n) => seasonBases(declared, n, released))
  ].filter((base, i, all) => all.indexOf(base) === i)

  /**
   * Toutes les langues d'une saison, et non la première qui répond : sa page
   * les annonce toutes, VF comprise — longtemps introuvable dès que la VO
   * existait.
   */
  for (const base of candidates) {
    const page = await sectionPage(slug, base)
    if (!page) continue

    const target: WatchTarget = {
      url: `${ORIGIN}/catalogue/${slug}/${base}/${page.langs[0]}/`,
      direct: true,
      episodes: true,
      languages: page.langs,
      language: page.langs[0]
    }
    const shared =
      placed?.base === base
        ? { ...(placed.offset ? { offset: placed.offset } : {}), ...(placed.span ? { span: placed.span } : {}) }
        : {}
    cache.set(animeId, { ...target, ...shared, at: Date.now(), v: RULE_VERSION })
    persist()
    settled(true)
    return withChoice(animeId, target)
  }

  // Aucune page d'épisodes trouvée : la fiche de la série reste utile, mais
  // elle n'a pas de menu, et il ne faut pas laisser croire le contraire.
  if (hub?.status === 200) {
    const target: WatchTarget = { url: `${ORIGIN}/catalogue/${slug}/`, direct: true, episodes: false }
    cache.set(animeId, { ...target, at: Date.now(), v: RULE_VERSION })
    persist()
    settled(false)
    return target
  }

  cache.set(animeId, { ...fallback, at: Date.now(), v: RULE_VERSION })
  persist()
  return fallback
}
