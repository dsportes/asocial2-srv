import { AppExc } from './index'
import { config } from './config'
import { Log } from './log'
import { DbConnector } from './dbConnector'
import { IDbGeneric } from './iDbGeneric'
import { IStGeneric } from './iStGeneric'
import { Document, DocPattern, DocData, DocChange } from './document'
import { Util } from './util'
import { Crypt } from './crypt'
import { encode, decode } from '@msgpack/msgpack'

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
    this.cache = new Cache(this)
    await this.setAuths()
    await this.phase2(this.args)
    await this.cache.commit()
  }

  async run () : Promise<void>{
    try {
      if (this.phase2) for (let retry = 0; retry < 3; retry++) {
        if (retry) {
          this.now = Date.now()
          this.today = Util.amj(this.now)
        }
        this.msSlow = 0
        this.result = { time: this.now, srvBUILD: config.BUILD }
        await this.dbConnector.getConnexion(this)
        this.cache = new Cache(this)

        const [st, detail] = await this.db.doTransaction() // Fait un appel à transac

        if (st === 0) {
          // transcation OK et commitée
          this.cache.postCommit()
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

      /*
      if (this.phase2) {
        if (this.subJSON) { // de Sync exclusivement
          if (this.subJSON.startsWith('???')) {
            if (config.mondebug) config.logger.error('subJSON=' + this.subJSON)
            } else {
              await genLogin(this.org, this.sessionId, this.subJSON, this.nhb, this.id, 
                this.compte.perimetre, this.compte.vpe)
            }
        }
        
        if (this.gd.trLog._maj) {
          this.gd.trLog.fermer()
          if (!this.estAdmin) { // sessions ADMIN ne reçoivent jamais de synchro
            const sc = this.gd.trLog.court // sc: { vcpt, vesp, vadq, lag }
            if (sc) this.setRes('trlog', sc)
          }
          
          const sl = this.gd.trLog.serialLong
          if (sl) {
            const sid = this.SYS ? null : (this.sessionId || null)
            this.nhb = await genNotif(this.org, sid, sl)
          }
        }
        if (this.nhb !== undefined && this.nhb !== -1) 
          this.setRes('nhb', { sessionId: this.sessionId, nhb: this.nhb, op: this.nomop })

        if (this.compta) {
          const c = this.compta.compteurs
          const adq = {
            dh: this.dh,
            v: this.compta.v,
            flags: this.flags,
            dlv: this.compta.dlv,
            nl: this.nl, 
            ne: this.ne,
            vd: this.vd, 
            vm: this.vm,
            qv: { ...c.qv }
          }
          this.setRes('adq', adq)
        }
      }
      */

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
  v: number // version du document
  z?: number // zombi du document
  data: Uint8Array // data sérialisé du document
}

/* 
Chaque opération dispose d'un cache des instances de "Document":
- soit qu'elle veut verrouiller pour mise à jour ou des truction,
- soit qu'elle a créé et qui sera inséré dans la base.
En fin de phase 2, un "commit" de ce cache est lancé afin de mettre
à jour la base de données par les documents créés / mis à jour / supprimés
et pour ceux synchronisables avec création / mise à jour / suppression des "fils"
auxquels ils sont rattachés.

Le cache est peuplé:
- depuis lecture de la base : getHdr, getOrg, getDoc
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
  toInsert : Object []
  toUpdate : Object []  
  toDelete : Object []
  hdr : Document
  orgs : Map<string, Document>
  docs : Map<string, Document>

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
  static async getData(op: Operation, pattern: DocPattern, lazy?: boolean) {
    const now = Date.now()
    const clazz = pattern.clazz
    const h = clazz === 'Hdr'
    const o = clazz == 'Org'
    const k0 = op.db.kiFromPattern('k0', pattern) as string
    const k = clazz + '/' + (h ? '' : (pattern.org + '/' + (o ? '' : k0)))
    const item = Cache.map.get(k)
    if (item && lazy && (o || h) && (now - item.time < Cache.LAZY_MS)) {
      item.lru = now
      return item.data
    }

    if (item) { // item trouvé en cache
      // lecture pour recherche d'un éventuel plus récent
      let row : any
      if (h) row = await op.db.getHdr(item.v)
      else {
        if (o) row = await op.db.getOrg(pattern.org, item.v)
        else row = await op.db.getDoc(pattern , item.v)
      }
      const v = row['v']
      const z = row['z']
      if (row && v > item.v) { // celui lu est plus récent
        item.data = op.db.rowToDataBin(row)
        item.v = v
        if (z) item.z = z
      }
      item.lru = now
      return item.data
    }

    // Pas trouvé en cache - recherche en base
    let row : any
    if (h) row = await op.db.getHdr()
    else {
      if (o) row = await op.db.getOrg(pattern.org)
      else row = await op.db.getDoc(pattern)
    }
    if (row) { // trouvé en base, mis en cache
      const data = op.db.rowToDataBin(row)
      const item : cacheItem = { 
        lru: now, 
        time: now, 
        v: row['v'], 
        data
      }
      const z = row['z']
      if (z) item.z = z
      Cache.map.set(k, item)
      return data
    }

    // Pas trouvé en base
    return null
  }

  // Après commit, mise à jour du cache avec les nouveaux rows
  updateCache () {
    const now = Date.now()
    const rows = []
    this.toInsert.forEach(row => { rows.push(row)})
    this.toUpdate.forEach(row => { rows.push(row)}) 
    for(const row of rows) {
      const clazz = row['clazz']
      const h = clazz === 'Hdr'
      const o = clazz == 'Org'
      const v = row['v']
      const z = row['z']
      const k = clazz + '/' + (h ? '' : (row['org'] + '/' + (o ? '' : row['k0'])))
      const item = Cache.map.get(k)
      if (item) { // remplacement éventuel
        if (v > item.v) {
          item.v = v
          item.data = row['data']
          if (z) item.z = z
          item.lru = now
          item.time = now
        }
      } else { // insertion d'un nouveau
        const item : cacheItem = {
          v: v,
          data: row['data'],
          lru: now,
          time: now,
        }
        if (z) item.z = z
        Cache.map.set(k, item)
      }
    }

    for(const row of this.toDelete) {
      const clazz = row['clazz']
      const h = clazz === 'Hdr'
      const o = clazz == 'Org'
      const v = row['v']
      const z = row['z']
      const k = clazz + '/' + (h ? '' : (row['org'] + '/' + (o ? '' : row['k0'])))
      Cache.map.delete(k)
    }

    if (Cache.map.size > Cache.MAX_CACHE_SIZE) Cache._purge()
  }

  static _purge () {
    const t = []
    Cache.map.forEach((value, key) => { t.push({ lru: value.lru, k: key }) } )
    t.sort((a, b) => { return a.lru < b.lru ? -1 : (a.lru > b.lru ? 1 : 0) })
    for (let i = 0; i < Cache.MAX_CACHE_SIZE / 2; i++) {
      const k = t[i].k
      Cache.map.delete(k)
    }
  }

  constructor (operation: Operation) {
    this.op = operation
    this.db = this.op.db
    this.toInsert = []
    this.toUpdate = []
    this.toDelete = []
    this.hdr = null
    this.orgs = new Map<string, Document>()
    this.docs = new Map<string, Document>()
    this.conso = [0, 0, 0, 0]
  }

  /* Effectue les écritures en base
  et constitue la liste des notifications à pousser par web-push
  aux sessions abonnées.
  */
  async commit() {
    // TODO
    if (this.toInsert.length)
      for (const row of this.toInsert) await this.db.insertDoc(row)
    if (this.toUpdate.length)
      for (const row of this.toUpdate) await this.db.updateDoc(row)
    if (this.toDelete.length)
      for (const row of this.toDelete) 
        await this.db.deleteDoc(row as DocPattern)
    // préparer le Trlog
  }

  // Après commit effectif, complète et compresse le cache global
  postCommit () {
    this.updateCache()
  }

  /* Contruit une instance de "Document" depuis un dataSer
  soit issu de lecture DB, soit fourni par l'application.
  */
  docFromDataSer (dataSer: Uint8Array) : Document {
    if (!dataSer) return null
    const data1 = decode(dataSer) as DocData
    const [data, b] = Document.mutate(data1)
    const doc = Document.newDoc(data.clazz, data.release)  
    return doc.populate(data).compile()
  }

  // Retourne ou it le Hdr
  async getHdr (lazy?: boolean) : Promise<Document> {
    let doc = this.hdr
    if (doc) return doc
    const dataSer = await Cache.getData(this.op, { clazz: 'Hdr', org: ''}, lazy)
    doc = this.docFromDataSer(dataSer)
    if (!lazy) this.hdr = doc
    return doc
  }

  // Retourne ou lit le Org cité
  async getOrg (org: string, assert?: string, lazy?: boolean) : Promise<Document> {
    let doc = this.orgs.get(org)
    if (doc) return doc
    const dataSer = await Cache.getData(this.op, { clazz: 'Hdr', org }, lazy)
    if (!dataSer) {
      if (assert) this.op.assertKO(assert, 25, ['Org', org])
      return null
    }
    doc = this.docFromDataSer(dataSer)
    if (!lazy) this.orgs.set(org, doc)
    return doc
  }

  /* Retourne ou lit de la base le "document" dont le pattern
  (clazz, org, propriétés identifiantes de k0} est donné.
  */
  async getDoc (pattern: DocPattern, assert?: string) : Promise<Document> {
    let doc = this._getD(pattern)
    if (doc) return doc
    const dataSer = await Cache.getData(this.op, pattern)
    if (!dataSer) {
      if (assert) this.op.assertKO(assert, 26, this.db.idFromPattern(pattern))
      return null
    }
    doc = this.docFromDataSer(dataSer)
    this._setD(doc)
    return doc
  }

    // Privé : construit la clé dans le cache d'un document
  _cacheKey (pattern: DocPattern) : string {
    const k0 = this.op.db.kiFromPattern('k0', pattern)
    return pattern.org + '/' + pattern.clazz +
      (pattern.clazz === 'Org' ? '' : ('/' + k0))
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
  addDoc (doc: Document) : Document {
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