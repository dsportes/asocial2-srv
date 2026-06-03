import { DbConnector } from './dbConnector'
import { IStGeneric } from './iStGeneric'

export class Registry {
  static regDoc = new Map()
  static sizeD () { return Registry.regDoc.size }

  static regOp = new Map()
  static sizeOp () { return Registry.regOp.size }

  static registerD (cl: Function) { Registry.regDoc.set(cl.name, cl) }

  static getD (name: string) { return Registry.regDoc.get(name) }

  static newD (name: string) {
    const cl = Registry.regDoc.get(name)
    return cl ? new cl() : null
  }

  static newCase (name: string, obj: any) {
    const cl = Registry.regDoc.get('Case_' + name) || Registry.regDoc.get('Case')
    return new cl(obj)
  }

  static registerOp (cl: Function) { 
    Registry.regOp.set(cl.name, cl)
  }
  
  static newOp (name: string) {
    const cl = Registry.regOp.get(name)
    return cl ? new cl() : null
  }
}

export interface BaseConfig {
  SVC: string // code service
  ADMINUSERS: Set<string>
  MASTERDIRADMINUSERS: Set<string>
  MASTERDIR: string
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
  safeDB: DbConnector
  masterDB: DbConnector
  svcDB: DbConnector
  dbConnectors: Object
  directoryDB: Object

  messaging?: any

  SUBSMAXLIFEINMINUTES: number[]
  INVITMAXLIFE: number // En minutes - typiquement 10*1440:
  MANAGERCLASSES: Set<string>
}

export let config : BaseConfig = null

export function setConfig (cfg: BaseConfig) { 
  config = cfg 
}
