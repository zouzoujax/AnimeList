/**
 * Vérifie que l'app relie encore les bonnes saisons chez Anime-Sama.
 *
 *   npm run check:anime-sama
 *
 * Lance l'app dans un dossier de données jetable avec `--check-anime-sama` :
 * elle rejoue son résolveur sur les séries témoins de `src/main/as-check.ts`,
 * écrit le rapport et se ferme. La vraie bibliothèque n'est jamais lue.
 *
 * À lancer après une refonte de leur site, ou avant une release qui touche au
 * résolveur. Une trentaine de requêtes à AniList : à ne pas enchaîner avec
 * une série de captures, qui partage la même limite.
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'animelist-check-'))
const electron = join('node_modules', 'electron', 'dist', 'electron.exe')
const child = spawn(electron, ['.', `--user-data-dir=${dir}`, '--check-anime-sama'], { stdio: 'inherit' })

child.on('exit', (code) => {
  // Synchrone : `process.exit` couperait une suppression en cours.
  rmSync(dir, { recursive: true, force: true })
  process.exit(code ?? 1)
})
