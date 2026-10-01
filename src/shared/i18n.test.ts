import { afterEach, describe, expect, it } from 'vitest'
import translations from './locales/translations.json'
import { lazy, locale, monthNames, setUiLang, t, tx, uiLang } from './i18n'

const table = translations as Record<string, string[]>

afterEach(() => setUiLang('fr'))

describe('t', () => {
  it('rend le français tel quel, variables remplies', () => {
    expect(uiLang()).toBe('fr')
    expect(t('Ces 7 jours')).toBe('Ces 7 jours')
    expect(t('Épisode {episode}', { episode: 3 })).toBe('Épisode 3')
  })

  it('traduit dans la langue choisie', () => {
    setUiLang('en')
    expect(t('Ces 7 jours')).toBe('Last 7 days')
    setUiLang('ja')
    expect(t('Épisode {episode}', { episode: 3 })).toBe('第3話')
  })

  it('retombe sur le français pour un texte sans traduction', () => {
    setUiLang('de')
    expect(t('Une phrase que personne n’a traduite')).toBe('Une phrase que personne n’a traduite')
  })

  it('laisse une variable absente visible plutôt que de la taire', () => {
    expect(t('Épisode {episode}')).toBe('Épisode {episode}')
  })
})

describe('tx', () => {
  it('distingue deux sens d’un même mot, sans toucher au français', () => {
    expect(tx('relation', 'Précédent')).toBe('Précédent')
    setUiLang('en')
    expect(tx('relation', 'Précédent')).toBe('Prequel')
    expect(t('Précédent')).toBe('Previous')
  })
})

describe('lazy', () => {
  it('reconstruit la table au changement de langue', () => {
    const labels = lazy(() => ({ done: t('Terminé') }))
    expect(labels.done).toBe('Terminé')
    setUiLang('es')
    expect(labels.done).toBe('Terminado')
    expect(Object.keys(labels)).toEqual(['done'])
  })
})

describe('dates', () => {
  it('suit la langue choisie', () => {
    setUiLang('de')
    expect(locale()).toBe('de-DE')
    expect(monthNames()[0]).toBe('Januar')
  })
})

describe('translations.json', () => {
  const vars = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
  // Variables qui ne portent qu'un « s » : une langue sans pluriel les omet.
  const optional = /^(v\d+|s|plural\d?)$/

  it('a quatre traductions non vides par clé', () => {
    for (const [key, row] of Object.entries(table)) {
      expect(row, key).toHaveLength(4)
      for (const text of row) expect(text.trim(), key).not.toBe('')
    }
  })

  it('ne perd ni n’invente de variable', () => {
    for (const [key, row] of Object.entries(table)) {
      const wanted = vars(key)
      for (const text of row) {
        const used = vars(text)
        for (const name of used) expect(wanted, `${key} → ${text}`).toContain(name)
        for (const name of wanted) if (!optional.test(name)) expect(used, `${key} → ${text}`).toContain(name)
      }
    }
  })
})
