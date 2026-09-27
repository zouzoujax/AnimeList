/**
 * La dernière série passée « terminée », pour le téléphone.
 *
 * La fenêtre repère ce moment de son côté et ouvre « Et maintenant ? ». Le
 * téléphone, lui, n'a que ses requêtes : il lui faut quelqu'un au PC qui s'en
 * souvienne et qu'il puisse interroger. Même règle que la fenêtre — une série
 * qui passe « terminée » dans une écriture, et une seule à la fois : un import
 * ou un « tout marquer » en termine vingt, et ce n'est pas une fin de série.
 *
 * Tenu en mémoire seulement : une fin annoncée la veille n'a plus rien à dire.
 */

import type { LibraryStatus } from '@shared/types'
import { snapshot, store } from './store'

export interface Finished {
  id: number
  /** Le moment où on l'a vue passer, pour que le téléphone ne l'annonce qu'une fois. */
  at: number
}

let last: Finished | null = null
let statuses = new Map<number, LibraryStatus>()
let timer: ReturnType<typeof setTimeout> | null = null

const read = (): Map<number, LibraryStatus> => new Map(snapshot().entries.map((e) => [e.animeId, e.status]))

function compare(): void {
  timer = null
  const fresh = read()
  const done = [...fresh].filter(([id, status]) => status === 'completed' && statuses.get(id) !== 'completed')
  statuses = fresh
  if (done.length === 1) last = { id: done[0][0], at: Date.now() }
}

/** Groupé comme dans la fenêtre : une coche écrit parfois deux fois de suite. */
const onChange = (): void => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(compare, 120)
}

export function lastFinished(): Finished | null {
  return last
}

export function startFinishedWatch(): () => void {
  statuses = read()
  store.on('change', onChange)
  return () => {
    store.off('change', onChange)
    if (timer) clearTimeout(timer)
    timer = null
  }
}
