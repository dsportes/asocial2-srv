import { AppExc } from './index'
import { config } from './config'
import { Log } from './log'
import { DbConnector } from './dbConnector'
import { IDbGeneric, row } from './iDbGeneric'
import { IStGeneric } from './iStGeneric'
import { DocType } from './doctypes'
import { Document, DocPattern, DocData, DocChange } from './document'
import { Notification, notif } from './notif'
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
  org: string
  clazz: string
  pk: string
  doc?: Document
  before?: row
  after?: row
  
  constructor (org: string, clazz: string, pk: string, before: row) {
    this.org = org; this.clazz = clazz; this.pk = pk; this.before = before
  }

  get key () { return this.clazz + '/' + this.org + '/' + this.pk }
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
  public db: IDbGeneric

  public conso : conso
  public updates : DocDescr[]

  public cache : Cache

  constructor () {  }

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
    this.result = { time: this.now, srvBUILD: config.BUILD }
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
    await this.cache.commit()
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
        this.cache = new Cache(this)
        this.conso = { ndr: 0, ndw: 0, vdr: 0, vdw: 0, nfr: 0, nfw: 0, vfr: 0, vfw: 0 }
        this.result = { time: this.now, srvBUILD: config.BUILD }
        await this.dbConnector.getConnexion(this)

        const [st, detail] = await this.db.doTransaction() // Fait un appel à transac

        if (st === 0) {
          for(let i = 0; i < this.updates.length; i++) {
            const upd = this.updates[i]
            Cache.updateCache(this, upd)
            delete upd.doc
            this.updates[i] = upd
          }
          Cache._purge()
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

      if (this.updates.length) {
        const notifs = await Notification.updates(this, this.updates)
        if (notifs.length) this.setRes('notifs', notifs)
      }

      this.setRes('conso', this.conso)

      /*
      if (this.aTaches) 
        Taches.prochTache(this.dbp, this.storage)
      */
      
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
      Log.info('auths : ' + this.authRecord.time + ' - ' + this.authRecord.listAuths)
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


/* Authenticator générique ********************************/
export class AuthRecord {
  op: Operation
  devAppToken: string
  time: number
  tokens: Object[]

  auths: Set<string>

  constructor (op: Operation) {
    this.op = op
    this.op['authRecord'] = this
    this.auths = new Set()
    const ar = op.args['authRecord']
    if (ar) {
      this.devAppToken = ar.devAppToken
      this.time = ar.time
      this.tokens = ar.tokens
    }
  }

  get listAuths () : string {
    return Array.from(this.auths).join(' ')
  }

  async process () {
    const hck = config.keys['hckeys']
    if (this.tokens && this.tokens.length) for (const token of this.tokens) {
      const k = hck[token['type']]
      if (k) {
        const h = Crypt.sha32(token['value'])
        if (h === k) this.auths.add(token['type'])
      } else {
        const fn = this['mt' + token['type']]
        if (fn) await fn.apply(this, [token])
      }
    }
    return this
  }

  async mtADMIN (token: Object) {
    if (token['val'] === 'ok') this.auths.add('ADMIN')
  }

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
  static map : Map<string, cacheItem> = new Map()

  /* Obtient le dataSer (sérialisé) du row de la cache ou va le chercher en base.
  Si le row actuellement en cache est le plus récent on a évité une lecture effective
   (ça s'est limité à un filtre sur index).
  Si le row n'était pas en cache ou que la version lue est plus récente : IL Y EST MIS:
  Certes la transaction peut échouer, mais au pire on a lu une version plus récente.
  */
  static async getData(op: Operation, org: string, clazz: string, src: Object, lazy?: boolean)
    : Promise<DocDescr> {
    const now = Date.now()
    const pk = DocType.getPk(clazz, src)
    const k = org + '/' + clazz + '/' + pk
    const item = Cache.map.get(k)
    if (item && lazy && (now - item.time < Cache.LAZY_MS)) {
      item.lru = now
      return new DocDescr(org, clazz, pk, item.row)
    }

    if (item) { // item trouvé en cache
      // lecture pour recherche d'un éventuel plus récent
      const row = await op.db.oneRow (org, clazz, pk, item.row.v)
      if (row && row.v > item.row.v) { // celui lu est plus récent
        item.row.data = op.db.rowToDataBin(row)
      }
      item.lru = now
      return new DocDescr(org, clazz, pk, item.row)
    }

    // Pas trouvé en cache - recherche en base
    const row = await op.db.oneRow (org, clazz, pk, item.row.v)
    if (row) { // trouvé en base, mis en cache
      row.data = op.db.rowToDataBin(row)
      const item : cacheItem = { lru: now, time: now, row } 
      Cache.map.set(k, item)
      return new DocDescr(org, clazz, pk, row)
    }

    // Pas trouvé en base
    return null
  }

  static updateCache (op: Operation, rd: DocDescr) {
    const k = rd.key
    let item = Cache.map.get(k)
    if (!rd.after) { // suppression
      if (item) Cache.map.delete(k)
      return
    }
    if (item) { // remplacement éventuel
      if (rd.after.v > item.row.v) {
        item.row = rd.after
        item.lru = op.now
        item.time = op.now
      }
    } else { // insertion d'un nouveau
      item = { lru: op.now, time: op.now, row: rd.after }
    }
    Cache.map.set(k, item)
  }

  static _purge () {
    if (Cache.map.size > Cache.MAX_CACHE_SIZE) {
      const t = []
      Cache.map.forEach((value, key) => { t.push({ lru: value.lru, k: key }) } )
      t.sort((a, b) => { return a.lru < b.lru ? -1 : (a.lru > b.lru ? 1 : 0) })
      for (let i = 0; i < Cache.MAX_CACHE_SIZE / 2; i++) {
        const k = t[i].k
        Cache.map.delete(k)
      }
    }
  }

  constructor (operation: Operation) {
    this.op = operation
    this.db = this.op.db
    this.docs = new Map<string, DocDescr>()
  }

  /* Effectue les écritures en base depuis la liste des documents ayant changé
  - constitue la liste op.updates pour notification aux sessions abonnées.
  */
  async commit() {
    // TODO
  }

  /* Contruit une instance de "Document" depuis un data décrypté sérialisé
  soit issu de lecture DB, soit fourni par l'application.
  */
  docFromDataSer (dataSer: Uint8Array) : Document {
    if (!dataSer) return null
    const data1 = decode(dataSer) as DocData
    const [data, b] = Document.mutate(data1)
    const doc = Document.newDoc(data.clazz, data.release)  
    return doc.populate(data).compile()
  }

  // Retourne ou lit le Hdr
  async getHdr (lazy?: boolean) : Promise<Document> {
    const k = 'ROOT/Hdr/1'
    let dd = this.docs.get(k)
    if (dd) return dd.doc
    dd = await Cache.getData(this.op, 'ROOT', 'Hdr', null, lazy)
    if (!dd) return null
    dd.doc = this.docFromDataSer(dd.before.data)
    if (!lazy) this.docs.set(k, dd)
    return dd.doc
  }

  // Retourne ou lit le Org cité
  async getOrg (org: string, assert?: string, lazy?: boolean) : Promise<Document> {
    const k = org + 'Org/' + org
    let dd = this.docs.get(k)
    if (dd) return dd.doc
    dd = await Cache.getData(this.op, org, 'Org', { org: org }, lazy)
    if (!dd) {
      if (assert) this.op.assertKO(assert, 25, ['Org', org])
      return null
    }
    dd.doc = this.docFromDataSer(dd.before.data)
    if (!lazy) this.docs.set(k, dd)
    return dd.doc
  }

  /* Retourne ou lit de la base le "document" dont le pattern
  (clazz, org, propriétés identifiantes de k0} est donné.
  */
  async getDoc (org: string, clazz: string, src, assert?: string) : Promise<Document> {
    const pk = DocType.getPk(clazz, src)
    const k = org + '/' + clazz + '/' + pk
    let dd = this.docs.get(k)
    if (dd) return dd.doc
    dd = await Cache.getData(this.op, org, clazz, src)
    if (!dd) {
      if (assert) this.op.assertKO(assert, 25, [clazz, DocType.getPk(clazz, src, false)])
      return null
    }
    dd.doc = this.docFromDataSer(dd.before.data)
    return dd.doc
  }

  _getD (pattern: DocPattern) : Document {
    if (pattern.clazz === 'Hdr') return this.hdr
    const ck = this._cacheKey(pattern)
    if (pattern.clazz === 'Org') return this.orgs.get(ck)
    return this.docs.get(ck)
  }

  _setD (doc: Document) {
    if (doc.clazz === 'Hdr') this.hdr = doc
    else {
      const ck = this._cacheKey(doc.pattern)
      if (doc.clazz === 'Org') this.orgs.set(ck, doc)
      else this.docs.set(ck, doc)
    }
  }

  _delD (doc: Document) {
    if (doc.clazz === 'Hdr') this.hdr = null
    else {
      const ck = this._cacheKey(doc.pattern)
      if (doc.clazz === 'Org') this.orgs.delete(ck)
      else this.docs.delete(ck)
    }
  }

  /* Ajoute un document construit par l'application (en général un NEW)
  Si le document était déjà en cache, le retourne.
  Sinon inscrit le nouveau et le retourne.
  */
  addDoc (org: string, doc: Document) : Document {
    const d = this._getD(doc.pattern)
    if (d) return d
    this._setD(doc)
    return doc
  }

  /* Comme AddDoc avec un dataSer en argument plutôt qu'un document.
  */
  addDataSer (dataSer: Uint8Array ) : Document {
    return this.addDoc(this.docFromDataSer(dataSer)) 
  }

  /* Marque le document identifié par son pattern à supprimer:
  - si c'est un document synchronisable, le mettra à jour en "zombi"
  - sinon l'inscrit pour suppression effective.
  - si le document est déjà en cache avec status NEW, il est retiré (ne sera pas créé)
  -i le document n'est pas en cache, il y créé avec status DEL.
  */
  async delDoc (pattern: DocPattern) : Promise<void> {
    let d = this._getD(pattern)
    if (d) {
      const dst = d._status 
      if (dst === DocChange.NEW) this._delD(d)
      else {
        d._status = DocChange.DEL
        this._setD(d)
      }
    } else {
      d = Document.newDoc(pattern.clazz)
      d = Document.compile(d, pattern)
      d._status = DocChange.DEL
      this._setD(d)
    }
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