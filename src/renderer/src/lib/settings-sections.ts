import { t } from '@shared/i18n'
/**
 * Les sections des Réglages, dans leur ordre.
 *
 * Partagées avec la palette (`Ctrl+K`) : on y tape « discord » ou « sous-titres »
 * et on arrive sur la bonne carte, sans parcourir la page à la molette. Les mots
 * clés sont ceux qu'on chercherait, pas forcément ceux du titre.
 */
export const SETTINGS_SECTIONS = [
  {
    id: 'apparence',
    title: t('Apparence'),
    keywords: t('thème couleur accent disposition mica nouveau design expérience mouvement animation badge son trophée')
  },
  { id: 'affichage', title: t('Affichage'), keywords: t('titres langue romaji anglais semaine lundi durée adulte') },
  { id: 'notifications', title: t('Notifications'), keywords: t('rappel alerte diffusion délai sortie épisode') },
  {
    id: 'lecture',
    title: t('Lecture'),
    keywords: t(
      'lecteur coche automatique enchaîner épisode suivant anime-sama opening générique navigateur chrome firefox edge adn franime'
    )
  },
  { id: 'suites', title: t('Suites'), keywords: t('saison suivante ajout automatique franchise') },
  {
    id: 'telecommande',
    title: t('Télécommande'),
    keywords: t('téléphone qr code mobile mot de passe calendrier ics agenda abonnement diffusions')
  },
  { id: 'discord', title: t('Statut Discord'), keywords: t('discord rich presence profil') },
  { id: 'traduction', title: t('Traduction'), keywords: t('résumé français traduire deepl') },
  { id: 'suivis', title: t('Ce que tu suis'), keywords: t('studio doubleur suivre muets') },
  {
    id: 'donnees',
    title: t('Mes données'),
    keywords: t(
      'import export sauvegarde automatique copie datée rotation restaurer tv time myanimelist anilist kitsu cache santé raccourcis clavier dossier effacer'
    )
  },
  { id: 'a-propos', title: t('À propos'), keywords: t('version mise à jour auteur') }
] as const

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]['id']

/** Sans casse ni accents : « telecommande » doit trouver « Télécommande ». */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/**
 * Masque les lignes qui ne répondent pas à la recherche.
 *
 * Par le DOM plutôt que par l'état : les cartes mêlent des lignes simples et
 * des blocs sur mesure, et faire remonter à chacune « je corresponds » aurait
 * voulu dire réécrire la page. Rend les sections encore visibles.
 *
 * Le contrat que la page doit tenir : `data-settings-section` et
 * `data-keywords` sur chaque section, `data-settings-row` sur chaque ligne.
 */
export function filterSettings(root: HTMLElement, query: string): Set<string> | null {
  const needle = fold(query.trim())
  const sections = root.querySelectorAll<HTMLElement>('[data-settings-section]')
  if (!needle) {
    sections.forEach((section) => {
      section.hidden = false
      section.querySelectorAll<HTMLElement>('[data-settings-row]').forEach((row) => (row.hidden = false))
    })
    return null
  }
  const visible = new Set<string>()
  sections.forEach((section) => {
    const whole = fold(section.dataset.keywords ?? '').includes(needle)
    let any = whole
    section.querySelectorAll<HTMLElement>('[data-settings-row]').forEach((row) => {
      const hit = whole || fold(row.textContent ?? '').includes(needle)
      row.hidden = !hit
      if (hit) any = true
    })
    section.hidden = !any
    if (any) visible.add(section.dataset.settingsSection ?? '')
  })
  return visible
}
