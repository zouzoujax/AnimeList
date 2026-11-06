import { describe, expect, it } from 'vitest'
import { belongs, placeSeasons, writtenPart, writtenSeason, type ChainSeason, type SiteSeason } from './as-match'

// Sections et chaînes relevées le 6 novembre 2026, sur anime-sama.to et AniList.
const site = (...rows: [string, string, number?][]): SiteSeason[] =>
  rows.map(([base, name, count]) => ({ base, name, count: count ?? null }))
const chain = (...rows: [number, string[], number | null, number | null][]): ChainSeason[] =>
  rows.map(([id, titles, year, episodes]) => ({ id, titles, year, episodes }))

const baseOf = (placed: ReturnType<typeof placeSeasons>, id: number): string | undefined => placed.get(id)?.base

describe('placeSeasons', () => {
  it('pose le remake de 2026 dans sa section datée, l’original dans la saison 1', () => {
    const placed = placeSeasons(
      site(['saison1', 'Saison 1'], ['saison1hs', 'Saison 1 Remake 2026']),
      chain([21175, ['Dragon Ball Super'], 2015, 131], [206814, ['Dragon Ball Super: Beerus'], 2026, null])
    )
    expect(baseOf(placed, 21175)).toBe('saison1')
    expect(baseOf(placed, 206814)).toBe('saison1hs')
  })

  it('intercale l’arc du Train de l’infini entre la saison 1 et la saison 2', () => {
    const placed = placeSeasons(
      site(
        ['saison1', 'Saison 1'],
        ['saison1hs', 'Épisode - Train de l’infini'],
        ['saison2', 'Saison 2'],
        ['saison3', 'Saison 3'],
        ['saison4', 'Saison 4']
      ),
      chain(
        [101922, ['Kimetsu no Yaiba', 'Demon Slayer: Kimetsu no Yaiba'], 2019, 26],
        [
          129874,
          ['Kimetsu no Yaiba: Mugen Ressha-hen (TV)', 'Demon Slayer: Kimetsu no Yaiba Mugen Train Arc'],
          2021,
          7
        ],
        [
          142329,
          ['Kimetsu no Yaiba: Yuukaku-hen', 'Demon Slayer: Kimetsu no Yaiba Entertainment District Arc'],
          2021,
          11
        ],
        [
          145139,
          ['Kimetsu no Yaiba: Katanakaji no Sato-hen', 'Demon Slayer: Kimetsu no Yaiba Swordsmith Village Arc'],
          2023,
          11
        ],
        [
          166240,
          ['Kimetsu no Yaiba: Hashira Geiko-hen', 'Demon Slayer: Kimetsu no Yaiba Hashira Training Arc'],
          2024,
          8
        ]
      )
    )
    expect([101922, 129874, 142329, 145139, 166240].map((id) => baseOf(placed, id))).toEqual([
      'saison1',
      'saison1hs',
      'saison2',
      'saison3',
      'saison4'
    ])
  })

  it('range deux cours dans la même saison, et suit une saison coupée en deux parties', () => {
    const placed = placeSeasons(
      site(
        ['saison1', 'Saison 1'],
        ['saison2-1', 'Saison 2 Partie 1'],
        ['saison2-2', 'Saison 2 Partie 2'],
        ['saison3', 'Saison 3']
      ),
      chain(
        [108465, ['Mushoku Tensei: Isekai Ittara Honki Dasu', 'Mushoku Tensei: Jobless Reincarnation'], 2021, 11],
        [
          127720,
          ['Mushoku Tensei: Isekai Ittara Honki Dasu Part 2', 'Mushoku Tensei: Jobless Reincarnation Cour 2'],
          2021,
          12
        ],
        [
          146065,
          ['Mushoku Tensei II: Isekai Ittara Honki Dasu', 'Mushoku Tensei: Jobless Reincarnation Season 2'],
          2023,
          13
        ],
        [
          166873,
          [
            'Mushoku Tensei II: Isekai Ittara Honki Dasu Part 2',
            'Mushoku Tensei: Jobless Reincarnation Season 2 Part 2'
          ],
          2024,
          12
        ],
        [
          178789,
          ['Mushoku Tensei III: Isekai Ittara Honki Dasu', 'Mushoku Tensei: Jobless Reincarnation Season 3'],
          2026,
          14
        ]
      )
    )
    expect(placed.get(108465)).toEqual({ base: 'saison1', offset: 0, span: 23 })
    // Le premier épisode du second cour est le douzième de leur menu.
    expect(placed.get(127720)).toEqual({ base: 'saison1', offset: 11, span: 23 })
    expect(baseOf(placed, 146065)).toBe('saison2-1')
    expect(baseOf(placed, 166873)).toBe('saison2-2')
    expect(baseOf(placed, 178789)).toBe('saison3')
  })

  it('ne prend pas « Alternative Gun Gale Online » pour la suite de Sword Art Online', () => {
    const placed = placeSeasons(
      site(
        ['saison1', 'Saison 1'],
        ['saison2', 'Saison 2'],
        ['saison3', 'Saison 3'],
        ['saison4', 'Saison 4'],
        ['saison5', 'Alternative Gun Gale Online Saison 1'],
        ['saison6', 'Alternative Gun Gale Online Saison 2']
      ),
      chain(
        [11757, ['Sword Art Online'], 2012, 25],
        [20594, ['Sword Art Online II'], 2014, 24],
        [100182, ['Sword Art Online: Alicization'], 2018, 24],
        [108759, ['Sword Art Online: Alicization - War of Underworld'], 2019, 12],
        [114308, ['Sword Art Online: Alicization - War of Underworld Part 2'], 2020, 11]
      )
    )
    expect([11757, 20594, 100182, 108759, 114308].map((id) => baseOf(placed, id))).toEqual([
      'saison1',
      'saison2',
      'saison3',
      'saison4',
      'saison4'
    ])
  })

  it('garde Naruto dans la version avec fillers', () => {
    const placed = placeSeasons(
      site(['saison1', 'Avec Fillers'], ['saison1hs', 'Sans Fillers'], ['kai', 'Kai']),
      chain([20, ['NARUTO', 'Naruto'], 2002, 220], [1735, ['NARUTO: Shippuuden'], 2007, 500])
    )
    expect(baseOf(placed, 20)).toBe('saison1')
  })

  it('suit les saisons numérotées de Slime, cours compris', () => {
    const placed = placeSeasons(
      site(
        ['saison1', 'Saison 1'],
        ['saison2', 'Saison 2'],
        ['saison3', 'Saison 3'],
        ['saison4', 'Saison 4'],
        ['saison1hs', 'The Slime Diaries']
      ),
      chain(
        [101280, ['Tensei Shitara Slime Datta Ken'], 2018, 24],
        [108511, ['Tensei Shitara Slime Datta Ken 2nd Season'], 2021, 12],
        [116742, ['Tensei Shitara Slime Datta Ken 2nd Season Part 2'], 2021, 12],
        [156822, ['Tensei Shitara Slime Datta Ken 3rd Season'], 2024, 24],
        [182205, ['Tensei Shitara Slime Datta Ken 4th Season Part 1 & 2'], 2026, 24]
      )
    )
    expect([101280, 108511, 116742, 156822, 182205].map((id) => baseOf(placed, id))).toEqual([
      'saison1',
      'saison2',
      'saison2',
      'saison3',
      'saison4'
    ])
    expect(placed.get(116742)?.offset).toBe(12)
  })

  // Le menu relevé dans la fenêtre de lecture tranche un cas que les noms laissent ouvert.
  it('écoute le nombre d’épisodes relevé dans leur menu', () => {
    const sections = site(['saison1', 'Saison 1', 24], ['saison2', 'Saison 2', 12])
    const placed = placeSeasons(
      sections,
      chain([1, ['Show'], 2020, 12], [2, ['Show Part 2'], 2020, 12], [3, ['Show: Next Arc'], 2022, 12])
    )
    expect([1, 2, 3].map((id) => baseOf(placed, id))).toEqual(['saison1', 'saison1', 'saison2'])
  })
})

describe('writtenSeason', () => {
  it('lit les numéros que le titre écrit', () => {
    expect(writtenSeason('Mushoku Tensei: Jobless Reincarnation Season 2')).toBe(2)
    expect(writtenSeason('Tensei Shitara Slime Datta Ken 3rd Season')).toBe(3)
    expect(writtenSeason('Mushoku Tensei II: Isekai Ittara Honki Dasu')).toBe(2)
    expect(writtenSeason('Sword Art Online II')).toBe(2)
  })

  it('ne lit rien là où le titre n’en écrit pas', () => {
    expect(writtenSeason('Kimetsu no Yaiba: Yuukaku-hen')).toBeNull()
    expect(writtenSeason('Kaiju No. 8')).toBeNull()
    expect(writtenSeason('Dragon Ball Super: Beerus')).toBeNull()
  })
})

describe('writtenPart', () => {
  it('lit « Part » et « Cour »', () => {
    expect(writtenPart('Mushoku Tensei: Isekai Ittara Honki Dasu Part 2')).toBe(2)
    expect(writtenPart('Mushoku Tensei: Jobless Reincarnation Cour 2')).toBe(2)
    expect(writtenPart('Sword Art Online')).toBeNull()
  })
})

describe('belongs', () => {
  const dbs = ['Dragon Ball Super', 'Doragon boru supa', 'DBS']

  it('reconnaît une fiche de la série par ses noms chez eux', () => {
    expect(belongs(dbs, ['Dragon Ball Super: Beerus'])).toBe(true)
    expect(belongs(['Demon Slayer', 'Kimetsu no Yaiba'], ['Kimetsu no Yaiba: Yuukaku-hen'])).toBe(true)
  })

  it('écarte une fiche d’une autre série de la franchise', () => {
    expect(belongs(dbs, ['Dragon Ball Z'])).toBe(false)
    expect(belongs(dbs, ['Dragon Ball'])).toBe(false)
  })
})
