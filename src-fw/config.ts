import { DbConnector } from './dbConnector'
import { IStGeneric } from './iStGeneric'

export interface BaseConfig {
  ADMINPEM: string
  ADMINUSERS: Set<string>
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

  databases: Map<string, DbConnector>
  storages: Map<string, IStGeneric>
  safeDB: DbConnector,
  svcDB: DbConnector,
  dbConnectors: Object
  factory: Function
  documentClasses: Object

  messaging?: any

  SUBSMAXLIFEINMINUTES: number[]
}

export let config : BaseConfig = null

export function setConfig (cfg: BaseConfig) { config = cfg }
