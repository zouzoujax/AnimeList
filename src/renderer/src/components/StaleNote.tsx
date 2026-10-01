import { ageLabel } from '@shared/api-recovery'
import { useNow } from '@/lib/hooks'
import { t } from '@shared/i18n'

/**
 * La ligne qui dit qu'une page est servie depuis le cache, et de quand.
 *
 * « Dernière version enregistrée » ne disait pas si elle datait d'une heure ou
 * d'une semaine — or c'est toute la question devant un épisode annoncé pour
 * « ce soir ». La page se relira d'elle-même au retour d'AniList.
 */
export function StaleNote({ at, what = t('ce qui suit') }: { at: number | null; what?: string }): React.JSX.Element {
  const now = useNow(60_000)
  const age = at ? t(', enregistrée {v0}', { v0: ageLabel(at, now) }) : ''
  return (
    <p role="status" className="mb-4 px-1 text-[0.8rem] text-muted">
      {t('Pas de connexion à AniList :')} {what} {t('est la dernière version')}
      {age}
      {t('. La page se mettra à jour toute seule au retour du service.')}
    </p>
  )
}
