/**
 * L'aide des raccourcis.
 *
 * Ils étaient documentés dans le README, c'est-à-dire nulle part pour qui se
 * sert de l'app. Le clic droit sur un épisode, en particulier, n'est
 * découvrable par personne : rien à l'écran ne l'annonce.
 *
 * La liste est écrite ici plutôt que dérivée du code : un raccourci se décrit
 * par ce qu'il fait, pas par la touche qu'il intercepte, et les gestes à la
 * souris n'ont aucune existence dans un gestionnaire de clavier.
 */

import { useEffect } from 'react'
import { Keyboard } from 'lucide-react'
import { Modal } from './ui'
import { t } from '@shared/i18n'

interface Shortcut {
  keys: string[]
  label: string
  /** Ce qu'on ne devinerait pas seul. */
  hint?: string
}

const GROUPS: { title: string; rows: Shortcut[] }[] = [
  {
    title: t('Partout'),
    rows: [
      { keys: ['Ctrl', 'K'], label: t('Ouvrir la recherche'), hint: t('Ta bibliothèque, AniList et la navigation') },
      {
        keys: ['Ctrl', '1…8'],
        label: t('Aller à une page du menu'),
        hint: t('Accueil, Découvrir, Bibliothèque, Manga, Calendrier, Statistiques, Journal, Réglages')
      },
      { keys: ['Alt', '←'], label: t('Revenir en arrière'), hint: t('Ou le bouton « précédent » de la souris') },
      { keys: ['Alt', '→'], label: t('Revenir en avant'), hint: t('Ou le bouton « suivant » de la souris') },
      {
        keys: ['Ctrl', 'Z'],
        label: t('Annuler la dernière coche'),
        hint: t('Cocher, cocher jusque-là, réinitialiser')
      },
      { keys: ['?'], label: t('Cette fenêtre') },
      { keys: ['Échap'], label: t('Fermer ce qui est ouvert') }
    ]
  },
  {
    title: t('Dans la recherche'),
    rows: [
      { keys: ['↑', '↓'], label: t('Parcourir les résultats') },
      { keys: ['⏎'], label: t('Ouvrir le résultat choisi') }
    ]
  },
  {
    title: t('Sur la grille des épisodes'),
    rows: [
      { keys: ['Clic'], label: t('Cocher ou décocher un épisode') },
      { keys: ['Maj', 'Clic'], label: t('Cocher tout jusqu’à cet épisode') },
      { keys: ['Clic droit'], label: t('Éditer un visionnage'), hint: t('Date, durée, ressenti, note') },
      { keys: ['▶'], label: t('Ouvrir l’épisode chez une plateforme'), hint: t('Au survol d’un épisode diffusé') }
    ]
  },
  {
    title: t('Dans le lecteur'),
    rows: [
      { keys: ['Espace'], label: t('Lecture ou pause') },
      { keys: ['Échap'], label: t('Fermer'), hint: t('Un clic à côté de la vidéo ferme aussi') }
    ]
  }
]

function Key({ children }: { children: string }): React.JSX.Element {
  return (
    <kbd
      className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-[6px] border px-1.5 text-[0.7rem] font-semibold"
      style={{ borderColor: 'var(--line-2)', background: 'var(--panel)', color: 'var(--color-ink)' }}
    >
      {children}
    </kbd>
  )
}

export default function Shortcuts({ open, onClose }: { open: boolean; onClose: () => void }): React.JSX.Element {
  return (
    <Modal open={open} onClose={onClose} width={560}>
      <div className="flex items-center gap-2.5 border-b px-5 py-4" style={{ borderColor: 'var(--line)' }}>
        <Keyboard size={17} style={{ color: 'var(--accent)' }} />
        <div>
          <p className="text-[1rem] font-semibold">{t('Raccourcis')}</p>
          <p className="mt-0.5 text-[0.75rem] text-faint">{t('Clavier et souris')}</p>
        </div>
      </div>

      <div className="max-h-[58vh] overflow-y-auto px-5 py-4">
        {GROUPS.map((group) => (
          <section key={group.title} className="mb-4 last:mb-0">
            <p className="label mb-2">{group.title}</p>
            <div className="flex flex-col gap-1.5">
              {group.rows.map((row) => (
                <div key={row.label} className="flex items-baseline gap-3">
                  <span className="flex shrink-0 items-center gap-1">
                    {row.keys.map((key) => (
                      <Key key={key}>{key}</Key>
                    ))}
                  </span>
                  <span className="min-w-0 flex-1 text-[0.82rem]">
                    {row.label}
                    {row.hint && <span className="block text-[0.7rem] text-faint">{row.hint}</span>}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="flex justify-end border-t px-5 py-3" style={{ borderColor: 'var(--line)' }}>
        <button className="btn" onClick={onClose}>
          {t('Fermer')}
        </button>
      </div>
    </Modal>
  )
}

/**
 * `?` ouvre l'aide, sauf en train d'écrire.
 *
 * Sur un clavier français le point d'interrogation se tape sans Maj, donc le
 * moindre champ de saisie ferait surgir la fenêtre en plein mot.
 */
export function useShortcutsKey(onOpen: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== '?') return
      const el = document.activeElement
      const typing =
        el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement)?.isContentEditable
      if (typing) return
      e.preventDefault()
      onOpen()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onOpen])
}
