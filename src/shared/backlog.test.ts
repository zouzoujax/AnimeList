import { describe, expect, it } from 'vitest'
import { forecastBacklog, hoursLabel, spanLabel } from './backlog'

const DAY = 86_400_000
const now = new Date(2026, 8, 26, 20).getTime()
const today = new Date(2026, 8, 26).getTime()
/** Des journées actives, `n` jours avant aujourd'hui. */
const ago = (...n: number[]): number[] => n.map((d) => today - d * DAY)

describe('forecastBacklog', () => {
  it('compte les journées de visionnage au rythme des journées actives', () => {
    const f = forecastBacklog(19_680, 7 * 85, ago(0, 1, 2, 3, 4, 5, 6), now)
    expect(f.perActiveDay).toBe(85)
    expect(f.viewingDays).toBe(232)
  })

  it('étale ces journées au calendrier selon la fréquence', () => {
    // Un jour sur deux depuis 20 jours : 3,5 jours par semaine, deux fois plus long.
    const days = ago(0, 2, 4, 6, 8, 10, 12, 14, 16, 18)
    const f = forecastBacklog(1_000, 10 * 100, days, now)
    expect(f.viewingDays).toBe(10)
    expect(f.perWeek).toBeCloseTo((10 / 19) * 7)
    expect(f.calendarDays).toBe(Math.ceil((10 * 7) / f.perWeek))
  })

  it('mesure la fréquence sur les 90 derniers jours seulement', () => {
    // Très assidu il y a un an, deux soirs ces trois derniers mois.
    const old = Array.from({ length: 60 }, (_, i) => 300 + i)
    const f = forecastBacklog(600, 62 * 60, [...ago(...old), ...ago(5, 40)], now)
    expect(f.perWeek).toBeCloseTo((2 / 90) * 7)
  })

  it('signale une projection faite sur trop peu de journées', () => {
    expect(forecastBacklog(600, 7 * 60, ago(0, 1, 2, 3, 4, 5, 6), now).thin).toBe(true)
    expect(forecastBacklog(600, 14 * 60, ago(...Array.from({ length: 14 }, (_, i) => i)), now).thin).toBe(false)
  })

  it('ne projette rien sans journée regardée', () => {
    const f = forecastBacklog(600, 0, [], now)
    expect(f.viewingDays).toBeNull()
    expect(f.calendarDays).toBeNull()
    expect(f.thin).toBe(false)
  })
})

describe('libellés', () => {
  it('dit l’ordre de grandeur', () => {
    expect(spanLabel(9)).toBe('9 jours')
    expect(spanLabel(30)).toBe('4 semaines')
    expect(spanLabel(232)).toBe('environ 8 mois')
    expect(spanLabel(400)).toBe('environ 1 an')
    expect(spanLabel(694)).toBe('environ 2 ans')
    expect(spanLabel(900)).toBe('environ 2,5 ans')
  })

  it('écrit les durées en heures', () => {
    expect(hoursLabel(9_384)).toBe('156 h')
    expect(hoursLabel(45)).toBe('45 min')
    expect(hoursLabel(120_000)).toBe('2 000 h'.replace(' ', ' '))
  })
})
