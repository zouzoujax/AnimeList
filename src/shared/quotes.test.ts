import { describe, expect, it } from 'vitest'
import { pickQuote, quoteMatches, type Quote } from './quotes'

const q = (text: string): Quote => ({ text, character: 'Kakashi', anime: 'Naruto', animeId: 20 })

describe('quoteMatches', () => {
  it('reconnaît la série sous ses deux titres, ponctuation et accents à part', () => {
    expect(quoteMatches(['Naruto'], ['NARUTO', 'Naruto'])).toBe(true)
    expect(quoteMatches(['Shingeki no Kyojin'], ['Shingeki no Kyojin Season 3', 'Attack on Titan Season 3'])).toBe(true)
    expect(quoteMatches(['Kaguya-sama wa Kokurasetai'], ['Kaguya-sama wa Kokurasetai?'])).toBe(true)
  })

  it('refuse une autre série ramenée par une recherche trop large', () => {
    expect(quoteMatches(['Boruto: Naruto Next Generations'], ['Gintama'])).toBe(false)
  })

  it('ne valide pas sur un titre trop court', () => {
    expect(quoteMatches(['K'], ['K-On!'])).toBe(false)
  })
})

describe('pickQuote', () => {
  const quotes = [q('c'), q('a'), q('b')]

  it('rend la même citation toute la journée', () => {
    expect(pickQuote(quotes, new Date(2026, 9, 3, 8))).toEqual(pickQuote(quotes, new Date(2026, 9, 3, 23, 59)))
  })

  it('en change le lendemain, et les passe toutes avant d’en revoir une', () => {
    const days = [3, 4, 5].map((d) => pickQuote(quotes, new Date(2026, 9, d))?.text)
    expect(new Set(days).size).toBe(3)
  })

  it('ne dépend pas de l’ordre de la réserve', () => {
    const day = new Date(2026, 9, 3)
    expect(pickQuote([...quotes].reverse(), day)).toEqual(pickQuote(quotes, day))
  })

  it('rend null sans citation', () => {
    expect(pickQuote([], new Date())).toBeNull()
  })
})
