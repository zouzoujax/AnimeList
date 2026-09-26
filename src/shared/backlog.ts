/**
 * « Ce qu'il te reste » : les durées en heures.
 *
 * « 6 j 12 h » se lisait comme des jours de calendrier, alors qu'il s'agit de
 * 156 heures d'épisodes enchaînés. Pur et testé.
 */

/** Des minutes en heures rondes : « 156 h » plutôt que « 6 j 12 h ». */
export function hoursLabel(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`
  return `${Math.round(minutes / 60).toLocaleString('fr-FR')} h`
}
