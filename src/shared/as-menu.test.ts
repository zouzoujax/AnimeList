import { describe, expect, it } from 'vitest'
import { judgeMenu } from './as-menu'

describe('judgeMenu', () => {
  // Le Dragon Ball Super de 2015 ouvert pour le remake de 2026.
  it('relève une saison bien plus longue que prévue', () => {
    expect(judgeMenu(131, { total: 12, aired: 4 })).toEqual({ kind: 'long', found: 131, expected: 12 })
  })

  // Mushoku Tensei : la saison 2 en deux parties, dont on n'ouvrirait que la première.
  it('relève une saison bien plus courte que ce qui est sorti', () => {
    expect(judgeMenu(5, { total: 25, aired: 25 })).toEqual({ kind: 'short', found: 5, expected: 25 })
  })

  it('accepte un épisode récapitulatif en plus', () => {
    expect(judgeMenu(13, { total: 12, aired: 12 })).toEqual({ kind: 'ok' })
  })

  it('accepte une saison en cours qui a un épisode de retard', () => {
    expect(judgeMenu(3, { total: null, aired: 4 })).toEqual({ kind: 'ok' })
  })

  it('ne juge rien quand AniList ne sait rien', () => {
    expect(judgeMenu(131, { total: null, aired: null })).toEqual({ kind: 'ok' })
  })

  it('ne juge rien d’un menu vide, que la page n’a pas encore rempli', () => {
    expect(judgeMenu(0, { total: 12, aired: 12 })).toEqual({ kind: 'ok' })
  })

  // One Piece : un menu de mille épisodes et plus, sans surprise.
  it('accepte une longue série au bon compte', () => {
    expect(judgeMenu(1120, { total: null, aired: 1122 })).toEqual({ kind: 'ok' })
  })
})
