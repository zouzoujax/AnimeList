import { describe, expect, it } from 'vitest'
import { decodeXml, parseAnn, pickAnn, renumber, type AnnTarget } from './ann'

// Trois saisons au même nom, comme ANN les renvoie pour « ~frieren ».
const XML = `<ann>
<anime id="38838" gid="1" type="TV" name="Frieren: Beyond Journey&#039;s End" precision="TV 3">
<info gid="2" type="Main title" lang="EN">Frieren: Beyond Journey&#039;s End</info>
<info gid="3" type="Vintage">2027-10</info>
</anime>
<anime id="33628" gid="4" type="TV" name="Frieren: Beyond Journey&#039;s End" precision="TV 2">
<info gid="5" type="Vintage">2026-01-16</info>
<info gid="6" type="Number of episodes">10</info>
</anime>
<anime id="26334" gid="7" type="TV" name="Frieren: Beyond Journey&#039;s End" precision="TV">
<info gid="8" type="Alternative title" lang="JA">Sōsō no Frieren</info>
<info gid="9" type="Vintage">2023-09-29 to 2024-03-22</info>
<info gid="10" type="Number of episodes">28</info>
<episode num="1"><title gid="11" lang="EN">The Journey&#039;s End</title></episode>
<episode num="2"><title gid="12" lang="EN">It Didn&#039;t Have to Be Magic...</title><title gid="13" lang="JA">別に魔法じゃなくたって…</title></episode>
</anime>
<anime id="99" gid="14" type="movie" name="Frieren Movie"><info gid="15" type="Vintage">2023-09-01</info></anime>
</ann>`

const target = (over: Partial<AnnTarget> = {}): AnnTarget => ({
  romaji: 'Sousou no Frieren',
  english: 'Frieren: Beyond Journey’s End',
  format: 'TV',
  year: 2023,
  month: 9,
  episodes: 28,
  ...over
})

describe('parseAnn', () => {
  it('lit chaque fiche, ses noms, sa date et ses titres anglais', () => {
    const entries = parseAnn(XML)
    expect(entries.map((e) => e.id)).toEqual([38838, 33628, 26334, 99])
    const first = entries[2]
    expect(first.start).toEqual({ year: 2023, month: 9 })
    expect(first.count).toBe(28)
    expect(first.names).toContain('Sōsō no Frieren')
    expect(first.titles).toEqual({ 1: "The Journey's End", 2: "It Didn't Have to Be Magic..." })
  })

  it('ne garde que le titre anglais d’un épisode', () => {
    expect(parseAnn(XML)[2].titles[2]).not.toContain('魔法')
  })
})

describe('pickAnn', () => {
  it('choisit la saison par sa date de début', () => {
    expect(pickAnn(parseAnn(XML), target())?.id).toBe(26334)
    expect(pickAnn(parseAnn(XML), target({ year: 2026, month: 1, episodes: 10 }))?.id).toBe(33628)
  })

  it('ne devine pas sans date, ni quand aucune saison ne tombe la bonne année', () => {
    expect(pickAnn(parseAnn(XML), target({ year: null }))).toBeNull()
    expect(pickAnn(parseAnn(XML), target({ year: 2025 }))).toBeNull()
  })

  it('refuse un écart de plus d’un mois', () => {
    expect(pickAnn(parseAnn(XML), target({ month: 12 }))).toBeNull()
  })

  it('accepte la diffusion quand une avant-première la précède', () => {
    // Kaguya-sama saison 2 : festival à Sydney en mars, diffusion en avril.
    const xml = `<anime id="22587" type="TV" name="Kaguya-sama: Love is War Season 2">
<info type="Vintage">2020-03-08 (Anime Festival Sydney)</info>
<info type="Vintage">2020-04-11 to 2020-06-27</info></anime>`
    const kaguya = target({ romaji: 'Kaguya-sama wa Kokurasetai?', english: null, year: 2020, month: 5, episodes: 12 })
    expect(pickAnn(parseAnn(xml), kaguya)?.id).toBe(22587)
  })

  it('ignore une rediffusion à l’étranger des années plus tard', () => {
    const xml = `<anime id="21852" type="TV" name="Fire Force">
<info type="Vintage">2019-07-05</info>
<info type="Vintage">2021-11-04 (Brazil, Funimation)</info></anime>`
    const later = target({ romaji: 'Enen no Shouboutai', english: 'Fire Force', year: 2021, month: 11, episodes: 24 })
    expect(pickAnn(parseAnn(xml), later)).toBeNull()
  })

  it('ne prend jamais un film pour une série du même mois', () => {
    expect(pickAnn(parseAnn(XML), target({ month: 9 }))?.type).toBe('TV')
  })
})

describe('renumber', () => {
  it('retire un décalage net de numérotation', () => {
    expect(renumber({ 13: 'a', 14: 'b', 15: 'c' }, 3)).toEqual({ 1: 'a', 2: 'b', 3: 'c' })
  })

  it('laisse les numéros tels quels sinon', () => {
    expect(renumber({ 1: 'a', 2: 'b' }, 12)).toEqual({ 1: 'a', 2: 'b' })
    expect(renumber({ 13: 'a', 14: 'b' }, 12)).toEqual({ 13: 'a', 14: 'b' })
  })
})

describe('decodeXml', () => {
  it('décode les entités nommées et numériques', () => {
    expect(decodeXml('Tom &amp; Jerry &#039;s &#x2014;')).toBe("Tom & Jerry 's —")
  })
})
