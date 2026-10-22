/** L'état d'un service externe, tel que le panneau secret le montre. */
export interface ApiHealth {
  id: string
  name: string
  /** À quoi il sert dans l'app, en quelques mots. */
  purpose: string
  /**
   * `ok` : répond. `limited` : répond, mais le quota est atteint ou le service
   * ralentit. `down` : erreur ou injoignable. `off` : pas configuré (clé absente).
   * `unknown` : pas interrogé exprès, et aucune requête récente pour en juger.
   */
  state: 'ok' | 'limited' | 'down' | 'off' | 'unknown'
  detail: string
  /** Temps de réponse de la sonde, quand il y en a eu une. */
  ms: number | null
}
