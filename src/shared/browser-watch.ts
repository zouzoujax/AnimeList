/**
 * Ce qu'on regarde dans le navigateur, lu depuis Windows.
 *
 * Windows tient la liste de tout ce qui joue du son — l'encart qui apparaît
 * quand on monte le volume. Chrome, Edge, Opera et Firefox y inscrivent leurs
 * vidéos avec un titre, une position et une durée. Ce module ne lit rien
 * lui-même : il reçoit ces relevés et en tire la série, la saison et
 * l'épisode. Voir `src/main/browser-watch.ts` pour la lecture.
 *
 * Les formats ont été relevés sur les vrais sites, dans Chrome et Firefox, le
 * 30 septembre 2026 :
 *
 * - ADN : `Doomed Megalopolis - 1 OAV 1 : La Cité du démon - streaming - VOSTFR - ADN`
 * - FrAnime : `Chainsmoker Cat S1 EP1 VOSTFR - FRAnime.fr #1 DE L'ANIME SANS PUB ET GRATUIT`
 *   (« #1 » est leur slogan ; `EP1` est celui de la première page ouverte et
 *   ne suit pas les changements d'épisode — l'épisode se lit dans l'adresse)
 * - Anime-Sama : `Tomb Raider King - Saison 1 | Anime-Sama - Streaming et catalogage…`,
 *   sans épisode — il est lu ailleurs, dans le stockage du navigateur
 * - Crunchyroll : jamais vu, faute d'abonnement. Reconnu, jamais coché.
 */

import { baseAndSeason, compact, similarity } from './titles'
import type { Media } from './types'

export type BrowserSite = 'adn' | 'franime' | 'anime-sama' | 'crunchyroll'

export const SITE_LABELS: Record<BrowserSite, string> = {
  adn: 'ADN',
  franime: 'FrAnime',
  'anime-sama': 'Anime-Sama',
  crunchyroll: 'Crunchyroll'
}

/**
 * Un épisode coché depuis le navigateur, en attente d'être montré.
 *
 * La coche est déjà écrite : la revue ne fait que la confirmer ou la défaire,
 * pour qu'une coche automatique ne passe jamais inaperçue.
 */
export interface BrowserTick {
  animeId: number
  episode: number
  /** `ADN`, `FrAnime`, `Anime-Sama`. */
  site: string
  /** Millisecondes Unix. */
  at: number
}

/**
 * Une série regardée qui n'est pas dans la bibliothèque, retrouvée sur AniList.
 *
 * Rien n'est ajouté sans accord : c'est la revue qui propose de l'ajouter et
 * de cocher l'épisode.
 */
export interface BrowserFind {
  media: Media
  episode: number
  site: string
  at: number
}

/** Ce que la revue montre au retour dans l'app. */
export interface BrowserReviewBatch {
  ticks: BrowserTick[]
  finds: BrowserFind[]
}

/** Ce qu'un titre de lecture dit, une fois démonté. */
export interface Seen {
  site: BrowserSite
  /** Le nom de la série, sans saison ni épisode. */
  title: string
  /** `null` quand le titre n'en dit rien : la saison 1 par défaut, au rapprochement. */
  season: number | null
  /** `null` quand le site ne le dit pas dans le titre. */
  episode: number | null
  /**
   * Chez Anime-Sama, la section des films ou des OAV plutôt qu'une saison :
   * l'entrée regardée se lit alors dans le stockage du navigateur, par son nom.
   */
  section?: SideSection
}

/** Les sections d'Anime-Sama qui ne sont pas des saisons. */
export type SideSection = 'film' | 'oav'

/** « Saison 2 », « Season 2 » ou « S2 » en fin de nom. */
const SEASON_TAIL = /\s+(?:saison|season|s)\s*(\d+)\s*$/i

function splitSeason(name: string): { title: string; season: number | null } {
  const m = SEASON_TAIL.exec(name)
  if (!m || m.index === undefined) return { title: name.trim(), season: null }
  return { title: name.slice(0, m.index).trim(), season: Number(m[1]) }
}

const ADN = /^(.+?) - (\d+)(?=\s|$).*- streaming - [^-]+ - ADN\s*$/i
const FRANIME = /^(.+?)\s+S(\d+)(?:\s+EP\d+)?\s+[A-Z]+\s+-\s+FRAnime\.fr/i
const ANIME_SAMA = /^(.+?) - Saison (\d+)\s*\|\s*Anime-Sama\b/i
const ANIME_SAMA_SIDE = /^(.+?) - (Films?|OAV|OVA)\s*\|\s*Anime-Sama\b/i

/**
 * Démonte le titre qu'un navigateur a donné à Windows.
 *
 * `null` pour tout ce qui ne vient pas d'un site connu : une musique, une
 * vidéo YouTube, un film ailleurs. Rien de ce qui n'est pas reconnu ne doit
 * pouvoir cocher quoi que ce soit.
 */
export function readMediaTitle(title: string, artist = ''): Seen | null {
  const text = title.trim()

  const adn = ADN.exec(text)
  if (adn) {
    const { title: name, season } = splitSeason(adn[1])
    return { site: 'adn', title: name, season, episode: Number(adn[2]) }
  }

  // Le `EP5` du titre n'est pas fiable : le site change d'épisode sans
  // recharger la page, et le titre garde celui de la première ouverte — vu à
  // `EP5` pendant que l'adresse disait `ep=8`. Seule l'adresse fait foi.
  const fr = FRANIME.exec(text)
  if (fr) return { site: 'franime', title: fr[1].trim(), season: Number(fr[2]), episode: null }

  const as = ANIME_SAMA.exec(text)
  if (as) return { site: 'anime-sama', title: as[1].trim(), season: Number(as[2]), episode: null }

  // « Naruto - Film » : une page pour tous les films de la série.
  const side = ANIME_SAMA_SIDE.exec(text)
  if (side) {
    const section: SideSection = /^f/i.test(side[2]) ? 'film' : 'oav'
    return { site: 'anime-sama', title: side[1].trim(), season: null, episode: null, section }
  }

  // Aucun exemple réel : le site est reconnu pour être signalé, mais l'épisode
  // reste inconnu tant que le format n'a pas été vu.
  if (/crunchyroll/i.test(text) || /crunchyroll/i.test(artist)) {
    return { site: 'crunchyroll', title: text, season: null, episode: null }
  }
  return null
}

/** Le strict nécessaire d'une série pour la reconnaître. */
export interface Candidate {
  id: number
  title: { romaji: string; english: string | null }
}

/** En dessous, deux noms ne désignent pas la même série. */
export const MIN_TITLE_SIMILARITY = 0.85

/**
 * La série de la bibliothèque que désigne un titre lu, ou `null`.
 *
 * La saison départage : « Overlord II » est la saison 2 d'AniList, et un
 * « Overlord - Saison 2 » chez Anime-Sama ne doit pas cocher la première.
 */
export function matchSeries(seen: Pick<Seen, 'title' | 'season'>, candidates: Candidate[]): number | null {
  const wanted = compact(seen.title)
  if (wanted.length < 2) return null
  const season = seen.season ?? 1

  let best: { id: number; score: number } | null = null
  for (const media of candidates) {
    for (const name of [media.title.english, media.title.romaji]) {
      if (!name) continue
      const parts = baseAndSeason(name)
      // `0`, c'est « Final Season » : sans numéro, elle ne se départage pas.
      if (parts.season !== season && parts.season !== 0) continue
      // Le titre complet, puis ce qui précède les deux-points : les sites
      // écrivent « Frieren » là où AniList dit « Frieren: Beyond Journey's
      // End ». Le titre complet l'emporte à score égal — « Overlord » ne doit
      // pas céder la place à « Overlord: The Sacred Kingdom ».
      const head = parts.base.split(/\s*[:：]\s*|\s+-\s+/)[0]
      const scores = [similarity(compact(parts.base), wanted)]
      if (head !== parts.base && compact(head).length >= 4) scores.push(similarity(compact(head), wanted) * 0.99)
      const score = Math.max(...scores)
      if (score >= MIN_TITLE_SIMILARITY && (!best || score > best.score)) best = { id: media.id, score }
    }
  }
  return best?.id ?? null
}

/** Une ligne du stockage d'Anime-Sama, lue dans un navigateur. */
export interface StoredEpisode {
  /** `/catalogue/tomb-raider-king/saison1/vostfr/` */
  path: string
  /** `savedEpNb` : la place dans leur menu, à partir de 0. */
  index: number | null
  /** `savedEpName` : `Episode 3`, ou le nom d'un film. */
  name: string | null
  /** Plus grand, plus récent. Seul Chrome sait le dire ; ailleurs `0`. */
  rank: number
}

/** Le slug et la saison d'une adresse du catalogue. */
export function catalogueParts(path: string): { slug: string; season: number } | null {
  const m = /^\/catalogue\/([a-z0-9-]+)\/saison(\d+)\/[a-z0-9-]+\/$/i.exec(path)
  return m ? { slug: m[1], season: Number(m[2]) } : null
}

/** Le numéro d'un nom d'entrée : `Episode 3` → 3 ; `Episode 14.5` n'en a pas. */
function numberOf(name: string | null): number | null {
  const m = name ? /^(?:episode|épisode)\s+(\d+)$/i.exec(name.trim()) : null
  return m ? Number(m[1]) : null
}

/**
 * L'épisode que le navigateur a retenu pour cette série et cette saison.
 *
 * Une saison a une ligne par langue — VOSTFR, VF, VKR —, et celles qu'on a
 * seulement ouvertes restent à 0. La plus récente gagne quand on le sait ;
 * sinon la plus avancée, puisqu'une langue qu'on regarde vraiment avance et
 * les autres non.
 *
 * `names` : le titre affiché par le site, et le slug de leur catalogue quand
 * l'app le connaît déjà — Slime s'y appelle `tensei-shitara-slime-datta-ken`,
 * ce qu'aucun titre anglais ne laisse deviner.
 *
 * Le nom prime sur la place : `savedEpNb` compte les entrées du menu, et un
 * « Episode 14.5 » glissé dans la liste décale toutes celles qui suivent.
 */
export function episodeFromStorage(rows: StoredEpisode[], names: string[], season: number): number | null {
  const wanted = names.map(compact).filter((n) => n.length >= 2)
  const hits = rows.filter((row) => {
    const parts = catalogueParts(row.path)
    if (!parts || parts.season !== season) return false
    const slug = compact(parts.slug)
    return wanted.some((name) => similarity(slug, name) >= MIN_TITLE_SIMILARITY)
  })
  if (!hits.length) return null

  hits.sort((a, b) => b.rank - a.rank || (b.index ?? -1) - (a.index ?? -1))
  const top = hits[0]
  if (top.name !== null) return numberOf(top.name)
  return top.index !== null ? top.index + 1 : null
}

/** Le slug et la section d'une adresse de films ou d'OAV : `/catalogue/naruto/film/vostfr/`. */
export function sideParts(path: string): { slug: string; section: SideSection } | null {
  const m = /^\/catalogue\/([a-z0-9-]+)\/(film|oav)[a-z0-9-]*\/[a-z0-9-]+\/$/i.exec(path)
  return m ? { slug: m[1], section: m[2].toLowerCase() as SideSection } : null
}

/**
 * L'entrée qu'un navigateur a retenue dans la section des films ou des OAV.
 *
 * `index` compte à partir de 1, comme `Entry` dans `@shared/as-sections` —
 * `savedEpNb` compte à partir de 0. Le nom est ce qui identifie vraiment le
 * film : leur menu ne numérote pas les spéciaux.
 */
export function sideEntryFromStorage(
  rows: StoredEpisode[],
  names: string[],
  section: SideSection
): { slug: string; index: number | null; name: string | null } | null {
  const wanted = names.map(compact).filter((n) => n.length >= 2)
  const hits = rows.filter((row) => {
    const parts = sideParts(row.path)
    if (!parts || parts.section !== section) return false
    const slug = compact(parts.slug)
    return wanted.some((name) => similarity(slug, name) >= MIN_TITLE_SIMILARITY)
  })
  if (!hits.length) return null
  hits.sort((a, b) => b.rank - a.rank || (b.index ?? -1) - (a.index ?? -1))
  const top = hits[0]
  if (top.index === null && top.name === null) return null
  return { slug: sideParts(top.path)!.slug, index: top.index !== null ? top.index + 1 : null, name: top.name }
}

/** Rassemble les deux clés d'Anime-Sama par adresse, la plus récente l'emportant. */
export function storedEpisodes(pairs: { key: string; value: string; rank: number }[]): StoredEpisode[] {
  const byPath = new Map<string, StoredEpisode>()
  for (const { key, value, rank } of pairs) {
    const m = /^savedEp(Nb|Name)(\/catalogue\/.+)$/.exec(key)
    if (!m) continue
    const row = byPath.get(m[2]) ?? { path: m[2], index: null, name: null, rank: 0 }
    if (m[1] === 'Nb') {
      const n = Number(value)
      row.index = Number.isInteger(n) && n >= 0 ? n : null
    } else {
      try {
        const name = JSON.parse(value) as unknown
        row.name = typeof name === 'string' ? name : null
      } catch {
        row.name = null
      }
    }
    row.rank = Math.max(row.rank, rank)
    byPath.set(m[2], row)
  }
  return [...byPath.values()]
}

/**
 * Les écritures d'un journal LevelDB (`*.log`), dans l'ordre.
 *
 * C'est là que Chrome, Edge, Opera et Brave posent le stockage local des
 * sites avant de le tasser dans des `*.ldb`. La dernière écriture y est en
 * clair : c'est justement celle qu'on cherche, l'épisode qu'on vient d'ouvrir.
 *
 * Le format : des blocs de 32 Kio, découpés en fragments (en-tête de 7 octets :
 * somme de contrôle, longueur, type), qui rassemblés donnent des lots — un
 * numéro de séquence, un compte, puis les clés et valeurs. Une écriture
 * coupée en fin de fichier est ignorée, pas devinée.
 */
export function readLevelDbLog(buf: Uint8Array): { key: Uint8Array; value: Uint8Array | null; seq: number }[] {
  const BLOCK = 32768
  const batches: Uint8Array[] = []
  let parts: Uint8Array[] | null = null

  for (let start = 0; start < buf.length; start += BLOCK) {
    const end = Math.min(start + BLOCK, buf.length)
    let pos = start
    while (pos + 7 <= end) {
      const len = buf[pos + 4] | (buf[pos + 5] << 8)
      const type = buf[pos + 6]
      if (type === 0 && len === 0) break
      const data = buf.subarray(pos + 7, Math.min(pos + 7 + len, end))
      pos += 7 + len
      if (type === 1) batches.push(data)
      else if (type === 2) parts = [data]
      else if (type === 3 && parts) parts.push(data)
      else if (type === 4 && parts) {
        parts.push(data)
        batches.push(concat(parts))
        parts = null
      }
    }
  }

  const out: { key: Uint8Array; value: Uint8Array | null; seq: number }[] = []
  for (const batch of batches) {
    try {
      out.push(...readBatch(batch))
    } catch {
      // Un lot tronqué : la fin du fichier en cours d'écriture.
    }
  }
  return out
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

function readBatch(batch: Uint8Array): { key: Uint8Array; value: Uint8Array | null; seq: number }[] {
  if (batch.length < 12) throw new Error('lot trop court')
  const view = new DataView(batch.buffer, batch.byteOffset, batch.byteLength)
  let seq = view.getUint32(0, true) + view.getUint32(4, true) * 2 ** 32
  const count = view.getUint32(8, true)
  let pos = 12

  const varint = (): number => {
    let n = 0
    let shift = 0
    for (;;) {
      if (pos >= batch.length) throw new Error('varint coupé')
      const byte = batch[pos++]
      n += (byte & 0x7f) * 2 ** shift
      if (!(byte & 0x80)) return n
      shift += 7
    }
  }
  const slice = (): Uint8Array => {
    const len = varint()
    if (pos + len > batch.length) throw new Error('valeur coupée')
    const out = batch.subarray(pos, pos + len)
    pos += len
    return out
  }

  const out: { key: Uint8Array; value: Uint8Array | null; seq: number }[] = []
  for (let i = 0; i < count; i += 1) {
    const tag = batch[pos++]
    const key = slice()
    const value = tag === 1 ? slice() : null
    out.push({ key, value, seq: seq++ })
  }
  return out
}

/**
 * Une chaîne du stockage local de Chromium : un octet de format, puis le texte
 * — `0x01` pour du Latin-1, `0x00` pour de l'UTF-16.
 */
export function chromiumString(bytes: Uint8Array): string | null {
  if (!bytes.length) return null
  const body = bytes.subarray(1)
  if (bytes[0] === 1) return String.fromCharCode(...body)
  if (bytes[0] === 0) return new TextDecoder('utf-16le').decode(body)
  return null
}

/**
 * Les clés d'Anime-Sama dans un journal de Chromium, la dernière écriture
 * portant le rang le plus haut. Une clé effacée disparaît.
 */
export function animeSamaFromLevelDb(buf: Uint8Array): { key: string; value: string; rank: number }[] {
  const latest = new Map<string, { value: string; rank: number } | null>()
  for (const row of readLevelDbLog(buf)) {
    // `_https://anime-sama.to` `\0` `\x01savedEpNb/catalogue/…`
    const nul = row.key.indexOf(0)
    if (nul < 0) continue
    const origin = String.fromCharCode(...row.key.subarray(0, nul))
    if (!/^_https:\/\/anime-sama\.[a-z]+$/.test(origin)) continue
    const key = chromiumString(row.key.subarray(nul + 1))
    if (!key?.startsWith('savedEp')) continue
    const value = row.value ? chromiumString(row.value) : null
    latest.set(key, value === null ? null : { value, rank: row.seq })
  }
  const out: { key: string; value: string; rank: number }[] = []
  for (const [key, hit] of latest) if (hit) out.push({ key, ...hit })
  return out
}

/**
 * L'épisode d'une adresse FrAnime : `franime.fr/anime/chainsmoker-cat?s=1&ep=4&lang=vo`.
 *
 * Firefox ne met jamais l'épisode dans le titre qu'il donne à Windows — Chrome
 * si. La barre d'adresse, elle, l'a toujours.
 */
export function franimeFromUrl(url: string): { slug: string; season: number; episode: number } | null {
  const m = /franime\.fr\/anime\/([a-z0-9-]+)\/?\?([^#\s]*)/i.exec(url)
  if (!m) return null
  const params = new URLSearchParams(m[2])
  const season = Number(params.get('s') ?? '1')
  const episode = Number(params.get('ep'))
  if (!Number.isInteger(season) || !Number.isInteger(episode) || episode < 1) return null
  return { slug: m[1], season, episode }
}

/**
 * L'épisode FrAnime que montrent les barres d'adresse ouvertes, pour cette
 * série et cette saison.
 *
 * Seul l'onglet actif de chaque fenêtre est lisible. Deux fenêtres sur deux
 * épisodes différents de la même série : on ne tranche pas, on ne coche rien.
 */
export function franimeEpisodeFromUrls(urls: string[], seen: Pick<Seen, 'title' | 'season'>): number | null {
  const wanted = compact(seen.title)
  const season = seen.season ?? 1
  const found = new Set<number>()
  for (const url of urls) {
    const hit = franimeFromUrl(url)
    if (hit && hit.season === season && similarity(compact(hit.slug), wanted) >= MIN_TITLE_SIMILARITY) {
      found.add(hit.episode)
    }
  }
  return found.size === 1 ? [...found][0] : null
}
