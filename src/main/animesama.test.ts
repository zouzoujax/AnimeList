import { describe, expect, it } from 'vitest'
import { languagesIn, searchUrl, slugOf } from './animesama'

// Relevés sur anime-sama.to après la refonte de novembre 2026.
describe('languagesIn', () => {
  it('lit les deux langues d’une saison', () => {
    const body = '<script>\nvar languesDispo = ["vostfr","vf"];\nvar lecteursInfos = {};\n</script>'
    expect(languagesIn(body)).toEqual(['vostfr', 'vf'])
  })

  // Tomb Raider King propose aussi une version coréenne, que l'app ne sait pas ouvrir.
  it('écarte les langues inconnues de l’app', () => {
    expect(languagesIn('var languesDispo = ["vostfr","vf","vkr"];')).toEqual(['vostfr', 'vf'])
  })

  it('garde l’ordre de l’app, pas celui de la page', () => {
    expect(languagesIn('var languesDispo = ["vf","vostfr"];')).toEqual(['vostfr', 'vf'])
  })

  it('ne lit rien sur une page qui ne les déclare pas', () => {
    expect(languagesIn('<!DOCTYPE html><html><body>Attention Required! | Cloudflare</body></html>')).toEqual([])
  })

  it('ne lit rien d’une liste illisible', () => {
    expect(languagesIn('var languesDispo = [vostfr];')).toEqual([])
  })
})

describe('slugOf', () => {
  it('lit le slug d’une saison, d’une section et de la page de la série', () => {
    expect(slugOf('https://anime-sama.to/catalogue/naruto/saison1/vostfr/')).toBe('naruto')
    expect(slugOf('https://anime-sama.to/catalogue/kaiju-n8/oav/vostfr/')).toBe('kaiju-n8')
    expect(slugOf('https://anime-sama.to/catalogue/re-zero/')).toBe('re-zero')
  })

  it('ne lit rien dans une recherche', () => {
    expect(slugOf('https://anime-sama.to/catalogue/?search=Naruto')).toBeNull()
  })
})

describe('searchUrl', () => {
  it('escapes the term', () => {
    expect(searchUrl('Kaiju No. 8')).toBe('https://anime-sama.to/catalogue/?search=Kaiju%20No.%208')
  })
})
