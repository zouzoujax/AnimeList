/**
 * La lecture, dans les statistiques.
 *
 * À part des chiffres du visionnage, et sans les mêler : un chapitre ne dure
 * rien de connu, l'additionner à des heures ne voudrait rien dire. Absente
 * tant qu'aucun manga n'est suivi — une section de zéros n'apprend rien.
 */

import { BookCheck, BookOpen, CalendarDays, Library } from 'lucide-react'
import { useMemo } from 'react'
import { readingStats } from '@shared/reading'
import { MonthlyColumns, StatTile } from '@/components/Charts'
import { Section } from '@/components/ui'
import { monthLabel, num } from '@/lib/format'
import { useNow } from '@/lib/hooks'
import { useApp } from '@/store/app'
import { t, locale } from '@shared/i18n'

export function ReadingStats(): React.JSX.Element | null {
  const entries = useApp((s) => s.mangaEntries)
  const reads = useApp((s) => s.reads)
  const navigate = useApp((s) => s.navigate)
  const now = useNow(3_600_000)

  const stats = useMemo(() => readingStats([...entries.values()], reads, now), [entries, reads, now])
  if (!stats.total) return null

  const months = stats.months.map((m) => ({
    // L'abréviation d'usage : trois lettres confondaient juin et juillet.
    label: new Date(m.year, m.month, 1).toLocaleDateString(locale(), { month: 'short' }),
    value: m.chapters,
    detail: t('{v0} · {v1} chapitre{v2}', {
      v0: monthLabel(new Date(m.year, m.month, 1)),
      v1: num(m.chapters),
      v2: m.chapters > 1 ? 's' : ''
    })
  }))
  const read = stats.months.some((m) => m.chapters > 0)

  return (
    <Section
      id="lecture"
      title={t('Lecture')}
      subtitle={t('{v0} manga{v1} suivi{v2} · rattrapages comptés au total, pas au mois', {
        v0: num(stats.total),
        v1: stats.total > 1 ? 's' : '',
        v2: stats.total > 1 ? 's' : ''
      })}
      action={
        <button className="chip shrink-0" onClick={() => navigate({ name: 'manga' })}>
          <BookOpen size={13} />
          {t('Ma lecture')}
        </button>
      }
    >
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={t('Chapitres lus')} value={num(stats.chapters)} icon={<BookOpen size={15} />} />
        <StatTile
          label={t('Ce mois-ci')}
          value={num(stats.thisMonth)}
          hint={t('{v0} jour{v1} de lecture en tout', {
            v0: num(stats.activeDays),
            v1: stats.activeDays > 1 ? 's' : ''
          })}
          icon={<CalendarDays size={15} />}
        />
        <StatTile
          label={t('En lecture')}
          value={num(stats.byStatus.watching)}
          hint={t('{v0} à lire · {v1} en pause', { v0: num(stats.byStatus.planned), v1: num(stats.byStatus.paused) })}
          icon={<Library size={15} />}
        />
        <StatTile
          label={t('Lus')}
          value={num(stats.byStatus.completed)}
          hint={
            stats.volumes > 0 ? t('{n} tome{s}', { n: num(stats.volumes), s: stats.volumes > 1 ? 's' : '' }) : undefined
          }
          icon={<BookCheck size={15} />}
        />
      </div>
      {read && (
        <div className="glass rounded-[20px] p-5">
          <MonthlyColumns data={months} unit={t('Chapitres lus par mois')} />
        </div>
      )}
    </Section>
  )
}
