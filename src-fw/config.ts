import { DbConnector } from './dbConnector'
import { IStGeneric } from './iStGeneric'
import { DocType } from '../src-fw/doctypes'

import { $Document } from '../src-fw/document'
import { DocDescriptor } from '../src-fw/docDescriptor'

import { setDebugLevel, AppExc } from '../src-fw/log'

export class Registry {
  static classes : Map<string, Function> = new Map()
  static managers : Set<string> = new Set()

  static register (clazz: Function) { 
    let i = clazz.name.indexOf('_')
    const topcl = i === -1 ? clazz.name : clazz.name.substring(0, i)
    // const subCl = i === -1 ? '' : clazz.name.substring(i + 1)
    i = clazz.name.indexOf('$')
    const svc = topcl.substring(0, i)
    const docCl = topcl.substring(i + 1)
    if (!svc || !docCl)
      throw new AppExc(103, 'invalid_class_name', null, [clazz.name])
    let dd = DocDescriptor.get(topcl)
    if (!dd) 
      throw new AppExc(103, 'not_configured_doc_class', null, [clazz.name])
    clazz['docDescriptor'] = dd
    if (clazz['manager']) Registry.managers.add(clazz.name)
    this.classes.set(clazz.name, clazz)
  }

  static getCl (svc: string, docCl: string) : Function {
    const pfx = docCl.indexOf('$') === -1 ? svc + '$' : ''
    const k = pfx + docCl
    const cl = Registry.classes.get(k)
    if (!cl) 
      throw new AppExc(103, 'not_configured_doc_class', null, [k])
    return cl
  }

  static getDescr (svc: string, docCl: string) : DocDescriptor {
    const pfx = docCl.indexOf('$') === -1 ? svc + '$' : ''
    const k = pfx + docCl
    const cl = Registry.classes.get(k)
    if (!cl) 
      throw new AppExc(103, 'not_configured_doc_class', null, [k])
    return cl['docDescriptor']
  }

  static getClass (svc: string, docCl: string, data: Object, nohash?: boolean ) : Function {
    const pfx = docCl.indexOf('$') === -1 ? svc + '$' : ''
    let i = docCl.indexOf('_')
    const topcl = pfx + (i === -1 ? docCl : docCl.substring(0, i))
    const dd = DocDescriptor.get(topcl)
    if (!dd) 
      throw new AppExc(103, 'not_configured_doc_class', null, [topcl])
    const sc = dd.subClassBy
    const cln = topcl + (sc ? '_' + data[sc] : '')
    const cl = Registry.classes.get(cln)
    if (!cl) 
      throw new AppExc(103, 'not_configured_doc_class', null, [cln])
    return cl
  }

  static getPk (svc: string, docCl: string, data: Object, nohash?: boolean) : string {
    const cl = Registry.getClass(svc, docCl, data)
    return cl['docDescriptor'].pkValue(data, nohash)
  }

  static newD (svc: string, docCl: string, data: Object ) : $Document {
    const cl = Registry.getClass(svc, docCl, data)
    // @ts-expect-error
    return new cl() as $Document
  }

  /*
  static regDoc = new Map()
  static sizeD () { return Registry.regDoc.size }

  static registerD (cl: Function) { Registry.regDoc.set(cl.name, cl) }

  static getD (name: string, data: Object) { 
    const dt = DocType.get(name)
    const cl = dt.subClassBy
      ? Registry.regDoc.get(name + '_' + data[dt.subClassBy]) || Registry.regDoc.get(name)
      : Registry.regDoc.get(name) 
    if (!cl) throw new AppExc(103, 'unregistered_doc_class', null, [name])
    return cl
  }
    */

  static regOp = new Map()
  static sizeOp () { return Registry.regOp.size }

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
