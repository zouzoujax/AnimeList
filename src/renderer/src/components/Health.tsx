/**
 * Le bilan de santé, dans les Réglages.
 *
 * Il ne s'ouvre que sur demande : rien ici n'est urgent, et regarder coûte un
 * balayage de tout l'historique. Ce qui est trouvé est montré tel quel, et rien
 * n'est réparé sans un clic — le nettoyage est une décision.
 */

import { useState } from 'react'
import { CircleCheck, Loader, Stethoscope, Trash2, TriangleAlert } from 'lucide-react'
import type { HealthReport } from '@shared/types'
import { Modal } from './ui'
import { useApp } from '@/store/app'
import { t } from '@shared/i18n'
import { dec } from '@/lib/format'

function weight(bytes: number): string {
  const ko = bytes / 1024
  return ko >= 1024 ? t('{v0} Mo', { v0: dec(ko / 1024) }) : t('{v0} Ko', { v0: Math.round(ko) })
}

function Finding({
  ok,
  label,
  detail,
  action
}: {
  ok: boolean
  label: string
  detail: string
  action?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-start gap-3 border-t py-3 first:border-t-0" style={{ borderColor: 'var(--line)' }}>
      {ok ? (
        <CircleCheck size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--accent-2)' }} />
      ) : (
        <TriangleAlert size={15} className="mt-0.5 shrink-0" style={{ color: '#ffb038' }} />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[0.83rem] font-medium">{label}</p>
        <p className="mt-0.5 text-[0.74rem] leading-snug text-faint">{detail}</p>
      </div>
      {action}
    </div>
  )
}

export default function Health({ open, onClose }: { open: boolean; onClose: () => void }): React.JSX.Element {
  const [report, setReport] = useState<HealthReport | null>(null)
  const [busy, setBusy] = useState(false)
  const toast = useApp((s) => s.toast)

  const scan = async (): Promise<void> => {
    setBusy(true)
    setReport(await window.api.health.report())
    setBusy(false)
  }

  const orphans = report?.orphanEvents.reduce((sum, row) => sum + row.count, 0) ?? 0

  return (
    <Modal open={open} onClose={onClose} width={620}>
      <div className="flex items-center gap-2.5 border-b px-5 py-4" style={{ borderColor: 'var(--line)' }}>
        <Stethoscope size={17} style={{ color: 'var(--accent)' }} />
        <div className="flex-1">
          <p className="text-[1rem] font-semibold">{t('Santé de la bibliothèque')}</p>
          <p className="mt-0.5 text-[0.75rem] text-faint">
            {report
              ? t('{entries} séries, {events} visionnages', { entries: report.entries, events: report.events })
              : t('Rien de tout ceci n’est urgent')}
          </p>
        </div>
        <button className="btn" disabled={busy} onClick={() => void scan()}>
          {busy ? <Loader size={14} className="animate-spin" /> : <Stethoscope size={14} />}
          {report ? t('Relire') : t('Examiner')}
        </button>
      </div>

      <div className="max-h-[56vh] overflow-y-auto px-5 py-2">
        {!report ? (
          <p className="py-8 text-center text-[0.82rem] text-muted">
            {t('L’examen parcourt tout l’historique. Il ne modifie rien.')}
          </p>
        ) : (
          <>
            <Finding
              ok={report.missingMedia.length === 0}
              label={t('Fiches manquantes')}
              detail={
                report.missingMedia.length === 0
                  ? t('Chaque série suivie a sa fiche AniList.')
                  : t(
                      '{length} série{v1} sans fiche : sans titre ni jaquette, et invisible dans la bibliothèque. Ouvrir la fiche depuis la recherche la rétablit.',
                      { length: report.missingMedia.length, v1: report.missingMedia.length > 1 ? 's' : '' }
                    )
              }
            />

            <Finding
              ok={orphans === 0}
              label={t('Visionnages orphelins')}
              detail={
                orphans === 0
                  ? t('Tous les visionnages appartiennent à une série suivie.')
                  : t(
                      '{orphans} visionnage{v1} rattaché{v2} à une série effacée. Ils comptent encore dans le temps total.',
                      { orphans, v1: orphans > 1 ? 's' : '', v2: orphans > 1 ? 's' : '' }
                    )
              }
              action={
                orphans > 0 ? (
                  <button
                    className="btn shrink-0 !h-8"
                    onClick={() =>
                      void window.api.health.cleanOrphans().then(async (n) => {
                        toast(
                          t('{n} visionnage{v1} effacé{v2}.', { n, v1: n > 1 ? 's' : '', v2: n > 1 ? 's' : '' }),
                          'ok'
                        )
                        await scan()
                      })
                    }
                  >
                    <Trash2 size={13} />
                    {t('Nettoyer')}
                  </button>
                ) : undefined
              }
            />

            <Finding
              ok={report.beyondTotal.length === 0}
              label={t('Épisodes au-delà du total')}
              detail={
                report.beyondTotal.length === 0
                  ? t('Aucune série ne compte plus d’épisodes qu’elle n’en a.')
                  : report.beyondTotal
                      .slice(0, 3)
                      .map((row) =>
                        t('{title} : {highest} coché pour {total} annoncés', {
                          title: row.title,
                          highest: row.highest,
                          total: row.total
                        })
                      )
                      .join(' · ')
              }
            />

            <Finding
              ok={report.duplicates.length === 0}
              label={t('Doublons')}
              detail={
                report.duplicates.length === 0
                  ? t('Aucune série suivie deux fois.')
                  : report.duplicates
                      .slice(0, 3)
                      .map((row) => t('{title} ({length} entrées)', { title: row.title, length: row.ids.length }))
                      .join(' · ')
              }
            />

            <Finding
              ok={report.strayFiles.length === 0}
              label={t('Fichiers résiduels')}
              detail={
                report.strayFiles.length === 0
                  ? t('Le dossier de données ne contient que ce qui sert.')
                  : t('{length} fichier{v1} d’avant une migration ou une correction, tous vieux de plus d’un mois.', {
                      length: report.strayFiles.length,
                      v1: report.strayFiles.length > 1 ? 's' : ''
                    })
              }
            />

            {report.strayFiles.map((file) => (
              <div
                key={file.name}
                className="flex items-center gap-3 border-t py-2 pl-6"
                style={{ borderColor: 'var(--line)' }}
              >
                <span className="min-w-0 flex-1 truncate text-[0.74rem] text-muted" title={file.name}>
                  {file.name}
                </span>
                <span className="shrink-0 text-[0.7rem] tabular-nums text-faint">
                  {weight(file.bytes)} · {t('{n} j', { n: file.age })}
                </span>
                <button
                  className="btn !h-7 shrink-0 !px-2 text-[0.7rem]"
                  onClick={() =>
                    void window.api.health.removeStray(file.name).then(async (ok) => {
                      toast(ok ? t('Fichier supprimé.') : t('Suppression refusée.'), ok ? 'ok' : 'error')
                      await scan()
                    })
                  }
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="flex justify-end border-t px-5 py-3" style={{ borderColor: 'var(--line)' }}>
        <button className="btn" onClick={onClose}>
          {t('Fermer')}
        </button>
      </div>
    </Modal>
  )
}
