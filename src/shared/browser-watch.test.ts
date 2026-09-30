import { describe, expect, it } from 'vitest'
import {
  animeSamaFromLevelDb,
  episodeFromStorage,
  franimeEpisodeFromUrls,
  franimeFromUrl,
  matchSeries,
  readLevelDbLog,
  readMediaTitle,
  sideEntryFromStorage,
  storedEpisodes
} from './browser-watch'

describe('readMediaTitle', () => {
  it('lit ADN : série et épisode', () => {
    expect(readMediaTitle('Doomed Megalopolis - 1 OAV 1 : La Cité du démon - streaming - VOSTFR - ADN')).toEqual({
      site: 'adn',
      title: 'Doomed Megalopolis',
      season: null,
      episode: 1
    })
  })

  it('lit une saison ADN écrite en français', () => {
    expect(readMediaTitle('Mushoku Tensei Saison 2 - 12 Épisode 12 : Retour - streaming - VF - ADN')).toEqual({
      site: 'adn',
      title: 'Mushoku Tensei',
      season: 2,
      episode: 12
    })
  })

  it('lit FrAnime sans croire l’épisode du titre', () => {
    // Relevé réel : le titre disait EP5 pendant que l'adresse disait ep=8.
    const tail = " VOSTFR - FRAnime.fr #1 DE L'ANIME SANS PUB ET GRATUIT"
    expect(readMediaTitle('Chainsmoker Cat S1 EP5' + tail)).toEqual({
      site: 'franime',
      title: 'Chainsmoker Cat',
      season: 1,
      episode: null
    })
    expect(readMediaTitle('Chainsmoker Cat S1' + tail)?.episode).toBeNull()
  })

  it('lit Anime-Sama, qui ne donne pas l’épisode', () => {
    expect(
      readMediaTitle(
        "Tomb Raider King - Saison 1 | Anime-Sama - Streaming et catalogage d'animes et scans.",
        'ansembed.net'
      )
    ).toEqual({ site: 'anime-sama', title: 'Tomb Raider King', season: 1, episode: null })
  })

  it('lit la section des films et des OAV d’Anime-Sama', () => {
    expect(readMediaTitle("Naruto - Film | Anime-Sama - Streaming et catalogage d'animes et scans.")).toEqual({
      site: 'anime-sama',
      title: 'Naruto',
      season: null,
      episode: null,
      section: 'film'
    })
    expect(readMediaTitle('Kaiju No. 8 - OAV | Anime-Sama - Streaming')?.section).toBe('oav')
  })

  it('reconnaît Crunchyroll sans jamais inventer d’épisode', () => {
    expect(readMediaTitle('Frieren Episode 5 - Crunchyroll')).toMatchObject({ site: 'crunchyroll', episode: null })
  })

  it('ignore la musique et YouTube', () => {
    expect(readMediaTitle('Tmax 530', 'Maes — Réelle vie 2.0')).toBeNull()
    expect(
      readMediaTitle('Bruit blanc de ventilation (CVC) – Sommeil profond (10 heures)', 'Comfort in Sounds')
    ).toBeNull()
  })
})

describe('matchSeries', () => {
  const library = [
    { id: 1, title: { romaji: 'Overlord', english: 'Overlord' } },
    { id: 2, title: { romaji: 'Overlord II', english: 'Overlord II' } },
    { id: 3, title: { romaji: 'Teito Monogatari', english: 'Doomed Megalopolis' } },
    { id: 4, title: { romaji: 'Tomb Raider King', english: null } }
  ]

  it('retrouve une série par son titre anglais ou romaji', () => {
    expect(matchSeries({ title: 'Doomed Megalopolis', season: null }, library)).toBe(3)
    expect(matchSeries({ title: 'Tomb Raider King', season: 1 }, library)).toBe(4)
  })

  it('départage les saisons', () => {
    expect(matchSeries({ title: 'Overlord', season: 1 }, library)).toBe(1)
    expect(matchSeries({ title: 'Overlord', season: 2 }, library)).toBe(2)
  })

  it('reconnaît un titre raccourci avant les deux-points', () => {
    const found = [
      { id: 10, title: { romaji: 'Sousou no Frieren', english: 'Frieren: Beyond Journey’s End' } },
      { id: 11, title: { romaji: 'Mushoku Tensei', english: 'Mushoku Tensei: Jobless Reincarnation Season 2' } },
      { id: 12, title: { romaji: 'Overlord: Sei Oukoku-hen', english: 'Overlord: The Sacred Kingdom' } }
    ]
    expect(matchSeries({ title: 'Frieren', season: null }, found)).toBe(10)
    expect(matchSeries({ title: 'Mushoku Tensei', season: 2 }, found)).toBe(11)
    // Le titre complet passe devant le début d'un autre.
    expect(matchSeries({ title: 'Overlord', season: 1 }, [...found, ...library])).toBe(1)
  })

  it('ne rapproche pas deux séries différentes', () => {
    expect(matchSeries({ title: 'Chainsmoker Cat', season: 1 }, library)).toBeNull()
  })
})

describe('sideEntryFromStorage', () => {
  // Relevé dans Firefox : la section des films de Naruto.
  const rows = storedEpisodes([
    { key: 'savedEpNb/catalogue/naruto/film/vf/', value: '0', rank: 0 },
    { key: 'savedEpNb/catalogue/naruto/film/vostfr/', value: '2', rank: 0 },
    { key: 'savedEpName/catalogue/naruto/film/vostfr/', value: '"Mission spéciale au pays de la Lune"', rank: 0 },
    { key: 'savedEpNb/catalogue/naruto/saison1/vostfr/', value: '9', rank: 0 }
  ])

  it('rend l’entrée par son nom, et sa place à partir de 1', () => {
    expect(sideEntryFromStorage(rows, ['Naruto'], 'film')).toEqual({
      slug: 'naruto',
      index: 3,
      name: 'Mission spéciale au pays de la Lune'
    })
  })

  it('ne confond pas les films avec les OAV ni les saisons', () => {
    expect(sideEntryFromStorage(rows, ['Naruto'], 'oav')).toBeNull()
  })
})

describe('episodeFromStorage', () => {
  // Relevé dans Firefox : seule la VOSTFR a avancé.
  const firefox = storedEpisodes([
    { key: 'savedEpNb/catalogue/tomb-raider-king/saison1/vkr/', value: '0', rank: 0 },
    { key: 'savedEpNb/catalogue/tomb-raider-king/saison1/vf/', value: '0', rank: 0 },
    { key: 'savedEpNb/catalogue/tomb-raider-king/saison1/vostfr/', value: '2', rank: 0 },
    { key: 'savedEpName/catalogue/tomb-raider-king/saison1/vostfr/', value: '"Episode 3"', rank: 0 },
    { key: 'savedEpNb/catalogue/overlord/saison2/vf/', value: '12', rank: 0 },
    { key: 'savedEpName/catalogue/overlord/saison2/vf/', value: '"Episode 13"', rank: 0 }
  ])

  it('prend la langue qui avance', () => {
    expect(episodeFromStorage(firefox, ['Tomb Raider King'], 1)).toBe(3)
  })

  it('respecte la saison', () => {
    expect(episodeFromStorage(firefox, ['Overlord'], 2)).toBe(13)
    expect(episodeFromStorage(firefox, ['Overlord'], 1)).toBeNull()
  })

  it('préfère la plus récente quand on la connaît', () => {
    const rows = storedEpisodes([
      { key: 'savedEpNb/catalogue/tomb-raider-king/saison1/vostfr/', value: '5', rank: 10 },
      { key: 'savedEpNb/catalogue/tomb-raider-king/saison1/vf/', value: '1', rank: 20 }
    ])
    expect(episodeFromStorage(rows, ['Tomb Raider King'], 1)).toBe(2)
  })

  it('refuse un épisode intercalé plutôt que de se tromper', () => {
    const rows = storedEpisodes([
      { key: 'savedEpNb/catalogue/sword-art-online/saison2/vf/', value: '14', rank: 0 },
      { key: 'savedEpName/catalogue/sword-art-online/saison2/vf/', value: '"Episode 14.5"', rank: 0 }
    ])
    expect(episodeFromStorage(rows, ['Sword Art Online'], 2)).toBeNull()
  })

  it('reconnaît un slug que le titre ne laisse pas deviner', () => {
    const rows = storedEpisodes([
      { key: 'savedEpNb/catalogue/tensei-shitara-slime-datta-ken/saison4/vf/', value: '3', rank: 0 }
    ])
    expect(episodeFromStorage(rows, ['That Time I Got Reincarnated as a Slime'], 4)).toBeNull()
    expect(
      episodeFromStorage(rows, ['That Time I Got Reincarnated as a Slime', 'tensei-shitara-slime-datta-ken'], 4)
    ).toBe(4)
  })
})

/** Un journal LevelDB minimal : un lot par écriture, chacun dans un fragment complet. */
function levelDbLog(writes: { key: string; value: string | null }[], firstSeq = 100): Uint8Array {
  const bytes: number[] = []
  const latin1 = (s: string): number[] => [...s].map((c) => c.charCodeAt(0))
  const varint = (n: number): number[] => {
    const out: number[] = []
    while (n >= 0x80) {
      out.push((n & 0x7f) | 0x80)
      n >>>= 7
    }
    out.push(n)
    return out
  }
  writes.forEach((w, i) => {
    const seq = firstSeq + i
    const key = [...latin1('_https://anime-sama.to'), 0, 1, ...latin1(w.key)]
    const batch = [seq & 0xff, (seq >> 8) & 0xff, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, w.value === null ? 0 : 1]
    batch.push(...varint(key.length), ...key)
    if (w.value !== null) {
      const value = [1, ...latin1(w.value)]
      batch.push(...varint(value.length), ...value)
    }
    bytes.push(0, 0, 0, 0, batch.length & 0xff, batch.length >> 8, 1, ...batch)
  })
  return Uint8Array.from(bytes)
}

describe('journal LevelDB de Chromium', () => {
  it('lit les écritures dans l’ordre', () => {
    const log = levelDbLog([
      { key: 'savedEpNb/catalogue/tomb-raider-king/saison1/vostfr/', value: '2' },
      { key: 'savedEpNb/catalogue/tomb-raider-king/saison1/vostfr/', value: '3' }
    ])
    expect(readLevelDbLog(log).map((r) => r.seq)).toEqual([100, 101])
  })

  it('garde la dernière valeur, comme Chrome', () => {
    const log = levelDbLog([
      { key: 'savedEpNb/catalogue/tomb-raider-king/saison1/vostfr/', value: '2' },
      { key: 'savedEpName/catalogue/tomb-raider-king/saison1/vostfr/', value: '"Episode 3"' },
      { key: 'savedEpNb/catalogue/tomb-raider-king/saison1/vostfr/', value: '3' },
      { key: 'savedEpName/catalogue/tomb-raider-king/saison1/vostfr/', value: '"Episode 4"' },
      { key: '__cfPre_t', value: 'x' }
    ])
    const rows = storedEpisodes(animeSamaFromLevelDb(log))
    expect(episodeFromStorage(rows, ['Tomb Raider King'], 1)).toBe(4)
  })

  it('oublie une clé effacée', () => {
    const log = levelDbLog([
      { key: 'savedEpNb/catalogue/overlord/saison1/vf/', value: '4' },
      { key: 'savedEpNb/catalogue/overlord/saison1/vf/', value: null }
    ])
    expect(animeSamaFromLevelDb(log)).toEqual([])
  })

  it('ignore une écriture coupée en fin de fichier', () => {
    const log = levelDbLog([{ key: 'savedEpNb/catalogue/overlord/saison1/vf/', value: '4' }])
    expect(readLevelDbLog(log.subarray(0, log.length - 3))).toEqual([])
  })
})

describe('adresses FrAnime', () => {
  const seen = { title: 'Chainsmoker Cat', season: 1 }

  it('lit l’épisode dans l’adresse', () => {
    expect(franimeFromUrl('franime.fr/anime/chainsmoker-cat?s=1&ep=4&lang=vo&anime_id=50551')).toEqual({
      slug: 'chainsmoker-cat',
      season: 1,
      episode: 4
    })
    expect(franimeFromUrl('https://franime.fr/anime/chainsmoker-cat')).toBeNull()
  })

  it('ne garde que la série et la saison en lecture', () => {
    const urls = [
      'idlebound.kisukesaama.com/fr/play',
      'franime.fr/anime/chainsmoker-cat?s=1&ep=4&lang=vo',
      'franime.fr/anime/overlord?s=1&ep=9&lang=vf'
    ]
    expect(franimeEpisodeFromUrls(urls, seen)).toBe(4)
    expect(franimeEpisodeFromUrls(urls, { title: 'Chainsmoker Cat', season: 2 })).toBeNull()
  })

  it('ne tranche pas entre deux fenêtres qui se contredisent', () => {
    const urls = ['franime.fr/anime/chainsmoker-cat?s=1&ep=3', 'franime.fr/anime/chainsmoker-cat?s=1&ep=4']
    expect(franimeEpisodeFromUrls(urls, seen)).toBeNull()
  })
})
