import { AppExc } from './index'
import { config } from './config'
import { Log } from './log'
import { DbConnector } from './dbConnector'
import { IDbGeneric, row, srvStatus, rowQ, updType } from './iDbGeneric'
import { IStGeneric } from './iStGeneric'
import { DocType } from './doctypes'
import { Document, DocStatus } from './document'
import { Publisher } from './publisher'
import { Util } from './util'
import { Crypt } from './crypt'
import { encode, decode } from '@msgpack/msgpack'

type conso = {
  ndr: number, // nombre de documents lus
  ndw: number, // nombre de documents écrits
  vdr: number, // volume de documents lus
  vdw: number, // volume de documents écrits
  nfr: number, // nombre de fichiers lus
  nfw: number, // nombre de fichiers écrits
  vfr: number, // volume de fichiers lus
  vfw: number, // volume de fichiers écrits
}

export class DocDescr {
  clazz: string
  pk: string
  // En cache globale: détention sous forme row (data décrypté mais sérialisé)
  row?: row
  // En chache d'une opération: détention d'un Document (pas d'un row)
  doc?: Document

  constructor (clazz: string, pk: string, row: row) {
    this.clazz = clazz; this.pk = pk
    if (row) this.row = row
  }

  static key (clazz: string, pk: string) { 
    return clazz + '/' + pk 
  }

  /* Contruit une instance de "Document" depuis le row issu de lecture DB
  Retourne le document compilé
  */
  init () : void {
    const d = decode(this.row.data)
    const [data, b] = Document.mutate(this.clazz, d)
    this.doc = Document.newDoc(this.clazz, DocStatus.NONE, data)
  }

}

export class Operation {
  public static factories = new Map<string, Function>()

  static nbOf () { 
    return Operation.factories.size 
  }

  static new (opName: string) {
    const f = Operation.factories.get(opName)
    return f ? f() : null
  }

  static register (opName: string, factory: Function) {
    Operation.factories.set(opName, factory)
  }

  public opName: string
  public org: string
  public result: any
  public args: any // arguments bruts de l'opération
  public now: number
  public today: number
  public msSlow : number

  public storage: IStGeneric
  public dbConnector: DbConnector
  public authRecord : AuthRecord
  public auths: Set<string> // Set des codes des autorisations accordées
  public sessionId: string
  public db: IDbGeneric

  public conso : conso
  public updates : DocDescr[]
  public impactedSubs : ImpactedSubs
  public hasTasks : boolean

  public cache : Cache

  constructor () {  }

  get SUBSSHORTMAXLIFE() { return Math.floor(this.now / 1440000) + config.SUBSMAXLIFEINMINUTES[0] }
  get SUBSLONGMAXLIFE() { return Math.floor(this.now / 1440000) + config.SUBSMAXLIFEINMINUTES[1] }

  assertKO (src: string, code: number, args: string[]) {
    const x = args && args.length ? JSON.stringify(args) : ''
    const msg = `ASSERT : ${src} - ${x} - ${code}`
    const t = new Date().toISOString()
    Log.error(msg)
    if (args) args.unshift(src)
    return new AppExc(code, 'ASSERT', this, args)
  }

  trace (src: string, id: string, info: string, err: boolean) {
    const msg = `${src} - ${id} - ${info}`
    if (err) Log.error(msg); else Log.info(msg)
    return msg
  }

  init () {
    this.org = this.args['org']
    this.result = { now: this.now, srvBUILD: config.BUILD }
    this.msSlow = 0
    if (config.debugLevel > 1) 
      Log.info(this.opName + ' : ' + new Date(this.now).toISOString())
  }

  async phase2 (args: any) {
  }

  async phase3 (args: any) {
  }

  /* Fixe LA valeur de la propriété 'prop' du résultat (et la retourne)*/
  setRes(prop: string, val: any) { this.result[prop] = val; return val }

  /* AJOUTE la valeur en fin de la propriété Array 'prop' du résultat (et la retourne)*/
  addRes(prop: string, val) {
    let l = this.result[prop]; if (!l) { l = []; this.result[prop] = l }
    l.push(val)
    return val
  }

  async transac (): Promise<void> {
    await this.setAuths()
    await this.phase2(this.args)
    this.cache.commit()
    await this.db.commit()
  }

  async run () : Promise<void>{
    try {
      if (this.phase2) for (let retry = 0; retry < 3; retry++) {
        if (retry) {
          this.now = Date.now()
          this.today = Math.floor(this.now / 86400000)
        }
        this.msSlow = 0
        this.updates = []
        this.hasTasks = false
        this.cache = new Cache(this)
        this.conso = { ndr: 0, ndw: 0, vdr: 0, vdw: 0, nfr: 0, nfw: 0, vfr: 0, vfw: 0 }
        this.result = { now: this.now, srvBUILD: config.BUILD }
        await this.dbConnector.getConnexion(this)

        const [st, detail] = await this.db.doTransaction() // Fait un appel à transac

        if (st === 0) {
          for(let i = 0; i < this.updates.length; i++) {
            const upd = this.updates[i]
            Cache.updateCache(this, upd)
            delete upd.doc
            this.updates[i] = upd
          }
          Cache._purge(this)
          break 
        }

        if (st === 2) {
          this.trace ('Op.run.phase2', 'DB error', detail, true)
          throw new AppExc(11, 'DB error', this, [detail]) // DB error
        }

        // st === 1 - DB lock / contention
        if (retry === 2) {
          this.trace ('Op.run.phase2', 'DB lock', detail, true)
          throw new AppExc(10, 'DB lock', this, [detail])
        }

        this.db.disconnect()
        await Util.sleep(10000)
      }

      if (this.phase3) {
        if (!this.db)
          await this.dbConnector.getConnexion(this)
        await this.phase3(this.args) // peut ajouter des résultats et db HORS transaction
      }

      if (this.impactedSubs.all.size) {
        const publisher = new Publisher(this)
        for(const [,is] of this.impactedSubs.all) await publisher.publish(this, is)
        // notification : { title body url defs: 'def1 def2 ...' }
        const notification = publisher.getSessionNotifs()
        if (notification) this.setRes('notification', notification)
        setTimeout(async () => { await publisher.sendNotifications() }, 1)
      }

      this.setRes('conso', this.conso)

      // if (this.hasTasks) Taches.prochTache(this.db, this.storage)
      
      await this.db.disconnect()

      if (this.msSlow) await Util.sleep(this.msSlow)
      
      return this.result
    } catch (e) {
      if (this.db) await this.db.disconnect()
      if (config.debugLevel > 1) 
        Log.error(this.opName + ' : ' + new Date(this.now).toISOString() + ' : ' + e.toString())
      throw e
    }
  }

  async setAuths (): Promise<void> {
    const auth = config.factory('AuthRecord', this)
    await auth.process()
    this.setRes('auths', auth.listAuths)
    if (config.debugLevel > 1)
      Log.info('auths : ' + (this.authRecord.time || 0) + ' - ' + this.authRecord.listAuths)
  }

  // Contrôle des types d'arguments

  type (par: string, req: boolean) : [boolean, any, string] { // absent, value, type
    if (par === undefined) throw new AppExc(8001, 'unknown argument', null, ['?'])
    const v = this.args[par]
    if (v === undefined) {
      if (req) throw new AppExc(3001, 'argument absent', null, [par])
      return [false, null, '']
    }
    return [true, v, typeof v]
  }

  invalid (par: string) { throw new AppExc(3001, 'invalid argument', this, [par])}

  objectValue (par: string, req: boolean) : Object {
    const [present, value, type] = this.type(par, req)
    if (!present && !req) return null
    if (present && type !== 'object')
      throw new AppExc(1010, 'invalid argument', this, [par])
    return value
  }

  arrayValue (par: string, req: boolean) : Object {
    const [present, value, type] = this.type(par, req)
    if (!present && !req) return ''
    if (present && type !== 'array')
      throw new AppExc(1010, 'invalid argument', this, [par])
    return value
  }

  stringValue (par: string, req: boolean, minlg?: number, maxlg?: number) : string {
    const [present, value, type] = this.type(par, req)
    if (!present && !req) return ''
    if (present && type !== 'string'
      || (minlg !== undefined && value.length < minlg) 
      || (maxlg !== undefined && value.length > maxlg)) {
        throw new AppExc(1010, 'invalid argument', this, [par])
      }
    return value
  }

  stringArrayValue (par: string, req: boolean) : string[] {
    const [present, value, type] = this.type(par, req)
    if (!present && !req) return []
    if (present && type !== 'array')
      throw new AppExc(1010, 'invalid argument', this, [par])
    return value
  }

  intValue (par: string, req: boolean, min?: number, max?: number) : number {
    const [present, value, type] = this.type(par, req)
    if (!present && !req) return 0
    if (type !== 'number' || !Number.isInteger(value)
      || (min !== undefined && value < min) 
      || (max !== undefined && value > max)) {
        throw new AppExc(1010, 'invalid argument', this, [par])
      }
    return value
  }

  boolValue (par: string, req: boolean) : boolean {
    const [present, value, type] = this.type(par, req)
    if (!present && !req) return false
    if (type !== 'boolean')
      throw new AppExc(1010, 'invalid argument', this, [par])
    return value
  }

  orgValue (req: boolean) : string {
    return this.stringValue('org', req, 4, 16)
  }
}

/* Authenticator générique *******************************
  "authRecord" est un argument de l'opération
  authRecord: {
    sessionId : 'azerty',
    devAppToken : 'bof', // fac
    time: Date.now(),
    tokens : [
      { type: 'ADMIN', value: 'oKqMNB...'},
      { type: 'TEST1', toto: 'titi'},
      { type: 'TEST2', toto: 'titi'},
    ]
  }
  Si "type" est une des entrées de "hckeys" dans config:
    - c'est une clé d'accès pré-enregistrée par son sha
  Sinon pour une entrée 'TEST1' il existe une méthode async 'mtTEST1'
  qui prend en argument l'objet { type: 'TEST2', toto: 'titi'}
  et ajoute à auths le code de l'autorisation si elle est accordée 
*/
export class AuthRecord {
  op: Operation
  sessionId: string
  // devAppToken: string // token identifiant l'exécution de l'application
  time: number // date-heure du authRecord dans l'application
  tokens: Object[] // liste des tokens

  constructor (op: Operation) {
    this.op = op
    this.op.authRecord = this
    const ar = op.args['authRecord']
    if (ar) {
      // this.devAppToken = ar.devAppToken || ''
      this.op.sessionId = ar.sessionId
      this.sessionId = ar.sessionId
      this.time = ar.time
      this.tokens = ar.tokens
    }
  }

  get listAuths () : string {
    return this.op.auths ? Array.from(this.op.auths).join(' ') : '?'
  }

  async process () : Promise<void>{
    const auths : Set<string> = new Set()// Set des codes d'autorisation accordés
    const hck = config.keys['hckeys']
    if (this.tokens && this.tokens.length) for (const token of this.tokens) {
      const k = hck[token['type']]
      if (k) {
        // Autorisation cryptée en config
        const h = Crypt.sha32(token['value'])
        if (h === k) auths.add(token['type'])
      } else {
        // Autorisation calculée
        const fn = this['mt' + token['type']]
        if (fn) await fn.apply(this, [token, auths])
      }
    }
    this.op.auths = auths
  }

  /* Exemple de fonction d'autorisation
  async mtTEST1 (token: Object, auths: Set<string> ) {
    if (token['toto'] === 'titi') auths.add('TOTO')
  }
  */

}

type cacheItem = {
  lru: number // last recent use
  time: number // time lecture
  row: row
}

/* 
Chaque opération dispose d'un cache des instances de "Document":
- soit qu'elle veut verrouiller pour mise à jour ou des truction,
- soit qu'elle a créé et qui sera inséré dans la base.
En fin de phase 2, un "commit" de ce cache est lancé afin de mettre
à jour la base de données par les documents créés / mis à jour / supprimés

Le cache est peuplé:
- depuis lecture de la base : oneRow
- depuis un "Document" nouveau : addDoc
- depuis un "dataSer" récupéré d'une liste de sélection
  et compilé en "Document" : addDataSer
Ces méthodes retourn en "Document":
- soit celui qui était déjà en cache (get...),
- soit celui ajouté (add...)

Un cache "global" de "dataSer" réduit le nombre d'accès en base
quand la document y figure (sa version est néanmoins vérifiée par accès à l'index).
*/
export class Cache {

  // Cache locale à l'opération
  op: Operation
  db : IDbGeneric
  conso : number[]
  docs : Map<string, DocDescr>

  static MAX_CACHE_SIZE = 1000
  static LAZY_MS = 1000

  // Cache globale
  static globCache : Map<string, Map<string, cacheItem>> = new Map()
  static srvStatus : srvStatus = null

  static orgCache(op: Operation) : Map<string, cacheItem> {
    let oc = Cache.globCache.get(op.org)
    if (!oc) {
      oc = new Map<string, cacheItem>()
      Cache.globCache.set(op.org, oc)
    }
    return oc
  }

  /* Retourne le row  déjà en cache ou va le chercher en base et l'inscrit en cache.
  Si le row actuellement en cache est le plus récent on a évité une lecture effective
   (ça s'est limité à un filtre sur index).
  Si le row n'était pas en cache ou que la version lue est plus récente : IL Y EST MIS:
  Certes la transaction peut échouer, mais au pire on a lu une version plus récente.
  */
  static async getRow(op: Operation, clazz: string, src: Object, lazy?: number)
    : Promise<DocDescr> {
    const oc = Cache.orgCache(op)
    const now = Date.now()
    const pk = DocType.getPk(clazz, src)
    const k = DocDescr.key(clazz, pk)
    const item = oc.get(k)
    if (item && lazy && ((now - item.time) < (lazy * Cache.LAZY_MS))) {
      item.lru = now
      return new DocDescr(clazz, pk, item.row)
    }

    if (item) { // item trouvé en cache
      // lecture pour recherche d'un éventuel plus récent
      const row = await op.db.oneRow(clazz, pk, item.row.v)
      if (row && row.v > item.row.v) // celui lu est plus récent
        item.row.data = Crypt.syncDecrypt(op.db.key, row['data'])
      item.lru = now
      return new DocDescr(clazz, pk, item.row)
    }

    // Pas trouvé en cache - recherche en base
    const row = await op.db.oneRow(clazz, pk, item.row.v)
    if (row) { // trouvé en base, mis en cache
      row.data = Crypt.syncDecrypt(op.db.key, row['data'])
      const item : cacheItem = { lru: now, time: now, row } 
      oc.set(k, item)
      return new DocDescr(clazz, pk, row)
    }

    // Pas trouvé en base
    return null
  }

  /* SrvStatus : lazy
  */
  static async getSrvStatus (op: Operation, lazy?: number) {
    if (!Cache.srvStatus || !lazy || ((op.now - Cache.srvStatus.now) > (lazy * Cache.LAZY_MS)))
      Cache.srvStatus = await op.db.getSrvStatus() 
    return Cache.srvStatus
  }

  static updateCache (op: Operation, dd: DocDescr) {
    const oc = Cache.orgCache(op)
    const k = DocDescr.key(dd.clazz, dd.pk)
    let item = oc.get(k)
    if (dd.doc._status === DocStatus.DEL) { // suppression
      if (item) oc.delete(k)
      return
    }
    if (item) { // remplacement éventuel
      if (dd.row.v > item.row.v) {
        item.row = dd.row
        item.lru = op.now
        item.time = op.now
      }
    } else { // insertion d'un nouveau
      item = { lru: op.now, time: op.now, row: dd.row }
    }
    oc.set(k, item)
  }

  static _purge (op: Operation) {
    const oc = Cache.orgCache(op)
    if (oc.size > Cache.MAX_CACHE_SIZE) {
      const t = []
      oc.forEach((value, key) => { t.push({ lru: value.lru, k: key }) } )
      t.sort((a, b) => { return a.lru < b.lru ? -1 : (a.lru > b.lru ? 1 : 0) })
      for (let i = 0; i < Cache.MAX_CACHE_SIZE / 2; i++) {
        const k = t[i].k
        oc.delete(k)
      }
    }
  }

  constructor (operation: Operation) {
    this.op = operation
    this.db = this.op.db
    this.docs = new Map<string, DocDescr>()
  }

  // Retourne ou lit le Document Org cité
  async getOrg (assert?: string, lazy?: boolean) : Promise<Document> {
    const k = 'Org/' + this.op.org
    let dd = this.docs.get(k)
    if (dd) return dd.doc
    dd = await Cache.getRow(this.op, 'Org', null, 1)
    if (!dd) {
      if (assert) this.op.assertKO(assert, 25, ['Org', this.op.org])
      return null
    }
    dd.init()
    if (!lazy) this.docs.set(k, dd)
    return dd.doc
  }

  /* Retourne ou lit de la base le Document cité par src:
  - src : objet contenant les proipriétés de la pk
  */
  async getDoc (clazz: string, src: Object, assert?: string) : Promise<Document> {
    const pk = DocType.getPk(clazz, src)
    const k = DocDescr.key(clazz, pk)
    let dd = this.docs.get(k)
    if (dd) return dd.doc
    dd = await Cache.getRow(this.op, clazz, src)
    if (!dd) {
      if (assert) this.op.assertKO(assert, 25, [clazz, DocType.getPk(clazz, src, false)])
      return null
    }
    dd.init()
    return dd.doc
  }

  /* Met en cache un row issu de la lecture en mode "report" de la DB.
  Si le document était déjà présent et plus récent, il est CONSERVE.
  Retourne le document.
  */
  putRow (clazz: string, row: row) : Document {
    const k = DocDescr.key(clazz, row.pk)
    let dd = this.docs.get(k)
    if (dd) return dd.doc
    dd = new DocDescr(clazz, row.pk, row)
    dd.init()
    this.docs.set(k, dd)
    return dd.doc
  }

  /* Met en cache un NOUVEAU document (création) depuis un objet source.
  Toutefois SI le document était déjà présent et plus récent, il est CONSERVE.
  Retourne le document.
  */
  newDoc (clazz: string, src: Object) : Document {
    const pk = DocType.getPk(clazz, src)
    const k = DocDescr.key(clazz, pk)
    let dd = this.docs.get(k)
    if (dd) return dd.doc
    dd = new DocDescr(clazz, pk, null)
    dd.doc = Document.newDoc(clazz, DocStatus.NEW, src)  
    this.docs.set(k, dd)
    return dd.doc
  }

  /* Marque le document identifié par sa pk 
  IL DOIT avoir été lu auparavent !
  - si c'est un document synchronisable, le mettra à jour en "zombi"
  - sinon l'inscrit pour suppression effective.
  - si le document a status NEW, il est retiré (ne sera pas créé).
  - sinon son status est à DEL.
  */
  delDoc (clazz: string, pk: string) {
    const k = DocDescr.key(clazz, pk)
    let dd = this.docs.get(k)
    if (dd) {
      if (dd.doc._status === DocStatus.NEW) this.docs.delete(k)
      else dd.doc._status = DocStatus.DEL
    }
  }

  /* Prépare les écritures en base depuis la liste des documents ayant changé
  - constitue la liste op.updates pour notification aux sessions abonnées.
  */
  commit () {
    this.op.impactedSubs = new ImpactedSubs()
    this.op.updates = []
    for (const [k, dd] of this.docs) {
      if (dd.doc._status === DocStatus.NONE) continue
      this.op.updates.push(dd)
      const doc = dd.doc
      let row : row
      const is = this.op.impactedSubs.getEntry(dd.clazz, dd.pk)
      if (doc._status === DocStatus.UPD) {
        row = doc.toRow(this.op.now)
        this.db.writeRow(updType.UPDATE, dd.clazz, row)
      } else if (doc._status === DocStatus.NEW) {
        row = doc.toRow(this.op.now)
        this.db.writeRow(updType.CREATE, dd.clazz, row)
      } else { // DocStatus.DEL
        if (doc.docType.sync) {
          row = doc.toZombiRow(this.op.now)
          this.db.writeRow(updType.UPDATE, dd.clazz, row)
        }
        else this.db.deleteRow(dd.clazz, dd.pk)
      }
      if (doc.docType.sync) this.manageRowQ(dd, doc, row, is)
    }
  }

  manageRowQ (dd: DocDescr, doc: Document, row: row, is: ImpactedSub) {
    for (const [n, collection] of doc.docType.colls) {
      if (doc._status === DocStatus.DEL) {
        // Tous le ou les termes "before" quittent le document
        const b = doc._before[n]
        is.setColl(n, b)
        if (collection.list) for (const x of b) {
          this.db.writeRowQ(dd.clazz, n, { v: row.v,  col: x })
        } else {
          is.setColl(n, b)
          this.db.writeRowQ(dd.clazz, n, { v: row.v,  col: b })
        }
      } else {
        const b = doc._before[n]
        const a = doc.collValue(n)
        is.setColl(n, a)
        is.setColl(n, b)
        if (doc._status === DocStatus.UPD) {
          // Tous le ou les termes "before" 
          // qui y étaient AVANT et ne le sont plus MAINTENANT
          // quittent le document
          if (collection.list) {
            const bs : Set<string> = new Set(b)
            const as = new Set(a)
            for (const x of bs) {
              if (!as.has(x))
                this.db.writeRowQ(dd.clazz, n, { v: row.v,  col: x })
            }
          } else if (a !== b) 
            this.db.writeRowQ(dd.clazz, n, { v: row.v,  col: b })
        }
      }
    }
  }
} 

/* Contient la liste des documents créés / mis à jour / supprimés d'une opération
afin que le publisher rechercher les souscriptions correspondantes à notifier.
Voir manageRowQ() ci-dessus.
Map : 
- key: clazz/pk - identifiant du document
- value: ImpactedSub { clazz, pk, colls }
  - colls:  Map: 
    - key: nom collection (colName) 
    - value: colValues 
*/
export class ImpactedSubs {
  all : Map<string, ImpactedSub>

  constructor () {
    this.all = new Map()
  }

  getEntry (clazz: string, pk: string) : ImpactedSub {
    const k = DocDescr.key(clazz, pk)
    let is = this.all.get(k)
    if (!is) {
      is = new ImpactedSub(clazz, pk)
      this.all.set(k, is)
    }
    return is
  }
}

export class ImpactedSub {

  clazz: string // du document
  pk: string // du document 
  colls: Map<string, Set<string>> 
  /* key: nom de la collection (colName)
    value: colValues - set des valeurs impactées par le document
      ajoutées et retirées
  */

  constructor (clazz: string, pk: string) {
    this.clazz = clazz, this.pk = pk
    this.colls = new Map()
  }

  setColl (name: string, vals: string[]) {
    let c = this.colls.get(name)
    if (!c) {
      c = new Set()
      this.colls.set(name, c)
    }
    for (const s of vals) c.add(s)
  }
}

// import { initializeApp } from 'firebase-admin/app'
// const app = initializeApp()

// var admin = require("firebase-admin");

/*
import admin from 'firebase-admin'
import { getMessaging } from 'firebase/messaging'

const serviceAccount = config.keys['adminSDK-service-account']
// var serviceAccount = require("path/to/serviceAccountKey.json");

const app = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
})
const messaging = getMessaging(app)
*/