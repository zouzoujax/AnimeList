/**
 * La langue de l'interface.
 *
 * Le français est la langue d'écriture de l'app : il sert lui-même de clé. Un
 * texte s'écrit `t('Ces 7 jours')`, et une langue qui n'a pas (encore) sa
 * traduction retombe sur le français plutôt que sur une clé illisible.
 *
 * Changer de langue recharge la fenêtre. Beaucoup de libellés sont des
 * constantes de module (thèmes, badges, sections des réglages) évaluées une
 * seule fois au chargement : les rendre réactifs aurait demandé de réécrire
 * chacune. La langue est donc connue avant le premier module, via le préchargement.
 */

import translations from './locales/translations.json'

export type UiLang = 'fr' | 'en' | 'es' | 'ja' | 'de'

export const UI_LANGS: { id: UiLang; label: string; locale: string }[] = [
  { id: 'fr', label: 'Français', locale: 'fr-FR' },
  { id: 'en', label: 'English', locale: 'en-US' },
  { id: 'es', label: 'Español', locale: 'es-ES' },
  { id: 'ja', label: '日本語', locale: 'ja-JP' },
  { id: 'de', label: 'Deutsch', locale: 'de-DE' }
]

/** Ordre des colonnes dans `translations.json`. */
const COLUMNS: UiLang[] = ['en', 'es', 'ja', 'de']

const table = translations as Record<string, string[]>

export const isUiLang = (value: unknown): value is UiLang => UI_LANGS.some((l) => l.id === value)

/** Dans la fenêtre, le préchargement l'a déjà posée ; ailleurs, le français. */
function initial(): UiLang {
  const fromPreload = (globalThis as { uiLang?: unknown }).uiLang
  return isUiLang(fromPreload) ? fromPreload : 'fr'
}

let current: UiLang = initial()

export const uiLang = (): UiLang => current

/** Le processus principal la règle au démarrage et à chaque changement. */
export function setUiLang(lang: UiLang): void {
  current = lang
}

/** Pour `toLocaleDateString` et `Intl` : la langue choisie, pas celle du système. */
export const locale = (): string => UI_LANGS.find((l) => l.id === current)?.locale ?? 'fr-FR'

/**
 * Une table de libellés qui suit la langue.
 *
 * Dans la fenêtre, la langue est fixée avant le premier module. Le processus
 * principal, lui, ne la connaît qu'après avoir lu ses réglages — bien après
 * l'évaluation de ses tables. Celles-ci se reconstruisent donc au premier
 * accès qui suit un changement de langue.
 */
export function lazy<T extends object>(build: () => T): T {
  let lang = current
  let value = build()
  const now = (): T => {
    if (lang !== current) {
      value = build()
      lang = current
    }
    return value
  }
  return new Proxy(value, {
    get: (_target, key) => Reflect.get(now(), key),
    has: (_target, key) => Reflect.has(now(), key),
    ownKeys: () => Reflect.ownKeys(now()),
    getOwnPropertyDescriptor: (_target, key) => Reflect.getOwnPropertyDescriptor(now(), key)
  })
}

/**
 * Traduit un texte français. `{nom}` est remplacé par `vars.nom`, dans toutes
 * les langues : l'ordre des mots change d'une langue à l'autre, pas les noms.
 */
export function t(fr: string, vars?: Record<string, string | number | null | undefined>): string {
  const column = COLUMNS.indexOf(current)
  const text = column < 0 ? fr : table[fr]?.[column] || fr
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name] ?? '') : whole))
}

/** Les douze mois dans la langue choisie, de janvier à décembre. */
export const monthNames = (style: 'long' | 'short' = 'long'): string[] =>
  Array.from({ length: 12 }, (_, m) => new Date(2000, m, 1).toLocaleDateString(locale(), { month: style }))

/** Les jours, dimanche d'abord comme `Date.getDay()` (le 2 janvier 2000 était un dimanche). */
export const dayNames = (style: 'long' | 'short' = 'long'): string[] =>
  Array.from({ length: 7 }, (_, d) => new Date(2000, 0, 2 + d).toLocaleDateString(locale(), { weekday: style }))
