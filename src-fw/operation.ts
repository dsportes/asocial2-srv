// @ts-ignore
import { encode, decode } from '@msgpack/msgpack'

import { OperationWC, MDandSafe } from '../src-fw/index'
import { config } from '../src/config'
import { Log, AppExc } from '../src-fw/log'
import { DbConnector } from '../src-fw/dbConnector'
import { IDbGeneric, row, cloneRow, srvStatus, updType } from '../src-fw/iDbGeneric'
import { IStGeneric } from '../src-fw/iStGeneric'
import { medCl, topCl } from '../src-fw/registry'
import { DocDescriptor } from '../src-fw/docDescriptor'
import { $Document, DocStatus } from '../src-fw/document'
import { $Cred, $Credential, Embed$Cred } from '../src-fw/documents'
import { Publisher } from '../src-fw/publisher'
import { Util } from '../src-fw/util'
import { Crypt } from '../src-fw/crypt'
import { keyFromB64 } from '../src-fw/b64'

const encoder = new TextEncoder()

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
  doc?: $Document

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
    const [data, b] = $Document.mutate(this.clazz, d)
    this.doc = $Document.newDoc(this.clazz, DocStatus.NONE, data)
    if (this.row._org) this.doc._org = this.row._org
  }

}

export class Operation implements OperationWC {
  public static factories = new Map<string, Function>()

  static new (opName: string) {
    const f = Operation.factories.get(opName)
    return f ? f() : null
  }

  static register (opName: string, factory: Function) {
    Operation.factories.set(opName, factory)
  }

  opName: string
  result: any
  args: any 
  now: number
  svc: string
  org: string
  site: string

  public acceptBadCredential : boolean = false

  public hasPhase3 : boolean = false
  public baseUrl: string
  public today: number
  public msSlow : number

  public dbConnector: DbConnector
  public storage: IStGeneric
  public authRecord : AuthRecord
  public auths: Set<string> // Set des codes des autorisations accordées
  public sessionId: string
  public db: IDbGeneric

  public conso : conso
  public updates : DocDescr[]
  public impactedSubs : ImpactedSubs
  public hasTasks : boolean

  public cache : Cache

  get SUBSSHORTMAXLIFE() { return Math.floor(this.now / 60000) + config.SUBSMAXLIFEINMINUTES[0] }
  get SUBSLONGMAXLIFE() { return Math.floor(this.now / 60000) + config.SUBSMAXLIFEINMINUTES[1] }

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
    this.result = { now: this.now, srvBUILD: config.BUILD }
    this.msSlow = 0
    if (config.debugLevel > 1) 
      Log.info(this.opName + ' : ' + new Date(this.now).toISOString())
  }

  async phase2 (args: any) { }
  async phase3 () { }

  /* Fixe LA valeur de la propriété 'prop' du résultat (et la retourne)*/
  setRes(prop: string, val: any) { this.result[prop] = val; return val }

  delRes(prop: string) { delete this.result[prop] }

  /* AJOUTE la valeur en fin de la propriété Array 'prop' du résultat (et la retourne)*/
  addRes(prop: string, val) {
    let l = this.result[prop]; if (!l) { l = []; this.result[prop] = l }
    l.push(val)
    return val
  }

  requireAdmin () {
    if (!this.authRecord.isAdmin) 
      throw new AppExc(101, 'operation_admin_required', this)
  }

  requireAuth () {
    if (!this.authRecord.userId) 
      throw new AppExc(101, 'operation_authentication_required', this)
  }

  /* Retourne le Cred dont la signature a été vérifié
  et relatif à ce rôle et cet id de document.
  Si noex, retourne null plutôt que de sortir en exception si aucun n'a été trouvé.
  */
  getCredRef (docCl: string, docPk: string, noex?: boolean) : CredRef {
    this.requireAuth()
    return this.authRecord.getCredRef(docCl, docPk, noex || false)
  }

  async transac (): Promise<void> {
    const authRecord = new AuthRecord(this)
    if (authRecord.userId)
      await authRecord.process()
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
        await this.dbConnector.getConnexion(this, this.org)
        this.msSlow = 0
        this.updates = []
        this.hasTasks = false
        this.cache = new Cache(this)
        this.conso = { ndr: 0, ndw: 0, vdr: 0, vdw: 0, nfr: 0, nfw: 0, vfr: 0, vfw: 0 }
        this.result = { now: this.now, srvBUILD: config.BUILD }
        
        const [st, detail] = await this.db.doTransaction() // Fait un appel à transac

        if (st === 0) {
          for(let i = 0; i < this.updates.length; i++) {
            const upd: DocDescr = this.updates[i]
            Cache.updateCache(this, upd)
            delete upd.doc
            this.updates[i] = upd
          }
          Cache._purge(this)
          break 
        }

        // st === 1 - DB lock / contention
        if (retry === 2) {
          this.trace ('Op.run.phase2', 'DB lock', detail, true)
          throw new AppExc(110, 'DB_lock', this, [detail])
        }

        this.db.disconnect()
        await Util.sleep(2000)
      }

      if (this.hasPhase3) {
        if (!this.db)
          await this.dbConnector.getConnexion(this, this.org)
        await this.phase3() // peut ajouter des résultats et db HORS transaction
      }

      if (this.impactedSubs && this.impactedSubs.all.size) {
        const publisher = new Publisher(this)
        for(const [,is] of this.impactedSubs.all) await publisher.publish(is)
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

  // Contrôle des types d'arguments
  type (par: string, req: boolean) : [boolean, any, string] { // present, value, type
    if (par === undefined) throw new AppExc(103, 'missing_argument_name', null, ['?'])
    const v = this.args[par]
    if (v === undefined) {
      if (req) throw new AppExc(103, 'missing_argument', null, [par])
      return [false, null, '']
    }
    return [true, v, typeof v]
  }

  invalid (par: string) { throw new AppExc(103, 'invalid_argument', this, [par])}

  objectValue (par: string, req: boolean) : Object {
    const [present, value, type] = this.type(par, req)
    if (!present && !req) return null
    if (present && type !== 'object')
      throw new AppExc(103, 'invalid_object_argument', this, [par])
    return value
  }

  binValue (par: string, req: boolean) : Uint8Array {
    const [present, value, type] = this.type(par, req)
    if (!present && !req) return null
    if (present && type !== 'object' && !(value instanceof Uint8Array))
      throw new AppExc(103, 'invalid_bin_argument', this, [par])
    return value
  }

  arrayValue (par: string, req: boolean) : Object {
    const [present, value, type] = this.type(par, req)
    if (!present && !req) return ''
    if (present && !Array.isArray(value))
      throw new AppExc(103, 'invalid_array_argument', this, [par])
    return value
  }

  stringValue (par: string, req: boolean, minlg?: number, maxlg?: number) : string {
    const [present, value, type] = this.type(par, req)
    if (!present && !req) return ''
    if (present && type !== 'string'
      || (minlg !== undefined && value.length < minlg) 
      || (maxlg !== undefined && value.length > maxlg)) {
        throw new AppExc(103, 'invalid_string_argument', this, [par])
      }
    return value
  }

  stringArrayValue (par: string, req: boolean) : string[] {
    const [present, value, type] = this.type(par, req)
    if (!present && !req) return []
    if (present && !Array.isArray(value))
      throw new AppExc(103, 'invalid_string_array_argument', this, [par])
    return value
  }

  intValue (par: string, req: boolean, min?: number, max?: number) : number {
    const [present, value, type] = this.type(par, req)
    if (!present && !req) return 0
    if (type !== 'number' || !Number.isInteger(value)
      || (min !== undefined && value < min) 
      || (max !== undefined && value > max)) {
        throw new AppExc(103, 'invalid_intargument', this, [par])
      }
    return value
  }

  boolValue (par: string, req: boolean) : boolean {
    const [present, value, type] = this.type(par, req)
    if (!present && !req) return false
    if (type !== 'boolean')
      throw new AppExc(103, 'invalid_bool_argument', this, [par])
    return value
  }

  orgValue (req: boolean) : string {
    return this.stringValue('org', req, 4, 16)
  }
}

export class CredRef {
  isEmbed: boolean
  doc: $Document // Le credential lui-même OU le document maître (isEmbed est true)
  cred: $Cred

  constructor (doc: $Document, ec: Embed$Cred, isEmbed: boolean) {
    this.doc = doc
    this.isEmbed = isEmbed
    this.cred = {
      credId: ec.credId,
      svc: doc._svc,
      org: doc._org,
      docCl: isEmbed ? this.doc._docCl : this.doc['docCl'],
      docPk: this.doc.myPk,
      props: ec.props,
      pubv: ec.pubv,
      pubc: ec.pubc
    }
  }

  get isValid () {
    const p = this.cred.props
    return p && (!p.limit || (p.limit * 60000) >= Date.now())
  }
  
}

export class AuthRecord {
  // devAppToken: string // token identifiant l'exécution de l'application
  op: Operation
  org: string

  svc: string
  args: Object
  userId: string
  sessionId: string
  time: number
  userSign: Uint8Array
  signatures: Object
  challenge: Uint8Array
  isAdmin: boolean
  pemC: string // clé publique de cryptage du userId
  pemV: string // clé publique de vérification du userId

  /* Clé: ref : docCl/docId - Cred dont la signature est ok*/
  creds: Map<string, CredRef>
  /* ref SANS Credential OU dont la signature est KO */
  koCreds: Set<string>

  constructor (op: Operation) {
    this.op = op
    this.op.authRecord = this
    const ar = op.args['authRecord']
    if (ar && ar.userId) {
      this.userId = ar.userId
      this.op.sessionId = ar.sessionId
      this.sessionId = ar.sessionId
      this.time = ar.time
      this.userSign = ar.userSign
      this.signatures = ar.signatures
      this.challenge = Buffer.from(this.userId + '/' + this.time)
      this.isAdmin = config.ADMINUSERS.has(this.userId)
      this.creds = new Map()
      this.koCreds= new Set()
    } else {
      this.userId = ''
      this.isAdmin = false
    }
  }

  getCredRef (docCl: string, docPk: string, noex?: boolean) : CredRef {
    const cr = this.creds.get(docCl + '/' + docPk)
    if (cr) return cr
    if (noex) return null
    throw new AppExc(103, 'missing_credential', this.op, [this.org, docCl, docPk])
  }

  async process () : Promise<void> {
    if (!this.signatures) return
    const cvs = await MDandSafe.getCVS(this.op, this.userId)
    if (!cvs) throw new AppExc(101, 'operation_no_user_keys_cv', this.op)
    const v = cvs[1]
    const ok = await Crypt.verify(keyFromB64(v), this.userSign, this.challenge)
    if (!ok) throw new AppExc(101, 'operation_bad_signature', this.op)
    
    for (const ref in this.signatures) {
      const [credId, sign] = this.signatures[ref]
      const i = ref.indexOf('/')
      const docCl = i === -1 ? ref : ref.substring(0, i)
      const docPk = i === -1 ? '' : ref.substring(i + 1)
      const dt = DocDescriptor.get(topCl(this.op.svc, docCl))
      let credRef: CredRef
      if (dt.embedCreds) { // Recherche du Credential dans le creds du document
        const d = await this.op.cache.getDoc(this.op.svc + '$' + docCl, { pk: docPk }) as $Document
        if (d && d.embedCreds) {
          const ec = d.embedCreds[credId]
          if (ec) credRef = new CredRef(d, ec, true)
        }
      } else { // Recherche du Credential par sa pk
        const c = await this.op.cache.getDoc(this.op.svc + '$Credential', { credId, docCl }) as $Credential
        if (c && c.docCl === docCl && c.docPk === docPk) {
          credRef = new CredRef(c, c.cred, false)
          if (!credRef.isValid)
            this.op.cache.delDoc(this.svc + '$Credential', c.myPk)
        }
      }
      const ok = !credRef || !credRef.isValid ? false 
        : await Crypt.verify(Buffer.from(credRef.cred.pubv), sign, this.challenge)
      if (ok) this.creds.set(ref, credRef) 
      else this.koCreds.add(ref)
    }

    if (config.debugLevel > 1) {
      const dbg = []
      if (!this.userId) dbg.push('NONE')
      else if (this.isAdmin) dbg.push('ADMIN')
      for (const [ref, r] of this.creds)
        dbg.push('Status:[' + (this.koCreds.has(ref) ? 'KO' : 'OK') + '] - [' + ref + ']')
      Log.debug('Auth status: ' + dbg.join('\n'))
    }
      
    if (this.koCreds.size && !this.op.acceptBadCredential) 
      throw new AppExc(101, 'operation_bad_credentials', this.op, [Array.from(this.koCreds).join('\n')])
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
  static LAZY_MS = 5000

  // Cache globale
  static globCache : Map<string, Map<string, cacheItem>> = new Map()
  static srvStatus : srvStatus = null

  static orgCache(op: Operation) : Map<string, cacheItem> {
    const org = op.org || (op.opName.startsWith('ADMIN') ? 'ADMIN$' :'')
    let oc = Cache.globCache.get(org)
    if (!oc) {
      oc = new Map<string, cacheItem>()
      Cache.globCache.set(org, oc)
    }
    return oc
  }

  /* Retourne le row  déjà en cache ou va le chercher en base et l'inscrit en cache.
  Si le row actuellement en cache est le plus récent on a évité une lecture effective
   (ça s'est limité à un filtre sur index).
  Si le row n'était pas en cache ou que la version lue est plus récente : IL Y EST MIS:
  Certes la transaction peut échouer, mais au pire on a lu une version plus récente.
  - lazy: nombre de SECONDES d'ancienneté accepté pour une lecture non bloquante
  */
  static async getRow(op: Operation, clazz: string, src: Object, lazy?: number)
    : Promise<DocDescr> {
    const oc = Cache.orgCache(op)
    const now = Date.now()
    const pk = DocDescriptor.get(clazz).pkValue(src)
    const k = DocDescr.key(clazz, pk)
    let item = oc.get(k)
    if (item && lazy && ((now - item.time) < (lazy * Cache.LAZY_MS))) {
      item.lru = now
      return new DocDescr(clazz, pk, cloneRow(item.row))
    }

    if (item) { // trouvé en cache, lecture pour recherche d'un éventuel plus récent
      item.lru = now
      const row = await op.db.oneRow(clazz, pk, item.row.v)
      if (row && row.v > item.row.v) { // celui lu est plus récent
        item.row = row
        if (row.deleted) return null
        row.data = Crypt.syncDecrypt(op.db.key, Buffer.from(row['data']))
      }
      return new DocDescr(clazz, pk, cloneRow(item.row))
    }

    // Pas trouvé en cache - recherche en base
    const row = await op.db.oneRow(clazz, pk, item ? item.row.v : 0)
    if (!row) return null // Pas trouvé en base
    // trouvé en base, mis en cache
    item = { lru: now, time: now, row } 
    oc.set(k, item)
    return row.deleted ? null : new DocDescr(clazz, pk, cloneRow(row))
  }

  static updateCache (op: Operation, dd: DocDescr) {
    const oc = Cache.orgCache(op)
    const k = DocDescr.key(dd.clazz, dd.pk)
    let item = oc.get(k)
    if (dd.doc._status === DocStatus.DEL) { // suppression
      if (item) {
        item.lru = op.now
        item.row.deleted = true
        item.row.data = encode({ deleted: true, v: op.now, _pk: item.row.pk, _clazz: dd.clazz })
      }
    } else {
      if (item) { // remplacement éventuel
        if (dd.row.v > item.row.v) {
          item.row = dd.row
          item.lru = op.now
          item.time = op.now
        }
      } else { // insertion d'un nouveau
        item = { lru: op.now, time: op.now, row: dd.row }
      }
    }
    if (item) oc.set(k, item)
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

  /* Retourne ou lit de la base le Document cité par src:
  - src : objet contenant les propriétés de la pk
  */
  async getDoc (clazz: string, src?: Object, assert?: string) : Promise<$Document | null> {
    const dx = DocDescriptor.get(clazz)
    const pk = dx.pkValue(src)
    const k = DocDescr.key(clazz, pk)
    let dd = this.docs.get(k)
    if (dd) return dd.doc
    dd = await Cache.getRow(this.op, clazz, src)
    if (!dd) {
      if (assert) this.op.assertKO(assert, 25, [clazz, dx.pkValue(src, false)])
      return null
    }
    dd.init()
    this.docs.set(k, dd)
    return dd.doc as $Document
  }

  /* Met en cache un row issu de la lecture en mode "report" de la DB.
  Si le document était déjà présent et plus récent, il est CONSERVE.
  Retourne le document.
  */
  putRow (clazz: string, row: row) : $Document {
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
  newDoc (clazz: string, src?: Object) : $Document {
    const pk = DocDescriptor.get(topCl('', clazz)).pkValue(src)
    const k = DocDescr.key(clazz, pk)
    let dd = this.docs.get(k)
    if (dd) return dd.doc
    dd = new DocDescr(clazz, pk, null)
    dd.doc = $Document.newDoc(clazz, DocStatus.NEW, src || {})  
    dd.doc._org = this.op.org
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
      const doc = dd.doc
      let row : row
      if (doc._status === DocStatus.UPD) {
        row = doc.toRow(this.op.now)
        dd.row = row
        this.op.updates.push(dd)
        this.db.writeRow(updType.UPDATE, dd.clazz, row)
      } else if (doc._status === DocStatus.NEW) {
        row = doc.toRow(this.op.now)
        dd.row = row
        this.op.updates.push(dd)
        this.db.writeRow(updType.CREATE, dd.clazz, row)
      } else { // DocStatus.DEL
        if (doc._docDescriptor.sync) {
          row = doc.toZombiRow(this.op.now)
          dd.row = row
          this.op.updates.push(dd)
          this.db.writeRow(updType.UPDATE, dd.clazz, row)
        }
        else this.db.deleteRow(dd.clazz, dd.pk)
      }
      if (doc._docDescriptor.sync && doc._docDescriptor.colls) {
        const is = this.op.impactedSubs.getEntry(dd.clazz, dd.pk)
        this.manageColls(dd.clazz, doc, row, is)
      }
        
    }
  }

  /* Traitement des collections créées / modifiées / supprimées:
    - inscription dans impactedSubs
    - création des rowQ : trace des disparitions des collections "mutables"
  */
  manageColls (clazz: string, doc: $Document, row: row, is: ImpactedSub) {

    for (const [n, collection] of doc._docDescriptor.colls) {
    
      // b, a : valeurs de la propriété clé de la collection n AVANT / APRES mise à jour éventuelle

      // Si null, la propriété n'avait pas de valeur AVANT
      const b = doc._before ? doc._before.get(n) : null
      if (b) is.setColl(n, b)

      // Si null, la propriété n'a pas de valeur APRES
      const a = doc._status !== DocStatus.DEL ? doc.collValue(n) : null
      if (a) is.setColl(n, a)
      
      if (!collection.mutable) continue
      if (doc._status === DocStatus.NEW) continue

      // Inscription dans les rowQ : seulement pour les mutables ayant changé (pouvant avoir quitté)
      // Ceux qui n'étaient pas AVANT n'ont pas à être inscrit en rowQ
      if (!b) continue

      if (doc._status === DocStatus.DEL) { 
        // le ou les termes "before" quittent le ou les (list) documents
        if (collection.list) for (const x of b) this.db.writeRowQ(clazz, n, row.pk, row.v, x)
        else this.db.writeRowQ(clazz, n, row.pk, row.v, b[0])
        continue
      }

      // Il y avait une valeur AVANT (b existe): diffère-t-elle de celle APRES ?
      // Tous les termes "before" qui y étaient AVANT 
      // et ne le sont plus MAINTENANT quittent le document
      if (collection.list) {
        const as = a ? new Set(a) : new Set()
        for (const x of b) 
          if (!as.has(x))
            this.db.writeRowQ(clazz, n, row.pk, row.v, x)
      } else if (a && (a[0] !== b[0])) 
        this.db.writeRowQ(clazz, n, row.pk, row.v, b[0])
    }
  }
} 

/* Contient la liste des documents créés / mis à jour / supprimés d'une opération
afin que le publisher rechercher les souscriptions correspondantes à notifier.
Voir manageColls() ci-dessus.
Map : 
- key: clazz/pk - identifiant du document impacté
- value: ImpactedSub { clazz, pk, colls }
  - colls:  Map de ses collections impactées (s'il en a)
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
    value: colValues - set des valeurs impactées (ajoutées et retirées)
  */

  constructor (clazz: string, pk: string) {
    this.clazz = medCl(clazz)
    this.pk = pk
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

/*
import { initializeApp } from 'firebase-admin/app'
const app = initializeApp()
var admin = require("firebase-admin");

import admin from 'firebase-admin'
import { getMessaging } from 'firebase/messaging'

const serviceAccount = config.keys['adminSDK-service-account']
// var serviceAccount = require("path/to/serviceAccountKey.json");

const app = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
})
const messaging = getMessaging(app)
*/