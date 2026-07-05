import { DbConnector } from './dbConnector'
import { IStGeneric } from './iStGeneric'
import { DocType } from '../src-fw/doctypes'
import { setDebugLevel, AppExc } from '../src-fw/log'

export class Registry {
  static regDoc = new Map()
  static sizeD () { return Registry.regDoc.size }

  static regOp = new Map()
  static sizeOp () { return Registry.regOp.size }

  static registerD (cl: Function) { Registry.regDoc.set(cl.name, cl) }

  static getD (name: string, data: Object) { 
    const dt = DocType.get(name)
    const cl = dt.subClassBy
      ? Registry.regDoc.get(name + '_' + data[dt.subClassBy]) || Registry.regDoc.get(name)
      : Registry.regDoc.get(name) 
    if (!cl) throw new AppExc(103, 'unregistered_doc_class', null, [name])
    return cl
  }

  static newD (name: string, data: Object) {
    const cl = Registry.getD(name, data)
    return new cl()
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

  databases: Map<string, DbConnector>
  storages: Map<string, IStGeneric>
  safeDB: DbConnector
  masterDB: DbConnector
  svcDB: DbConnector
  dbConnectors: Object
  directoryDB: Object

  messaging?: any

  SUBSMAXLIFEINMINUTES: number[]
  FORMMAXLIFE: number // En minutes - typiquement 10*1440:
  STATUSLAZYNESS: number // En SECONDES, délai de prise en compte d'un changement de Status
}

export let config : BaseConfig = null

export function setConfig (cfg: BaseConfig) { 
  config = cfg 
  setDebugLevel(cfg.debugLevel)
}
