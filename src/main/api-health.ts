/**
 * L'état des services externes, pour le panneau secret.
 *
 * Chaque service est sondé par la requête la plus légère qu'il offre, de
 * celles qui ne comptent pas dans un quota : `/me` chez trace.moe, `/usage`
 * chez DeepL, `/ping` chez MangaDex… Deux exceptions, qui ne sont jamais
 * sondées exprès :
 *
 * - AniList, dont la limite (30 par minute) est partagée avec toute l'app :
 *   on reprend l'état qu'elle suit déjà.
 * - AnimeChan, dont le quota gratuit tient en quelques requêtes par heure :
 *   on montre le résultat de sa dernière vraie requête.
 *
 * Toutes les sondes partent en même temps, avec huit secondes au plus chacune.
 */

import type { ApiHealth } from '@shared/api-health'
import { ageLabel } from '@shared/api-recovery'
import { t } from '@shared/i18n'
import { deeplHost } from '@shared/translate'
import { apiStatus } from './anilist'
import { animechanLastCall, quoteStats } from './quotes'
import { getPrefs } from './store'

const TIMEOUT_MS = 8000

interface Probe {
  status: number
  ms: number
  body: unknown
}

/** Une requête minutée ; `status` vaut 0 quand le service ne répond pas. */
async function probe(url: string, init: RequestInit = {}): Promise<Probe> {
  const started = Date.now()
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': 'AnimeList (application de bureau)', ...(init.headers ?? {}) }
    })
    const text = await res.text().catch(() => '')
    let body: unknown = text
    try {
      body = JSON.parse(text)
    } catch {
      // Du XML ou du texte : on le garde tel quel.
    }
    return { status: res.status, ms: Date.now() - started, body }
  } catch {
    return { status: 0, ms: Date.now() - started, body: null }
  }
}

/** Le verdict commun : 2xx vert, 429 orange, le reste rouge. */
function judge(p: Probe): Pick<ApiHealth, 'state' | 'detail' | 'ms'> {
  if (p.status === 0) return { state: 'down', detail: t('Injoignable'), ms: null }
  if (p.status === 429) return { state: 'limited', detail: t('Limite de requêtes atteinte'), ms: p.ms }
  if (p.status >= 200 && p.status < 300) return { state: 'ok', detail: t('Répond'), ms: p.ms }
  return { state: 'down', detail: t('Erreur {status}', { status: p.status }), ms: p.ms }
}

function anilist(): ApiHealth {
  const s = apiStatus()
  const base = { id: 'anilist', name: 'AniList', purpose: t('Catalogue, fiches, calendrier'), ms: null }
  if (s.state === 'ok') return { ...base, state: 'ok', detail: t('Répond') }
  if (s.state === 'throttled' || s.state === 'paused') {
    return { ...base, state: 'limited', detail: s.message ?? t('Limite de requêtes atteinte') }
  }
  return { ...base, state: 'down', detail: s.message ?? t('Injoignable') }
}

function animechan(now: number): ApiHealth {
  const base = { id: 'animechan', name: 'AnimeChan', purpose: t('Citation du jour'), ms: null }
  const paused = quoteStats().pausedUntil
  if (paused && paused > now) {
    return { ...base, state: 'limited', detail: t('Quota atteint, pause jusqu’à {time}', { time: clock(paused) }) }
  }
  const last = animechanLastCall()
  if (!last)
    return { ...base, state: 'unknown', detail: t('Pas sondé (quota très bas) ; aucune requête depuis le lancement') }
  const when = ageLabel(last.at, now)
  if (last.status === 429) return { ...base, state: 'limited', detail: t('Limite atteinte · {when}', { when }) }
  if (last.status >= 200 && last.status < 300)
    return { ...base, state: 'ok', detail: t('Dernière requête réussie · {when}', { when }) }
  return {
    ...base,
    state: 'down',
    detail:
      last.status === 0
        ? t('Injoignable · {when}', { when })
        : t('Erreur {status} · {when}', { status: last.status, when })
  }
}

const clock = (at: number): string => new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

async function traceMoe(): Promise<ApiHealth> {
  const p = await probe('https://api.trace.moe/me')
  const base = { id: 'tracemoe', name: 'trace.moe', purpose: t('Identifier une image') }
  const verdict = judge(p)
  const body = p.body as { quota?: number; quotaUsed?: number } | null
  if (verdict.state === 'ok' && typeof body?.quota === 'number') {
    const used = body.quotaUsed ?? 0
    const left = { used, total: body.quota }
    return {
      ...base,
      ...verdict,
      state: used >= body.quota ? 'limited' : 'ok',
      detail: t('{used} / {total} recherches ce mois-ci', left)
    }
  }
  return { ...base, ...verdict }
}

async function deepl(): Promise<ApiHealth> {
  const key = getPrefs().deeplKey?.trim()
  const base = { id: 'deepl', name: 'DeepL', purpose: t('Traduction des résumés') }
  if (!key) return { ...base, state: 'off', detail: t('Pas de clé'), ms: null }
  const p = await probe(`${deeplHost(key)}/v2/usage`, { headers: { Authorization: `DeepL-Auth-Key ${key}` } })
  const verdict = judge(p)
  // 456 : le quota de caractères du mois est épuisé.
  if (p.status === 456) return { ...base, state: 'limited', detail: t('Quota du mois épuisé'), ms: p.ms }
  if (p.status === 403) return { ...base, state: 'down', detail: t('Clé refusée'), ms: p.ms }
  const body = p.body as { character_count?: number; character_limit?: number } | null
  if (verdict.state === 'ok' && typeof body?.character_limit === 'number') {
    const used = body.character_count ?? 0
    return {
      ...base,
      ...verdict,
      state: used >= body.character_limit ? 'limited' : 'ok',
      detail: t('{used} / {limit} caractères ce mois-ci', {
        used: used.toLocaleString(),
        limit: body.character_limit.toLocaleString()
      })
    }
  }
  return { ...base, ...verdict }
}

const simple = async (id: string, name: string, purpose: string, url: string): Promise<ApiHealth> => ({
  id,
  name,
  purpose,
  ...judge(await probe(url))
})

export async function apiHealth(): Promise<ApiHealth[]> {
  const now = Date.now()
  const probed = await Promise.all([
    simple('jikan', 'Jikan (MyAnimeList)', t('Fillers, import MyAnimeList'), 'https://api.jikan.moe/v4'),
    simple(
      'ann',
      'Anime News Network',
      t('Titres d’épisodes'),
      'https://cdn.animenewsnetwork.com/encyclopedia/api.xml?anime=1'
    ),
    simple('mangadex', 'MangaDex', t('Chapitres des mangas'), 'https://api.mangadex.org/ping'),
    simple(
      'aniskip',
      'AniSkip',
      t('Passer les génériques'),
      'https://api.aniskip.com/v2/skip-times/1/1?types=op&episodeLength=0'
    ),
    simple('kitsu', 'Kitsu', t('Import d’une liste Kitsu'), 'https://kitsu.app/api/edge/anime?page%5Blimit%5D=1'),
    traceMoe(),
    deepl()
  ])
  return [anilist(), ...probed, animechan(now)]
}
