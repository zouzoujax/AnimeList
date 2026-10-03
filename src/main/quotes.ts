/**
 * La citation du jour, tirée des séries de la bibliothèque (AnimeChan).
 *
 * Le quota gratuit d'AnimeChan est minuscule — quelques requêtes par heure.
 * On n'en demande donc jamais une par jour : une réserve est gardée sur le
 * disque, remplie au plus une fois par semaine par une poignée de requêtes
 * (une page de citations par série), et la citation du jour y est choisie
 * d'après la date. Toute la journée, c'est la même ; aucune requête de plus.
 *
 * AnimeChan ne connaît pas AniList : une page n'est gardée que si le nom de
 * l'anime qu'elle renvoie ressemble à l'un des titres de la série demandée.
 * Une série déjà demandée ne l'est plus, qu'elle ait rapporté quelque chose
 * ou non : la réserve s'élargit d'une semaine à l'autre au lieu de tourner
 * en rond.
 */

import { app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { Media } from '@shared/types'
import { baseAndSeason } from '@shared/titles'
import { pickQuote, quoteMatches, type Quote } from '@shared/quotes'
import { snapshot } from './store'

const ENDPOINT = 'https://api.animechan.io/v1/quotes'
const REFILL_EVERY = 7 * 24 * 3600_000
/** Le quota est par heure : trois requêtes laissent de la marge. */
const MAX_REQUESTS = 3
/** Une réserve plus petite que ça se remplit sans attendre la semaine. */
const LOW_STOCK = 5

interface Stock {
  at: number
  quotes: Quote[]
  /** Séries AniList déjà demandées, fructueuses ou non. */
  asked: number[]
  /** Après un refus pour quota, rien n'est redemandé avant cette heure-là. */
  pausedUntil?: number
}

let file = ''
let stock: Stock = { at: 0, quotes: [], asked: [] }
let refilling: Promise<void> | null = null

export function initQuotes(): void {
  file = join(app.getPath('userData'), 'quotes-cache.json')
  if (!existsSync(file)) return
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Stock
    if (Array.isArray(raw.quotes) && Array.isArray(raw.asked)) stock = raw
  } catch {
    // Une réserve illisible se reconstitue.
  }
}

function save(): void {
  if (!file) return
  void fs.writeFile(file, JSON.stringify(stock), 'utf8').catch((err) => console.error('[citations]', err))
}

/** Les séries que tu as vraiment regardées, pas encore demandées. */
function candidates(): Media[] {
  const data = snapshot()
  const watched = new Set(
    data.entries.filter((e) => ['watching', 'completed', 'paused'].includes(e.status)).map((e) => e.animeId)
  )
  const asked = new Set(stock.asked)
  // Une série par franchise suffit : AnimeChan range toutes les saisons sous un nom.
  const seen = new Set<string>()
  const out: Media[] = []
  for (const media of data.media) {
    if (!watched.has(media.id) || asked.has(media.id) || media.format === 'MUSIC') continue
    const base = baseAndSeason(media.title.romaji).base.toLowerCase()
    if (seen.has(base)) continue
    seen.add(base)
    out.push(media)
  }
  // Un ordre au hasard : la réserve couvre peu à peu toute la bibliothèque.
  return out.sort(() => Math.random() - 0.5)
}

interface Raw {
  content?: string
  anime?: { name?: string; altName?: string }
  character?: { name?: string }
}

async function ask(media: Media, term: string): Promise<'quota' | Quote[]> {
  const res = await fetch(`${ENDPOINT}?anime=${encodeURIComponent(term)}&page=1`, {
    headers: { 'User-Agent': 'AnimeList (application de bureau)' }
  })
  if (res.status === 429) return 'quota'
  if (!res.ok) return []
  const body = (await res.json()) as { data?: Raw[] }
  const titles = [media.title.romaji, media.title.english].filter((t): t is string => !!t)
  return (body.data ?? [])
    .filter((q) => q.content && q.character?.name && q.anime?.name)
    .filter((q) => quoteMatches([q.anime?.name ?? '', q.anime?.altName ?? ''], titles))
    .map((q) => ({
      text: (q.content as string).replace(/\s*\n\s*/g, ' ').trim(),
      character: q.character?.name as string,
      anime: q.anime?.name as string,
      animeId: media.id
    }))
}

async function refill(): Promise<void> {
  let requests = 0
  for (const media of candidates()) {
    if (requests >= MAX_REQUESTS) break
    const terms = [...new Set([baseAndSeason(media.title.romaji).base, media.title.english ?? ''])].filter(Boolean)
    stock.asked.push(media.id)
    for (const term of terms) {
      if (requests >= MAX_REQUESTS) break
      requests += 1
      const found = await ask(media, term)
      if (found === 'quota') {
        // Cette série n'a pas eu sa chance : elle sera redemandée.
        stock.asked.pop()
        stock.pausedUntil = Date.now() + 3600_000
        save()
        return
      }
      if (found.length) {
        stock.quotes.push(...found)
        break
      }
    }
  }
  stock.at = Date.now()
  save()
}

/**
 * La citation du jour, ou `null` si la réserve est vide (rien trouvé, ou pas
 * de réseau). Ne lève jamais : un encart qui manque ne casse pas l'accueil.
 */
export async function todaysQuote(): Promise<Quote | null> {
  const age = Date.now() - stock.at
  // Une réserve maigre se complète sans attendre la semaine, mais pas plus
  // d'une fois par heure : le quota d'AnimeChan est compté à l'heure.
  const due = age > REFILL_EVERY || (stock.quotes.length < LOW_STOCK && age > 3600_000)
  if (due && !refilling && Date.now() > (stock.pausedUntil ?? 0)) {
    refilling = refill()
      .catch((err) => console.error('[citations]', (err as Error).message))
      .finally(() => (refilling = null))
  }
  // Une réserve vide attend le remplissage ; sinon on sert ce qu'on a.
  if (!stock.quotes.length && refilling) await refilling

  const library = new Set(snapshot().entries.map((e) => e.animeId))
  return pickQuote(
    stock.quotes.filter((q) => library.has(q.animeId)),
    new Date()
  )
}
