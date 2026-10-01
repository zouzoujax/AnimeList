/**
 * The Electron side of the TV Time / OpenTV importer: pick a folder, run the
 * engine, push progress to the window, merge the result into the store.
 *
 * Everything that can be decided without Electron lives in the sibling modules;
 * this file only wires them to dialogs, the AniList client and the store.
 */

import { BrowserWindow, dialog } from 'electron'
import type { TvTimeProgress, TvTimeReport } from '@shared/types'
import { importById, importFranchise, importSearch } from '../anilist'
import { getPrefs, importSnapshot, setPrefs } from '../store'
import { EXPECTED_FILES, locateExport } from './folder'
import { parseExport } from './read'
import { runImport } from './run'
import { t } from '@shared/i18n'

/** Only one import at a time; a second would fight the first over the queue. */
let running = false
let cancelled = false

function empty(message: string, over: Partial<TvTimeReport> = {}): TvTimeReport {
  return {
    ok: false,
    message,
    added: 0,
    updated: 0,
    episodes: 0,
    skipped: 0,
    shows: [],
    folder: null,
    cancelled: false,
    ...over
  }
}

/** Asks for a folder, defaulting to the last one used. */
async function pickFolder(win: BrowserWindow): Promise<string | null> {
  const res = await dialog.showOpenDialog(win, {
    title: t('Choisir le dossier de l’export TV Time / OpenTV'),
    defaultPath: getPrefs().tvtimeFolder ?? undefined,
    properties: ['openDirectory'],
    buttonLabel: t('Analyser ce dossier')
  })
  return res.canceled ? null : (res.filePaths[0] ?? null)
}

export function cancelImport(): void {
  if (running) cancelled = true
}

export async function importTvTime(win: BrowserWindow, folderArg?: string | null): Promise<TvTimeReport> {
  if (running) return empty(t('Un import est déjà en cours.'))

  const root = folderArg ?? (await pickFolder(win))
  if (!root) return empty(t('Import annulé'))

  running = true
  cancelled = false
  const send = (progress: TvTimeProgress): void => {
    if (!win.isDestroyed()) win.webContents.send('tvtime:progress', progress)
  }

  try {
    const found = await locateExport(root)
    if (!found) {
      return empty(
        t('Aucun export trouvé dans ce dossier. Il doit contenir {v0}, ', { v0: EXPECTED_FILES.join(' et ') }) +
          t('à la racine ou dans un sous-dossier.')
      )
    }

    const shows = parseExport(found)
    if (!shows.length) {
      return empty(t('Export lisible, mais il ne contient aucune série suivie.'), { folder: found.folder })
    }

    const outcome = await runImport(shows, {
      search: importSearch,
      searchFranchise: importFranchise,
      fetchById: importById,
      overrides: getPrefs().tvtimeOverrides,
      isCancelled: () => cancelled,
      onProgress: (done, total, label) => send({ done, total, label })
    })

    if (outcome.entries.length) {
      importSnapshot(
        { version: 1, entries: outcome.entries, media: outcome.media, history: outcome.history, prefs: {} as never },
        'merge'
      )
    }
    setPrefs({ tvtimeFolder: found.folder })

    const unmatched = outcome.shows.filter((s) => s.status === 'unmatched').length
    const partial = outcome.shows.filter((s) => s.status === 'partial').length
    const parts = [
      t('{length} fiches et {length1} épisodes importés', {
        length: outcome.entries.length,
        length1: outcome.history.length
      })
    ]
    if (unmatched)
      parts.push(t('{unmatched} série{v1} sans correspondance', { unmatched, v1: unmatched > 1 ? 's' : '' }))
    if (partial) parts.push(t('{partial} partiellement placée{v1}', { partial, v1: partial > 1 ? 's' : '' }))

    return {
      ok: true,
      message: cancelled ? t('Import interrompu — {v0}.', { v0: parts.join(', ') }) : `${parts.join(', ')}.`,
      added: outcome.entries.length,
      updated: 0,
      episodes: outcome.history.length,
      skipped: unmatched,
      shows: outcome.shows,
      folder: found.folder,
      cancelled
    }
  } catch (err) {
    return empty(t('Import interrompu : {message}', { message: (err as Error).message }))
  } finally {
    running = false
    cancelled = false
    send({ done: 0, total: 0, label: '' })
  }
}
