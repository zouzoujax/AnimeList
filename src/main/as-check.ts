/**
 * `npm run check:anime-sama` : le résolveur rejoué sur des séries témoins.
 *
 * Anime-Sama change son site sans prévenir, et une correspondance fausse ne
 * se voit qu'au clic — la saison 1 de 2015 ouverte pour le remake de 2026.
 * Chaque cas ci-dessous a été vérifié à la main sur leur site : un écart dit
 * que leur site ou le résolveur a changé, et lequel des cas en pâtit.
 *
 * Lancé par `scripts/check-anime-sama.mjs`, dans un dossier de données
 * jetable : aucune bibliothèque n'est lue, et le cache part vide pour que
 * chaque réponse vienne du réseau. Le code de sortie est le nombre d'écarts.
 */

import { searchTitles } from '@shared/titles'
import { detail } from './anilist'
import { aimFor, resolve, siteCheck } from './animesama'

interface Case {
  id: number
  /** Ce qu'on vérifie, pour lire le rapport sans ouvrir AniList. */
  note: string
  /** Le chemin attendu sous `/catalogue/`, sans la langue. `null` : absent du site. */
  expect: string | null
  /** L'entrée visée dans le menu, pour un film ou un OAV qui en partage un. */
  entry?: string
  /** L'épisode de leur menu visé pour l'épisode 1 de la fiche, quand ce n'est pas le 1. */
  first?: number
}

// Relevés sur anime-sama.to le 6 novembre 2026.
const CASES: Case[] = [
  { id: 153288, note: 'Kaiju No. 8, saison 1', expect: 'kaiju-n8/saison1/' },
  { id: 178754, note: 'Kaiju No. 8, saison 2', expect: 'kaiju-n8/saison2/' },
  { id: 179999, note: 'Kaiju No. 8, un OAV parmi trois', expect: 'kaiju-n8/oav/', entry: "Hoshina's Day Off" },
  { id: 20594, note: 'SAO II, un numéro en chiffres romains', expect: 'sword-art-online/saison2/' },
  { id: 21175, note: 'Dragon Ball Super, l’original de 2015', expect: 'dragon-ball-super/saison1/' },
  { id: 206814, note: 'Dragon Ball Super: Beerus, le remake de 2026', expect: 'dragon-ball-super/saison1hs/' },
  { id: 184356, note: 'Tomb Raider King, une seule saison', expect: 'tomb-raider-king/saison1/' },
  {
    id: 442,
    note: 'Naruto, premier film, dont la série mère n’est pas en cache',
    expect: 'naruto/film/',
    entry: 'Naruto et la Princesse des neiges'
  },
  {
    id: 112151,
    note: 'Demon Slayer, le film du Train de l’infini',
    expect: 'demon-slayer/film1/',
    entry: "Le train de l'Infini"
  },
  { id: 129874, note: 'Demon Slayer, l’arc du Train de l’infini en série', expect: 'demon-slayer/saison1hs/' },
  { id: 142329, note: 'Demon Slayer, leur saison 2 est le 3e maillon d’AniList', expect: 'demon-slayer/saison2/' },
  {
    id: 127720,
    note: 'Mushoku Tensei, la deuxième moitié de la saison 1',
    expect: 'mushoku-tensei/saison1/',
    first: 12
  },
  { id: 146065, note: 'Mushoku Tensei, saison 2 en deux parties', expect: 'mushoku-tensei/saison2-1/' },
  { id: 166873, note: 'Mushoku Tensei, seconde partie de la saison 2', expect: 'mushoku-tensei/saison2-2/' },
  { id: 178789, note: 'Mushoku Tensei, saison 3', expect: 'mushoku-tensei/saison3/' },
  { id: 100182, note: 'SAO Alicization, saison sans numéro dans le titre', expect: 'sword-art-online/saison3/' },
  {
    id: 156822,
    note: 'Slime, saison 3 au-delà d’un film intercalé',
    expect: 'tensei-shitara-slime-datta-ken/saison3/'
  },
  { id: 20, note: 'Naruto, la version avec fillers', expect: 'naruto/saison1/' },
  { id: 11617, note: 'High School DxD, absent du site', expect: null }
]

export const isAnimeSamaCheck = (): boolean => process.argv.includes('--check-anime-sama')

/** Le rapport va sur la sortie standard, que le script relaie tel quel. */
const out = (line: string): void => void process.stdout.write(`${line}\n`)

const path = (url: string): string =>
  url.replace(/^https:\/\/anime-sama\.to\/catalogue\//, '').replace(/(?:vostfr|vf)\/$/, '')

export async function runAnimeSamaCheck(): Promise<number> {
  const site = await siteCheck()
  const reading = site.broken ? `illisible (${site.broken})` : site.status === 200 ? 'lisible' : `erreur ${site.status}`
  out(`Site : ${reading}, ${site.ms} ms\n`)

  let failures = site.status === 200 && !site.broken ? 0 : 1
  for (const c of CASES) {
    let got: string
    try {
      const media = await detail(c.id)
      const target = await resolve(c.id, searchTitles(media.title), media.startDate?.year ?? null)
      const first = aimFor(c.id, target.url, 1).episode
      got = target.absent
        ? 'absent'
        : !target.direct
          ? 'recherche'
          : target.episodes === false
            ? `${path(target.url)} (page de la série)`
            : path(target.url) +
              (target.entry ? ` « ${target.entry.name} »` : '') +
              (first && first > 1 ? `, dès leur épisode ${first}` : '')
    } catch (err) {
      got = `erreur : ${(err as Error).message}`
    }
    const want =
      c.expect === null
        ? 'absent'
        : c.expect + (c.entry ? ` « ${c.entry} »` : '') + (c.first ? `, dès leur épisode ${c.first}` : '')
    const ok = got === want
    if (!ok) failures++
    out(`${ok ? '✓' : '✗'} ${c.note}\n    ${ok ? got : `attendu ${want}, obtenu ${got}`}`)
  }

  out(`\n${failures === 0 ? 'Tout correspond.' : `${failures} écart(s).`}`)
  return failures
}
