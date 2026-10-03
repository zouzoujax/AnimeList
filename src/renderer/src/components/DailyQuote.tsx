/**
 * La citation du jour : une réplique tirée d'une série de la bibliothèque.
 *
 * Elle vient d'AnimeChan, en anglais — la langue où le site les recueille. On
 * ne la traduit pas : une réplique traduite deux fois ne dit plus la même
 * chose. Rien ne s'affiche tant qu'il n'y en a pas, ni si le réglage est coupé.
 */

import { Quote as QuoteIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Quote } from '@shared/quotes'
import { useApp } from '@/store/app'
import { t } from '@shared/i18n'

export function DailyQuote(): React.JSX.Element | null {
  const enabled = useApp((s) => s.prefs.dailyQuote !== false)
  const navigate = useApp((s) => s.navigate)
  const [quote, setQuote] = useState<Quote | null>(null)

  useEffect(() => {
    if (!enabled) return
    let alive = true
    window.api.anime
      .quote()
      .then((q) => alive && setQuote(q))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [enabled])

  if (!enabled || !quote) return null

  return (
    <figure className="glass span-all mb-9 flex gap-4 rounded-[22px] px-5 py-4">
      <QuoteIcon size={18} className="mt-0.5 shrink-0 text-faint" aria-hidden />
      <div className="min-w-0">
        <p className="label mb-1.5">{t('Citation du jour')}</p>
        <blockquote lang="en" className="text-[0.92rem] leading-relaxed italic">
          {quote.text}
        </blockquote>
        <figcaption className="mt-2 text-[0.78rem] text-muted">
          {t('— {character}, dans', { character: quote.character })}{' '}
          <button
            className="underline-offset-2 hover:underline"
            onClick={() => navigate({ name: 'anime', id: quote.animeId })}
          >
            {quote.anime}
          </button>
        </figcaption>
      </div>
    </figure>
  )
}
