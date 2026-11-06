/**
 * Le menu d'épisodes d'une page Anime-Sama, comparé à ce qu'AniList annonce.
 *
 * Leur liste d'épisodes ne se lit plus hors d'un navigateur : `episodes.js`
 * répond 403 à l'app. La fenêtre de lecture, elle, la voit — c'est leur page,
 * dans un vrai navigateur. Elle relève donc leur menu, et ce relevé dit si la
 * saison ouverte est la bonne : le remake de Dragon Ball Super, quatre
 * épisodes sortis, ouvrait une page qui en comptait 131.
 *
 * Pur et testé : le relevé arrive en texte, rien ici ne touche à la page.
 */

/** Ce qu'AniList annonce de la fiche ouverte. */
export interface Expected {
  /** Le total officiel, ou à défaut celui du calendrier ; `null` si personne ne le sait. */
  total: number | null
  /** Les épisodes déjà diffusés ; `null` quand on l'ignore. */
  aired: number | null
}

export type MenuVerdict =
  | { kind: 'ok' }
  /** Bien plus long que prévu : une autre saison, ou toute la série. */
  | { kind: 'long'; found: number; expected: number }
  /** Bien plus court que ce qui est sorti : une partie seulement, ou une autre saison. */
  | { kind: 'short'; found: number; expected: number }

/**
 * Le menu est-il celui de la fiche ?
 *
 * Large de propos : leur menu compte parfois un épisode récapitulatif ou un
 * « 12.5 », et une saison en cours y arrive avec un ou deux épisodes de
 * retard. Seul un écart qui ne s'explique pas ainsi est relevé.
 */
export function judgeMenu(found: number, expected: Expected): MenuVerdict {
  if (found <= 0) return { kind: 'ok' }

  const planned = expected.total ?? expected.aired
  if (planned && found > planned + Math.max(2, Math.ceil(planned * 0.25))) {
    return { kind: 'long', found, expected: planned }
  }

  const out = expected.aired ?? expected.total
  if (out && found < Math.floor(out / 2) - 1) return { kind: 'short', found, expected: out }

  return { kind: 'ok' }
}
