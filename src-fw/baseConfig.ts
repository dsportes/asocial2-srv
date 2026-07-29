export interface BaseConfig {
  SVC: string // code service
  ADMINUSERS: Set<string>
  MASTERDIRADMINUSERS: Set<string>
  MASTERDIR_URL: string
  STDSAFE_URL: string
  PROD: boolean
  GCLOUDLOGGING: boolean

  SRVKEY: string // passée par env var - Clé de décryptage de keys.ts (entre autre)
  keys: Object
  STORAGE_EMULATOR_HOST: string
  FIRESTORE_EMULATOR_HOST: string

  BUILD: string // 'v1.0'
  API: number // 1
  APIVERSIONS: number[] // [1, 1]
  debugLevel: number // 0: aucun, 1: standard: 2: élevé 3: détail DB
  adminAlerts: boolean // false: simulation true: envoi de mail

  logsPath: string // './logs'
  port: any // 8080
  https: boolean
  origins: Set<string> // new Set<string>(['http://localhost:8080']),

  databases: Map<string, any> // DbConnector
  storages: Map<string, any> // IStGeneric
  dbConnectors: Object

  messaging?: any

  SUBSMAXLIFEINMINUTES: number[]
  FORMMAXLIFE: number // En minutes - typiquement 10*1440:
  STATUSLAZYNESS: number // En SECONDES, délai de prise en compte d'un changement de Status
}