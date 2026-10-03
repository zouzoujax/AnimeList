/**
 * Titres d'épisodes depuis l'encyclopédie d'Anime News Network.
 *
 * La lecture et le choix de la fiche sont dans `@shared/ann` ; ici, le réseau
 * et le cache. ANN demande une requête par seconde au plus : ses appels ont
 * leur propre file, sans rapport avec le budget d'AniList.
 *
 * La recherche essaie le titre anglais, puis le romaji, puis leur forme sans
 * numéro de saison — ANN range souvent toutes les saisons sous un même nom.
 * Trois essais au plus, et la première fiche sûre arrête la recherche.
 *
 * Le cache garde aussi les échecs : une série qu'ANN ne connaît pas n'est pas
 * redemandée à chaque ouverture de sa fiche.
 */

import { app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { parseAnn, pickAnn, renumber, type AnnRequest } from '@shared/ann'
import { baseAndSeason } from '@shared/titles'
import { createQueue } from './queue'

const ENDPOINT = 'https://cdn.animenewsnetwork.com/encyclopedia/api.xml'
const gate = createQueue({ minGapMs: 1100 })

/** Une série finie ne change plus ; une série en cours gagne des titres chaque semaine. */
const TTL_DONE = 30 * 24 * 3600_000
const TTL_AIRING = 24 * 3600_000
/** Une fiche introuvable, ou une réponse ratée, est redemandée plus tôt. */
const TTL_MISS = 3 * 24 * 3600_000

interface Row {
  at: number
  ttl: number
  annId: number | null
  titles: Record<number, string>
}

let cache = new Map<number, Row>()
let cacheFile = ''
let writeTimer: NodeJS.Timeout | null = null
const inflight = new Map<number, Promise<Record<number, string>>>()

export function initAnn(): void {
  cacheFile = join(app.getPath('userData'), 'ann-cache.json')
  if (!existsSync(cacheFile)) return
  try {
    cache = new Map(JSON.parse(readFileSync(cacheFile, 'utf8')) as [number, Row][])
  } catch {
    cache = new Map()
  }
}

function persist(): void {
  if (!cacheFile) return
  if (writeTimer) clearTimeout(writeTimer)
  writeTimer = setTimeout(() => {
    writeTimer = null
    void fs
      .writeFile(cacheFile, JSON.stringify([...cache.entries()]), 'utf8')
      .catch((err) => console.error('[ann] écriture du cache impossible', err))
  }, 800)
}

async function search(term: string): Promise<string | null> {
  return gate.run('background', `ann:${term}`, async () => {
    const res = await fetch(`${ENDPOINT}?anime=~${encodeURIComponent(term)}`, {
      headers: { 'User-Agent': 'AnimeList (application de bureau)' }
    })
    return res.ok ? res.text() : null
  })
}

/**
 * Les titres anglais des épisodes de cette série, par numéro. Vide quand ANN
 * ne la connaît pas, ou sans certitude.
 *
 * Ne lève jamais : un titre manquant laisse simplement « Épisode 12 ».
 */
export function episodeTitles(req: AnnRequest): Promise<Record<number, string>> {
  const hit = cache.get(req.id)
  if (hit && Date.now() - hit.at < hit.ttl) return Promise.resolve(hit.titles)
  // Un film n'a pas d'épisodes à titrer.
  if (req.format === 'MOVIE' || req.format === 'MUSIC' || req.year === null) return Promise.resolve({})

  const running = inflight.get(req.id)
  if (running) return running

  const task = lookup(req)
    .catch((err) => {
      console.error('[ann]', (err as Error).message)
      return hit?.titles ?? {}
    })
    .finally(() => inflight.delete(req.id))
  inflight.set(req.id, task)
  return task
}

async function lookup(req: AnnRequest): Promise<Record<number, string>> {
  // La recherche d'ANN est une sous-chaîne exacte : « Naruto: Shippuden » ne
  // trouve pas « Naruto Shippūden ». D'où les formes sans ponctuation, puis,
  // en dernier recours, le premier mot — la date fait le tri derrière.
  const loose = (t: string): string => t.replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  const bases = [req.english, req.romaji].filter((t): t is string => !!t).map((t) => baseAndSeason(t).base)
  const firstWord = loose(bases[0] ?? req.romaji).split(' ')[0]
  const terms = [...new Set([...bases, ...bases.map(loose)].map((t) => t.trim()).filter((t) => t.length >= 2))].slice(
    0,
    4
  )
  if (firstWord.length >= 4 && !terms.includes(firstWord)) terms.push(firstWord)

  let answered = false
  for (const term of terms) {
    const xml = await search(term)
    if (xml === null) continue
    answered = true
    const entry = pickAnn(parseAnn(xml), req)
    if (!entry) continue
    const titles = renumber(entry.titles, req.episodes)
    cache.set(req.id, { at: Date.now(), ttl: req.airing ? TTL_AIRING : TTL_DONE, annId: entry.id, titles })
    persist()
    return titles
  }

  // Rien de sûr. Une panne (aucune réponse) n'est pas retenue : on retentera.
  if (answered) {
    cache.set(req.id, { at: Date.now(), ttl: TTL_MISS, annId: null, titles: {} })
    persist()
  }
  return {}
}
