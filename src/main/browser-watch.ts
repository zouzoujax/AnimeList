/**
 * Cocher ce qu'on regarde dans son propre navigateur.
 *
 * Chrome, Edge, Opera et Firefox déclarent leurs vidéos à Windows — c'est
 * l'encart qui apparaît quand on monte le volume. Un PowerShell tenu ouvert
 * relit cette liste toutes les trois secondes et la passe ici : titre,
 * position, durée. `@shared/browser-watch` en tire la série et l'épisode ;
 * la règle des neuf dixièmes est celle du lecteur intégré, `@shared/binge`.
 *
 * Anime-Sama ne dit pas l'épisode dans son titre. Leur page le range dans le
 * stockage local du navigateur, que celui-ci écrit sur le disque : c'est là
 * qu'on le relit, et seulement là — uniquement leurs clés, et seulement au
 * moment de cocher. D'où le réglage éteint par défaut : l'app lit dans les
 * profils des navigateurs, cela ne se fait pas sans qu'on l'ait demandé.
 *
 * Rien ne sort du PC, rien n'est écrit chez les navigateurs.
 */

import { app, BrowserWindow, Notification } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { appendFileSync, copyFileSync, existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { canTick } from '@shared/airing'
import { compact } from '@shared/titles'
import { shouldTick, type Playing } from '@shared/binge'
import {
  animeSamaFromLevelDb,
  episodeFromStorage,
  franimeEpisodeFromUrls,
  matchSeries,
  readMediaTitle,
  sideEntryFromStorage,
  SITE_LABELS,
  storedEpisodes,
  type SideSection,
  type BrowserFind,
  type BrowserReviewBatch,
  type BrowserTick,
  type Seen
} from '@shared/browser-watch'
import type { Media } from '@shared/types'
import { browse, cachedMedia, detail, refreshMedia, relationsOf } from './anilist'
import { isSideFormat, type Entry } from '@shared/as-sections'
import { searchTitles } from '@shared/titles'
import { cachedSideTarget, knownSlug, resolve as resolveAnimeSama } from './animesama'
import { getMedia, getPrefs, isTracked, isWatched, setWatched, snapshot } from './store'
import { t as tr } from '@shared/i18n'

/**
 * Ce que le suivi a compris d'une lecture : de quoi expliquer une coche qui ne
 * vient pas. Rien dans l'app ne l'affiche ; un outil de diagnostic peut s'y
 * brancher par `onDetections`.
 */
export interface Detection {
  browser: string
  site: string
  /** Le titre tel que le navigateur l'a donné à Windows. */
  raw: string
  /** La série de la bibliothèque, ou `null` si aucune ne correspond. */
  series: string | null
  season: number | null
  episode: number | null
  /** D'où vient l'épisode : titre, adresse, stockage du navigateur. */
  source: string | null
  /** Pour un film ou un OAV : son nom dans la section, à la place de la saison et de l'épisode. */
  film?: string
  position: number
  duration: number
  playing: boolean
  /** La décision, en clair. */
  state: string
}

/** Qui écoute les comptes-rendus ; `null` : le suivi est éteint. */
let listener: ((list: Detection[] | null) => void) | null = null

/** Branche un outil de diagnostic sur chaque relevé. */
export function onDetections(fn: ((list: Detection[] | null) => void) | null): void {
  listener = fn
}

function showDetections(list: Detection[] | null): void {
  listener?.(list)
}

/**
 * Vrai quand quelqu'un regarde les comptes-rendus : le stockage d'Anime-Sama
 * est alors lu avant la fin, pour qu'ils disent déjà quel épisode joue.
 */
const monitorOpen = (): boolean => listener !== null

/** Ce que PowerShell rapporte d'une session média. */
interface Sample {
  app: string
  title: string
  artist: string
  playing: boolean
  /** Secondes, au moment `updated`. */
  position: number
  duration: number
  /** Millisecondes Unix du dernier relevé de position par le navigateur. */
  updated: number
}

const POLL_S = 3

/**
 * Relit les sessions média de Windows en boucle, une ligne JSON par tour.
 *
 * Quand FrAnime joue, il relit aussi les barres d'adresse des navigateurs :
 * Firefox n'y met pas l'épisode dans son titre, l'adresse si (`ep=4`). Seul
 * l'onglet actif de chaque fenêtre se lit, et seulement celles des
 * navigateurs — une fenêtre Electron porte la même classe que Chrome.
 *
 * S'arrête tout seul si l'app disparaît sans avoir pu le fermer : un
 * PowerShell orphelin tournerait jusqu'au redémarrage.
 */
export function pollScript(parent: number): string {
  return `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime, UIAutomationClient, UIAutomationTypes
$A = [System.Windows.Automation.AutomationElement]
$Scope = [System.Windows.Automation.TreeScope]
$firefoxBar = New-Object System.Windows.Automation.PropertyCondition($A::AutomationIdProperty, 'urlbar-input')
$edit = New-Object System.Windows.Automation.PropertyCondition($A::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)
function Urls {
  $urls = @()
  foreach ($w in $A::RootElement.FindAll($Scope::Children, [System.Windows.Automation.Condition]::TrueCondition)) {
    try {
      $cls = $w.Current.ClassName
      if ($cls -eq 'MozillaWindowClass') { $bar = $w.FindFirst($Scope::Descendants, $firefoxBar) }
      elseif ($cls -eq 'Chrome_WidgetWin_1' -and (Get-Process -Id $w.Current.ProcessId).ProcessName -match '^(chrome|msedge|opera|brave)$') { $bar = $w.FindFirst($Scope::Descendants, $edit) }
      else { continue }
      if ($bar) { $urls += [string]$bar.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value }
    } catch {}
  }
  return ,$urls
}
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
while ($true) {
  if (-not (Get-Process -Id ${parent} -ErrorAction SilentlyContinue)) { exit }
  $out = @()
  foreach ($s in $mgr.GetSessions()) {
    try {
      $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
      $tl = $s.GetTimelineProperties()
      $out += [pscustomobject]@{
        app = [string]$s.SourceAppUserModelId
        title = [string]$p.Title
        artist = [string]$p.Artist
        playing = ([string]$s.GetPlaybackInfo().PlaybackStatus -eq 'Playing')
        position = $tl.Position.TotalSeconds
        duration = $tl.EndTime.TotalSeconds
        updated = $tl.LastUpdatedTime.ToUnixTimeMilliseconds()
      }
    } catch {}
  }
  $urls = @()
  if ($out | Where-Object { $_.title -match 'FRAnime' }) { $urls = Urls }
  [Console]::Out.WriteLine((ConvertTo-Json -InputObject ([pscustomobject]@{ sessions = @($out); urls = @($urls) }) -Compress -Depth 4))
  [Console]::Out.Flush()
  Start-Sleep -Seconds ${POLL_S}
}
`
}

let child: ChildProcess | null = null
let restart: NodeJS.Timeout | null = null
/**
 * Les épisodes déjà cochés par ce suivi, `série:épisode`.
 *
 * C'est l'épisode qui fait la clé, pas la lecture : chez Anime-Sama le titre
 * ne change pas d'un épisode à l'autre, et qui saute d'une fin d'épisode à la
 * fin du suivant ne repasse jamais sous les neuf dixièmes entre deux relevés.
 * Un épisode décoché à la main n'est pas recoché pour autant.
 */
const ticked = new Set<string>()
/** L'épisode FrAnime relevé dans l'adresse pendant la lecture, par session. */
const armed = new Map<string, number>()
/** Les lectures déjà signalées — série inconnue, épisode introuvable — pour ne le dire qu'une fois. */
const reported = new Set<string>()
/** Les coches pas encore montrées dans l'app, dans l'ordre. */
let review: BrowserTick[] = []
/** Les séries inconnues regardées, en attente d'un « ajouter » ou d'un « ignorer ». */
let finds: BrowserFind[] = []
/**
 * Ce qu'AniList a répondu pour un titre inconnu : une série, ou `null` si
 * rien de sûr. Une seule recherche par titre et par session — la limite est
 * de trente requêtes par minute, et une série regardée revient à chaque épisode.
 */
const lookups = new Map<string, Promise<Media | null>>()
/** Les titres Crunchyroll déjà notés, pour n'écrire chacun qu'une fois. */
const noted = new Set<string>()

/**
 * Rend les coches pas encore montrées, et les oublie.
 *
 * L'app les demande quand sa fenêtre reprend la main : c'est là qu'on revient
 * après avoir regardé ailleurs.
 */
export function takeReview(): BrowserReviewBatch {
  const out = { ticks: review, finds }
  review = []
  finds = []
  return out
}

/** Prévient l'app qu'il y a du nouveau à montrer. */
function announce(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('browser-watch:ticked')
  }
}

/** La série AniList derrière un titre inconnu, si le titre et la saison concordent. */
function lookUp(seen: Seen): Promise<Media | null> {
  const key = `${compact(seen.title)}|${seen.season ?? 1}`
  let pending = lookups.get(key)
  if (!pending) {
    pending = browse({ kind: 'search', search: seen.title, perPage: 10 }, getPrefs().showAdult, 'background')
      .then((res) => {
        const id = matchSeries(seen, res.items)
        return res.items.find((m) => m.id === id) ?? null
      })
      .catch(() => {
        // AniList coupé ou limité : on pourra réessayer au prochain épisode.
        lookups.delete(key)
        return null
      })
    lookups.set(key, pending)
  }
  return pending
}

/**
 * Propose d'ajouter une série inconnue : cherchée sur AniList, jamais ajoutée
 * sans accord. Une même série et un même épisode ne sont proposés qu'une fois.
 */
function propose(seen: Seen, episode: number): void {
  void lookUp(seen).then((media) => {
    if (media) offer(media, episode, seen)
  })
}

/** Met une série retrouvée en attente d'un « ajouter » ou d'un « ignorer ». */
function offer(media: Media, episode: number, seen: Seen): void {
  const tick = `${media.id}:${episode}`
  if (ticked.has(tick) || isTracked(media.id)) return
  if (!canTick(media, episode, false)) return
  ticked.add(tick)
  finds.push({ media, episode, site: SITE_LABELS[seen.site], at: Date.now() })
  console.warn(
    `[browser-watch] ${SITE_LABELS[seen.site]} : « ${seen.title} » proposée (${media.id}), épisode ${episode}`
  )
  announce()
}

type SideEntry = { slug: string; index: number | null; name: string | null }

/** Le film de chaque entrée déjà cherchée : `pending` tant que la recherche tourne. */
const sides = new Map<string, { pending: boolean; media: Media | null }>()

/** Deux entrées de la même section désignent le même film. */
function sameEntry(known: Entry, seen: SideEntry): boolean {
  if (seen.name) return compact(known.name) === compact(seen.name)
  return known.index === seen.index
}

/**
 * Le film AniList derrière une entrée de la section, cherché une fois.
 *
 * Dans l'ordre, du moins coûteux au plus coûteux : les films de la
 * bibliothèque que l'app a déjà situés chez Anime-Sama ; ceux de la
 * bibliothèque qui portent le nom de la série, résolus comme la fiche le
 * ferait ; enfin, les films de la franchise trouvés sur AniList, pour les
 * proposer.
 */
function sideMedia(title: string, section: SideSection, entry: SideEntry): { pending: boolean; media: Media | null } {
  const key = `${entry.slug}|${section}|${entry.name ?? entry.index}`
  const known = sides.get(key)
  if (known) return known
  const slot = { pending: true, media: null as Media | null }
  sides.set(key, slot)

  const inSection = (url: string): boolean => new RegExp(`/catalogue/${entry.slug}/${section}[^/]*/`).test(url)
  const wanted = compact(title)
  // Les films vivent dans « Films », les OAV et spéciaux dans « OAV ».
  const fits = (m: Media): boolean =>
    section === 'film' ? m.format === 'MOVIE' : isSideFormat(m.format) && m.format !== 'MOVIE'
  const related = (m: Media): boolean =>
    fits(m) && [m.title.english, m.title.romaji].some((t) => !!t && compact(t).includes(wanted))

  const find = async (): Promise<Media | null> => {
    const library = snapshot().media.filter((m) => isTracked(m.id) && fits(m))
    for (const m of library) {
      const hit = cachedSideTarget(m.id)
      if (hit && inSection(hit.url) && sameEntry(hit.entry, entry)) return m
    }
    /** Vrai quand ce film est celui de l'entrée, d'après le résolveur de la fiche. */
    const isIt = async (id: number, titles: string[]): Promise<boolean> => {
      // Le résolveur situe un film d'après son format et sa série mère, qu'il
      // lit dans la fiche : sans elle, il le prend pour une saison et retombe
      // sur une recherche. La fiche est celle que la page d'un film
      // demanderait, gardée en cache de la même façon.
      await detail(id).catch(() => null)
      const known = cachedMedia(id)
      const names = known ? searchTitles(known.title) : titles
      const target = await resolveAnimeSama(id, names).catch(() => null)
      return !!target?.entry && inSection(target.url) && sameEntry(target.entry, entry)
    }

    for (const m of library.filter(related)) if (await isIt(m.id, searchTitles(m.title))) return m

    // Les films de la franchise, pris dans les relations d'AniList plutôt
    // que dans une recherche par titre : « Naruto » ne ramène pas le premier
    // film, et « Dragon Ball » en ramène des dizaines d'autres séries. La
    // série mère, puis les films liés entre eux (suite, préquelle), sur deux
    // niveaux.
    const carrier = await lookUp({ site: 'anime-sama', title, season: 1, episode: null })
    const found = new Map<number, { title: string; date: number }>()
    const seen = new Set<number>()
    let layer = carrier ? [carrier.id] : []
    for (let depth = 0; depth < 3 && layer.length && seen.size < 40; depth += 1) {
      const next: number[] = []
      for (const id of layer) {
        if (seen.has(id)) continue
        seen.add(id)
        for (const edge of await relationsOf(id).catch(() => [])) {
          const format = edge.format
          const ok = section === 'film' ? format === 'MOVIE' : format === 'OVA' || format === 'SPECIAL'
          // Un lien « Personnage » est un crossover, pas un film de la série.
          if (!ok || edge.relationType === 'CHARACTER' || found.has(edge.id) || isTracked(edge.id)) continue
          found.set(edge.id, { title: edge.title, date: edge.date ?? Number.MAX_SAFE_INTEGER })
          next.push(edge.id)
        }
      }
      layer = next
    }

    // Leur section suit l'ordre de sortie : le film à la place de l'entrée
    // est essayé en premier, les autres ensuite.
    const ordered = [...found.entries()].sort((a, b) => a[1].date - b[1].date)
    const guess = entry.index !== null ? ordered.splice(entry.index - 1, 1) : []
    for (const [id, info] of [...guess, ...ordered].slice(0, 25)) {
      if (await isIt(id, [info.title])) return (await refreshMedia([id]).catch(() => []))[0] ?? null
    }
    return null
  }

  void find()
    .then((media) => {
      slot.media = media
    })
    .catch(() => {
      // AniList coupé : on réessaiera au prochain passage.
      sides.delete(key)
    })
    .finally(() => {
      slot.pending = false
    })
  return slot
}

/** Allume ou éteint le suivi selon les réglages. */
export function applyBrowserWatch(): void {
  const on = process.platform === 'win32' && getPrefs().browserWatch
  if (on && !child) start()
  if (!on) stopBrowserWatch()
}

export function stopBrowserWatch(): void {
  if (restart) clearTimeout(restart)
  restart = null
  const proc = child
  child = null
  proc?.kill()
  showDetections(null)
}

function start(): void {
  const encoded = Buffer.from(pollScript(process.pid), 'utf16le').toString('base64')
  const proc = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
    {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore']
    }
  )
  child = proc

  let pending = ''
  proc.stdout?.setEncoding('utf8')
  proc.stdout?.on('data', (chunk: string) => {
    pending += chunk
    let nl = pending.indexOf('\n')
    while (nl >= 0) {
      const line = pending.slice(0, nl).trim()
      pending = pending.slice(nl + 1)
      if (line) onLine(line)
      nl = pending.indexOf('\n')
    }
  })

  proc.on('exit', () => {
    if (child !== proc) return
    // Tombé tout seul : on le relance, sans s'acharner.
    child = null
    restart = setTimeout(() => {
      restart = null
      applyBrowserWatch()
    }, 30_000)
  })
}

function onLine(line: string): void {
  let tour: { sessions: Sample[]; urls: string[] }
  try {
    tour = JSON.parse(line) as { sessions: Sample[]; urls: string[] }
  } catch {
    return
  }
  const seen: Detection[] = []
  for (const sample of tour.sessions ?? []) {
    try {
      const detection = onSample(sample, tour.urls ?? [])
      if (detection) seen.push(detection)
    } catch (err) {
      console.error('[browser-watch]', err)
    }
  }
  showDetections(seen)
}

/** La position à l'instant : un navigateur ne la redonne qu'aux changements d'état. */
function positionNow(sample: Sample): number {
  const drift = sample.playing && sample.updated > 0 ? (Date.now() - sample.updated) / 1000 : 0
  return Math.min(sample.position + Math.max(0, drift), sample.duration)
}

/** Le navigateur, en toutes lettres, pour le compte-rendu. */
function browserLabel(appId: string): string {
  const b = browserOf(appId)
  return b ? { firefox: 'Firefox', chrome: 'Chrome', edge: 'Edge', brave: 'Brave', opera: 'Opera' }[b] : appId
}

/**
 * Traite une lecture : coche si c'est le moment, et dit ce qui a été compris.
 *
 * Le compte-rendu sert au diagnostic (`onDetections`) ; la décision de cocher
 * ne dépend que des règles, que quelqu'un l'écoute ou non.
 */
function onSample(sample: Sample, urls: string[]): Detection | null {
  // La fenêtre Anime-Sama de l'app a son propre suivi, dans `binge.ts`.
  if (/animelist/i.test(sample.app)) return null

  const seen = readMediaTitle(sample.title, sample.artist)
  if (!seen) return null

  const now: Playing = { position: positionNow(sample), duration: sample.duration, playing: sample.playing }
  const report: Detection = {
    browser: browserLabel(sample.app),
    site: SITE_LABELS[seen.site],
    raw: sample.title,
    series: null,
    season: seen.season,
    episode: seen.episode,
    source: seen.episode !== null ? 'titre' : null,
    position: now.position,
    duration: now.duration,
    playing: now.playing,
    state: ''
  }

  if (seen.site === 'crunchyroll') {
    note(sample.title)
    return { ...report, state: tr('Crunchyroll : format pas encore connu, rien n’est coché') }
  }

  const key = `${sample.app}|${sample.title}`
  const ending = shouldTick(now, false)

  // Avant tout rapprochement par titre : « Naruto - Film » n'est pas la série
  // Naruto, et cocher son épisode 1 serait faux.
  if (seen.section) return onSide(sample, seen, now, report, key, ending)

  const candidates = snapshot().media.filter((m) => isTracked(m.id))
  const animeId = matchSeries(seen, candidates)
  const media = animeId !== null ? getMedia(animeId) : undefined
  const title = media ? (media.title.english ?? media.title.romaji) : seen.title
  if (animeId !== null) report.series = title

  // L'épisode d'une adresse se retient pendant que la vidéo joue, pas à la
  // fin : ouvrir la page du suivant change l'adresse alors que Windows montre
  // encore la vidéo d'avant, finie — et c'est le suivant qui était coché,
  // avant même d'être lancé.
  if (!ending && seen.site === 'franime' && seen.episode === null && sample.playing) {
    const episode = franimeEpisodeFromUrls(urls, seen)
    if (episode !== null) armed.set(key, episode)
  }

  // Le stockage d'Anime-Sama n'est lu qu'à la fin, ou quand quelqu'un regarde
  // les comptes-rendus : il peut arriver sur le disque quelques secondes
  // après le changement d'épisode, d'où une relecture à chaque relevé.
  if (report.episode === null) {
    if (seen.site === 'anime-sama' && (ending || monitorOpen())) {
      report.episode = animeSamaEpisode(sample.app, seen, animeId)
      report.source = tr('stockage du navigateur')
    } else if (seen.site === 'franime') {
      const pinned = armed.get(key)
      report.episode = pinned ?? franimeEpisodeFromUrls(urls, seen)
      report.source = pinned !== undefined ? tr('adresse, retenue pendant la lecture') : 'adresse'
    }
    if (report.episode === null) report.source = null
  }

  if (!ending) {
    reported.delete(key)
    const state =
      animeId === null
        ? tr('Pas dans ta bibliothèque')
        : !(now.duration > 0)
          ? tr('Vidéo pas encore chargée')
          : !now.playing
            ? tr('En pause')
            : tr('En cours — cochera à 90 %')
    return { ...report, state }
  }
  // Une vidéo finie ou en pause reste dans la liste de Windows : seule une
  // lecture en cours dit qu'on regarde.
  if (!sample.playing) return { ...report, state: tr('Fin atteinte, mais en pause : rien n’est coché') }

  if (animeId === null) {
    once(key, tr("« {title} » n'est pas dans la bibliothèque", { title: seen.title }), seen)
    if (report.episode === null) return { ...report, state: tr('Pas dans ta bibliothèque, épisode introuvable') }
    propose(seen, report.episode)
    return { ...report, state: tr('Pas dans ta bibliothèque : proposée à ton retour dans l’app') }
  }

  // Jamais deviner : « le suivant de la progression » cochait le 3 quand on
  // avait sauté au 4. Mieux vaut le dire et laisser cocher à la main.
  const episode = report.episode
  if (episode === null) {
    if (once(key, tr('épisode introuvable pour « {title} »', { title: seen.title }), seen)) {
      notify(
        tr('Épisode non reconnu'),
        tr('{title} — fini sur {v1}, mais lequel ? Coche-le dans l’app.', { title, v1: SITE_LABELS[seen.site] })
      )
    }
    return { ...report, state: tr('Épisode introuvable : rien n’est coché') }
  }

  return tickEpisode(animeId, episode, media, title, seen, report)
}

/** Coche, une seule fois par série et par épisode, et le fait savoir. */
function tickEpisode(
  animeId: number,
  episode: number,
  media: Media | undefined,
  title: string,
  seen: Seen,
  report: Detection
): Detection {
  const done = seen.section ? tr('Film coché') : tr('Épisode {episode} coché', { episode })
  const tick = `${animeId}:${episode}`
  if (ticked.has(tick)) return { ...report, state: done }
  ticked.add(tick)
  if (isWatched(animeId, episode))
    return { ...report, state: seen.section ? tr('Déjà vu') : tr('Épisode {episode} déjà vu', { episode }) }
  if (media && !canTick(media, episode, false)) return { ...report, state: tr('Pas encore diffusé : rien n’est coché') }

  setWatched(animeId, episode, true)
  console.warn(`[browser-watch] ${SITE_LABELS[seen.site]} : épisode ${episode} de ${animeId} coché`)
  notify(done, tr('{title} — vu sur {v1}', { title, v1: SITE_LABELS[seen.site] }))
  review.push({ animeId, episode, site: SITE_LABELS[seen.site], at: Date.now() })
  announce()
  return { ...report, state: done }
}

/**
 * Un film ou un OAV chez Anime-Sama.
 *
 * Leur page « Films » les réunit tous ; celui qu'on regarde est l'entrée que
 * le navigateur a retenue, par son nom — « Mission spéciale au pays de la
 * Lune ». Le film AniList se retrouve par le même résolveur que la fiche :
 * celui qui vise cette entrée-là. La recherche prend quelques secondes la
 * première fois ; le relevé suivant trouve la réponse.
 */
function onSide(sample: Sample, seen: Seen, now: Playing, report: Detection, key: string, ending: boolean): Detection {
  const section = seen.section!
  const entry = ending || monitorOpen() ? animeSamaSide(sample.app, seen.title, section) : null
  report.episode = null
  report.season = null
  report.film = entry ? (entry.name ?? `n° ${entry.index}`) : '?'
  report.source = entry ? tr('stockage du navigateur') : null

  const found = entry ? sideMedia(seen.title, section, entry) : undefined
  const media = found?.media ?? undefined
  if (media) report.series = media.title.english ?? media.title.romaji
  const tracked = media ? isTracked(media.id) : false

  if (!ending) {
    reported.delete(key)
    const state = !(now.duration > 0)
      ? tr('Vidéo pas encore chargée')
      : !now.playing
        ? tr('En pause')
        : media && !tracked
          ? tr('Pas dans ta bibliothèque')
          : tr('En cours — cochera à 90 %')
    return { ...report, state }
  }
  if (!sample.playing) return { ...report, state: tr('Fin atteinte, mais en pause : rien n’est coché') }

  if (!entry) {
    if (once(key, tr('entrée introuvable pour « {title} »', { title: seen.title }), seen)) {
      notify(
        tr('Film non reconnu'),
        tr('{title} — fini sur Anime-Sama, mais lequel ? Coche-le dans l’app.', { title: seen.title })
      )
    }
    return { ...report, state: tr('Film introuvable dans le stockage : rien n’est coché') }
  }
  if (!found || found.pending) return { ...report, state: tr('Recherche du film sur AniList…') }
  if (!media) {
    if (once(key, tr('film introuvable pour « {v0} »', { v0: entry.name ?? entry.index }), seen)) {
      notify(
        tr('Film non reconnu'),
        tr('{title} — « {v1} » introuvable sur AniList. Coche-le dans l’app.', {
          title: seen.title,
          v1: entry.name ?? ''
        })
      )
    }
    return { ...report, state: tr('Film introuvable sur AniList : rien n’est coché') }
  }

  if (!tracked) {
    offer(media, 1, seen)
    return { ...report, state: tr('Pas dans ta bibliothèque : proposé à ton retour dans l’app') }
  }
  return tickEpisode(media.id, 1, getMedia(media.id) ?? media, report.series ?? seen.title, seen, report)
}

/** Vrai la première fois qu'une lecture signale ce problème. */
function once(key: string, message: string, seen: Seen): boolean {
  if (reported.has(key)) return false
  reported.add(key)
  console.warn(`[browser-watch] ${SITE_LABELS[seen.site]} : ${message}`)
  return true
}

function notify(title: string, body: string): void {
  if (Notification.isSupported()) new Notification({ title, body, silent: true }).show()
}

/** Les titres que l'app ne sait pas lire, pour en apprendre le format. */
function note(title: string): void {
  if (noted.has(title)) return
  noted.add(title)
  try {
    appendFileSync(
      join(app.getPath('userData'), 'browser-watch.log'),
      `${new Date().toISOString()}\t${title}\n`,
      'utf8'
    )
  } catch {
    // Rien de grave : ce n'est qu'un relevé.
  }
}

// ---- stockage d'Anime-Sama dans les navigateurs ----------------------------

type Browser = 'firefox' | 'chrome' | 'edge' | 'brave' | 'opera'

/** Le navigateur derrière un identifiant de session Windows. */
function browserOf(appId: string): Browser | null {
  const id = appId.toLowerCase()
  if (id.includes('chrome')) return 'chrome'
  if (id.includes('edge')) return 'edge'
  if (id.includes('brave')) return 'brave'
  if (id.includes('opera')) return 'opera'
  // Firefox s'annonce par une empreinte de son dossier d'installation.
  if (id.includes('firefox') || /^[0-9a-f]{16}$/.test(id)) return 'firefox'
  return null
}

/** L'entrée de la section des films ou des OAV que le navigateur a retenue. */
function animeSamaSide(appId: string, title: string, section: SideSection): SideEntry | null {
  const browser = browserOf(appId)
  const order: Browser[] = browser ? [browser] : ['chrome', 'firefox', 'edge', 'opera', 'brave']
  for (const b of order) {
    const pairs = b === 'firefox' ? firefoxPairs() : chromiumPairs(b)
    const entry = sideEntryFromStorage(storedEpisodes(pairs), [title], section)
    if (entry) return entry
  }
  return null
}

function animeSamaEpisode(appId: string, seen: Seen, animeId: number | null): number | null {
  const names = [seen.title, animeId !== null ? knownSlug(animeId) : null].filter((n): n is string => !!n)
  const season = seen.season ?? 1
  const browser = browserOf(appId)
  const order: Browser[] = browser ? [browser] : ['chrome', 'firefox', 'edge', 'opera', 'brave']
  for (const b of order) {
    const pairs = b === 'firefox' ? firefoxPairs() : chromiumPairs(b)
    const episode = episodeFromStorage(storedEpisodes(pairs), names, season)
    if (episode !== null) return episode
  }
  return null
}

function subdirs(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => join(dir, d.name))
  } catch {
    return []
  }
}

/** Les dossiers `Local Storage/leveldb` d'un navigateur Chromium, tous profils. */
function leveldbDirs(browser: Exclude<Browser, 'firefox'>): string[] {
  const local = process.env.LOCALAPPDATA ?? ''
  const roaming = process.env.APPDATA ?? ''
  if (browser === 'opera') {
    return ['Opera Stable', 'Opera GX Stable'].map((d) =>
      join(roaming, 'Opera Software', d, 'Local Storage', 'leveldb')
    )
  }
  const userData = {
    chrome: join(local, 'Google', 'Chrome', 'User Data'),
    edge: join(local, 'Microsoft', 'Edge', 'User Data'),
    brave: join(local, 'BraveSoftware', 'Brave-Browser', 'User Data')
  }[browser]
  return subdirs(userData)
    .filter((d) => /[\\/](Default|Profile \d+)$/.test(d))
    .map((d) => join(d, 'Local Storage', 'leveldb'))
}

/**
 * Les clés d'Anime-Sama dans les journaux Chromium.
 *
 * Seuls les `*.log` sont lus : la dernière écriture y est en clair, et c'est
 * celle de l'épisode qu'on vient d'ouvrir. Une clé déjà tassée dans un `*.ldb`
 * n'est pas retrouvée — on retombe alors sur la progression.
 */
function chromiumPairs(browser: Exclude<Browser, 'firefox'>): { key: string; value: string; rank: number }[] {
  const out: { key: string; value: string; rank: number }[] = []
  for (const dir of leveldbDirs(browser)) {
    if (!existsSync(dir)) continue
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.log'))) {
      try {
        out.push(...animeSamaFromLevelDb(readFileSync(join(dir, name))))
      } catch {
        // Un fichier en cours de rotation : le tour suivant le relira.
      }
    }
  }
  return out
}

/**
 * Les clés d'Anime-Sama dans Firefox : une base SQLite par site et par profil.
 *
 * Firefox la garde ouverte : on en lit une copie. Le site a changé de domaine
 * plusieurs fois (.fr, .si, .to…), et chaque domaine a sa base ; la plus
 * récemment écrite l'emporte.
 */
function firefoxPairs(): { key: string; value: string; rank: number }[] {
  const out: { key: string; value: string; rank: number }[] = []
  const profiles = join(process.env.APPDATA ?? '', 'Mozilla', 'Firefox', 'Profiles')
  for (const profile of subdirs(profiles)) {
    for (const site of subdirs(join(profile, 'storage', 'default'))) {
      if (!/[\\/]https\+\+\+anime-sama\.[a-z]+$/.test(site)) continue
      const file = join(site, 'ls', 'data.sqlite')
      if (!existsSync(file)) continue
      const copy = join(tmpdir(), `animelist-ls-${process.pid}.sqlite`)
      try {
        const rank = statSync(file).mtimeMs
        copyFileSync(file, copy)
        const db = new DatabaseSync(copy, { readOnly: true })
        try {
          const rows = db
            .prepare("SELECT key, value, compression_type AS packed FROM data WHERE key LIKE 'savedEp%'")
            .all() as { key: string; value: Uint8Array | string; packed: number }[]
          for (const row of rows) {
            // Une valeur compressée : jamais pour ces quelques octets, mais on ne devine pas.
            if (row.packed) continue
            const value = typeof row.value === 'string' ? row.value : Buffer.from(row.value).toString('utf8')
            out.push({ key: row.key, value, rank })
          }
        } finally {
          db.close()
        }
      } catch {
        // Base verrouillée ou d'un autre format : rien à lire cette fois.
      } finally {
        rmSync(copy, { force: true })
      }
    }
  }
  return out
}
