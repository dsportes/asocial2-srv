
import { FieldPath, DocumentReference, Firestore, Query, QuerySnapshot, 
  Timestamp, WhereFilterOp, OrderByDirection } from '@google-cloud/firestore'

import { writeFileSync } from 'node:fs'
import path from 'path'

import { encode } from '@msgpack/msgpack'
import { DocType } from '../src-fw/doctypes'
import { DbConnector, DbConnexion } from '../src-fw/dbConnector'
import { IDbGeneric, srvStatus, filter, row, rowQ, zombiLapse, safeLapse,
  expList, expListQ, updType, vdata, Safe, safeTable } from '../src-fw/iDbGeneric'
import { config } from '../src-fw/config'
import { Log } from '../src-fw/log'
import { Operation } from '../src-fw/operation'
import { Crypt } from '../src-fw/crypt'

const schemaPath = './emulators/firestore.indexes.json'

const t1 = `{
"indexes": [],
"fieldOverrides": [
{ "collectionGroup": "Urls", "fieldPath": "url", "indexes": [] },
{ "collectionGroup": "Status", "fieldPath": "st", "indexes": [] },
{ "collectionGroup": "Status", "fieldPath": "at", "indexes": [] },
{ "collectionGroup": "Status", "fieldPath": "txt", "indexes": [] },`

function t2 (cl: string, virg: boolean) {
  const x = `{ "collectionGroup": "${cl}", "fieldPath": "pk", "indexes": [{ "order": "ASCENDING", "queryScope": "COLLECTION" }] },
{ "collectionGroup": "${cl}", "fieldPath": "org", "indexes": [{ "order": "ASCENDING", "queryScope": "COLLECTION" }] },
{ "collectionGroup": "${cl}", "fieldPath": "v", "indexes": [{ "order": "ASCENDING", "queryScope": "COLLECTION" }] },
{ "collectionGroup": "${cl}", "fieldPath": "pk", "indexes": [{ "order": "ASCENDING", "queryScope": "COLLECTION" }] },
{ "collectionGroup": "${cl}", "fieldPath": "ttl", "indexes": [] },
{ "collectionGroup": "${cl}", "fieldPath": "data", "indexes": [] }` 
  return x + (virg ? ',' : '')
}

function t3 (cl: string, prop: string, virg: boolean) { 
  const x = `{ "collectionGroup": "${cl}", "fieldPath": "${prop}", "indexes": [{ "order": "ASCENDING", "queryScope": "COLLECTION" }] }` 
  return x + (virg ? ',' : '')
}

function t4 (cl: string, prop: string, virg: boolean) { 
const x = `{ "collectionGroup": "${cl}", "fieldPath": "${prop}", "indexes": [{ "order": "ASCENDING", "queryScope": "COLLECTION_GROUP" }] }`
return x + (virg ? ',' : '') 
}

function t5 (cl: string, virg: boolean) {
const x = `{ "collectionGroup": "${cl}", "fieldPath": "col", "indexes": [{ "order": "ASCENDING", "queryScope": "COLLECTION" }] },
{ "collectionGroup": "${cl}", "fieldPath": "v", "indexes": [{ "order": "ASCENDING", "queryScope": "COLLECTION" }] },
{ "collectionGroup": "${cl}", "fieldPath": "ttl", "indexes": [] }` 
return x + (virg ? ',' : '')
}

export class FirestoreConnector extends DbConnector {
  public emulator: string
  public service_account: Object

  constructor (credentials: string, cryptKey: string) {
    super(credentials, cryptKey)
    this.service_account = credentials['service_account']
    this.emulator = config.FIRESTORE_EMULATOR_HOST
    Log.info('Firestore connector')
    this.factory = FirestoreConnexion.newConnexion
  }

  static async genSchema () {
    let cl = ''
    const l = []
    l.push(t1)
    let nbcl = DocType.docTypes.size
    for (const [,dt] of DocType.docTypes) {
      l.push('')
      nbcl--
      cl = dt.name
      let nbp = 2 * (dt.hasColls ? dt.colls.size : 0) + (dt.hasIndexes ? dt.indexes.size : 0)
      l.push(t2(cl, nbp || nbcl ? true : false))
      if (dt.hasColls) for (const [n, x] of dt.colls) {
        nbp--
        l.push(t3(cl, n, nbp || nbcl ? true : false))
      }
      if (dt.hasIndexes) for (const [n, x] of dt.indexes) {
        nbp--
        const f = x.global ? t4 : t3
        l.push(f(cl, n, nbp || nbcl ? true : false))
      }

      if (dt.hasColls) for (const [n, x] of dt.colls) {
        nbp--
        l.push(t5(cl + '@' + n, nbp || nbcl ? true : false))
      }
    }
    l.push('\n]\n}')
    const t = l.join('\n')
    writeFileSync(path.resolve(schemaPath), Buffer.from(t, 'utf8'))
    console.log(schemaPath + ' written')
  }

}

type update = {
  type: updType | null,
  dr: DocumentReference,
  row?: row | rowQ
}

const opFilter = [ '<', '<=', '==', '!=', '>=', '>', 'array-contains', 'array-contains-any']

export class FirestoreConnexion extends DbConnexion implements IDbGeneric {
  public static newConnexion (connector: FirestoreConnector, op: Operation, cryptKey?: string) {
    return new FirestoreConnexion(connector, op, cryptKey)
  }

  public fs : Firestore
  public service_account: Object
  updates: update[]
  
  constructor (connector: FirestoreConnector, op: Operation, cryptKey?: string) {
    super(connector, op, cryptKey)
    this.service_account = connector.service_account
  }

  async connect () {
    this.fs = new Firestore({ 
      projectId : this.service_account['project_id'],
      credentials: this.service_account
    })
  }

  // Méthode PUBLIQUE de déconnexion, impérative et sans exception
  async disconnect () {
    try { await this.fs.terminate() } catch (e2) { /* */ }
  }

  private trap (e: any) : [number, string] { // 1: busy, 2: autre
    if (e.constructor.name !== 'FirestoreError') throw e
    const s = (e.code || '???') + ' - ' + (e.message || '?')
    if (e.code && e.code === 'ABORTED') return [1, s]
    return [2, s]
  }

  async getSingleton (key: string) : Promise<string> {
    return null // TODO
  }
  async setSingleton (key: string, value: string) : Promise<void> {
    // TODO
  }

  async safeGet (st: safeTable, key: string, v: number) : Promise<[number, string]> {
    return null // TODO
  }

  async safeSet (st: safeTable, key: string, v: number, value: string) : Promise<void> {
    // TODO
  }

  /* Retourne l'objet safe depuis soit son id, soit son p0, soit son r0
  null si non trouvé
  */
  async getSafe (id: string) : Promise<[number, Safe]> {
    /* TODO
    let buf
    let lam
    let idx
    if (idp0r0 === IDP0R0.ID ) {
      const dr = this.fs.doc('Safe/' + id)
      const ds = await dr.get()
      if (!ds.exists) return null
      buf = ds.get('data')
      lam = ds.get('lam')
      idx = id
    } else {
      const cr = this.fs.collection('Safe/')
      const q: Query = idp0r0 === IDP0R0.P0 ? cr.where('p0', '==', id) : cr.where('r0', '==', id)
      const qs: QuerySnapshot = await q.get()
      if (qs.empty) return null
      const row = qs.docs[0].data()
      buf = row.data
      lam = row.lam
      idx = row.id
    }
    const cm = Util.currentMonth()
    if (cm !== lam) {
      this.fs.doc('Safe/' + idx).set({ lam: cm })
    }
    const data = Crypt.syncDecrypt(this.key, buf)
    return decode(data)
    */
   return null
  }

  async getBinSafe (id: string) : Promise<[number, Uint8Array]> {
    return null // TODO
  }

  async statusSafe (id: string, hp0: string, hr0: string) : Promise<Object> {
    return null // TODO
  }

  async newSafe (safe: Object) :  Promise<number> {
    // TODO
    return 0
  }

  async restoreSafe (safe: Safe) :  Promise<number> {
    // TODO
    return 0
  }

  async updPRSafe (safe: Object) :  Promise<number> {
    // TODO
    return 0
  }

  /* Met à jour ou insère un safe depuis son objet */
  async updSafe (safe: Object) :  Promise<void> {
    // A REVISER
    const id = safe['id']
    const r0 = safe['r0']
    const p0 = safe['p0']
    safe['maxLife'] = Math.floor(Date.now() / 86400) + safeLapse
    const ttl = new Timestamp(Math.floor(safe['maxLife']), 0)
    const data = Crypt.syncDecrypt(this.key, encode(safe))
    this.fs.doc('Safe/' + id).set( { p0, r0, ttl, data })
  }

  /* Supprime un safe depuis son id */
  async delSafe (id: string) :  Promise<void> {
    const dr = this.fs.doc('Safe/' + id)
    dr.delete()
  }

  /* Purge les safes obsolètes */
  async purgeSafes (lam: number) :  Promise<void> {
    const cr = this.fs.collection('Safe/')
    const q: Query = cr.where('lam', '<=', lam)
    const qs: QuerySnapshot = await q.get()
    if (!qs.empty) for (let doc of qs.docs)
      await doc.ref.delete()
  }

  setUpd (type: updType, dr: DocumentReference, row: row | rowQ ) {
    this.updates.push({type, dr, row})
  }

  setDel (dr: DocumentReference ) {
    this.updates.push({type: null, dr})
  }

  async commit () {
    for (const u of this.updates) {
      u.row['org'] = this.org
      if (!u.type) { 
        if (this.transaction) this.transaction.delete(u.dr); else await u.dr.delete()
      } else if (u.type === updType.CREATE) {
        if (this.transaction) this.transaction.create(u.dr, u.row); else if (u.row) await u.dr.create(u.row)
      } else if (u.type === updType.UPDATE) {
        if (this.transaction) this.transaction.update(u.dr, {...u.row}); else await u.dr.update({...u.row})
      } else { // SET
        if (this.transaction) this.transaction.set(u.dr, u.row); else if (u.row) await u.dr.set(u.row)
      }
    }
  }
  
  async doTransaction () : Promise<[number, string]> {
    try {
      await this.fs.runTransaction(async (transaction) => {
        this.transaction = transaction
        this.updates = []
        await this.op.transac()
        await this.commit()
      })
      this.transaction = null
      return [0, '']
    } catch (e) {
      this.transaction = null
      return this.trap(e)
    }
  }

  /* Transforme un row APP en row DB
  - calcul du TTL éventuel selon deleted et maxLife / now
  - crypt data, sauf si nocrypt
  Retourne le row
  */
  rowToDB (row: row, nocrypt?: boolean) : row {
    if (!row.data) // deleted
      row.ttl = new Timestamp(Math.floor(row.v / 1000) + zombiLapse, 0)
    else if (row.maxLife) {
      if (row.maxLife > this.op.now)
        row.ttl = new Timestamp(Math.floor(row.maxLife * 60), 0)
      delete row.maxLife
    }
    if (!nocrypt && row.data) row.data = Crypt.syncCrypt(this.key, row.data)
    return row
  }

  /* Transforme un row DB en row APP et le retourne:
  - si son ttl existe,
    - si dépassé : row.deleted est true
    - pas dépassé : converti en maxLife
  Si row.deleted: row.data est reconstitué NON crypté { deleted, v, _clazz, _pk }
  Sinon row.data est décrypté (ou non)
  */
  rowToAPP (clazz: string, row: row, nodecrypt?: boolean) : row {
    let sec = 0
    if (row.ttl) { 
      sec = row.ttl.seconds * 1000
      delete row.ttl
    }
    if (!row.data || (sec && (sec * 1000 < this.op.now))) {
      row.deleted = true
      row.data = encode({ deleted: true, v: row.v, _pk: row.pk, _clazz: clazz })
      return row
    }
    if (sec) row.maxLife = Math.floor(sec / 60)
    if (!nodecrypt) row.data = Crypt.syncDecrypt(this.key, row.data)
    return row
  }

  docRef (clazz: string, pk: string) {
    return this.fs.doc('Org/' + this.org + (clazz === 'Org' ? '' : '/' + clazz + '/' + pk))
  }

  /* Path: Org/demo/Article@auteurs/a5@Hugo
  'Hugo' a quitté la propriété 'auteurs' du document 'a5' de classe 'Article'
  */
  docRefQ (clazz: string, colName: string, pk: string, col: string) {
    return this.fs.doc('Org/' + this.org + '/' + clazz + '@' + colName + '/' + pk + '@' + col)
  }

  colRef (clazz: string) {
    return this.fs.collection('Org/'+ this.org + '/' + clazz)
  }

  colRefQ (clazz: string, colName: string) {
    return this.fs.collection('Org/' + this.org + '/' + clazz + '@' + colName)
  }

  /* Exportation des rows existants
  mark: dont les pk sont > pk
  limit: nombre max de rows lus
  Retourne:
    rows : la liste des rows - les row.data SONT CRYPTES
    eox: true si le nombre de rows exportés n'a pas atteint la limite
    lastMark: dernière pk lue
  ATTENTION !!! mark ne doit pas être '' (mettre '0' pour commencer)
  */
  async exportRows (clazz: string, mark: string, limit: number) : Promise<expList> {
    let n = 0
    let lastMark = ''
    const rows: row[] = []
    const cr = this.colRef(clazz)
    const fp = FieldPath.documentId()
    const q: Query = cr.where(fp, '>', mark || '1').orderBy(fp).limit(limit)
    const qs: QuerySnapshot = await q.get()
    if (!qs.empty) for (let doc of qs.docs) {
      n++
      lastMark = doc.id
      const row = this.rowToAPP(clazz, doc.data() as row, true)
      if (!row.deleted) rows.push(row)
    }
    return { rows, eox: n < limit, lastMark} 
  }

  /* Purge limit documents - Retourne true si la limite n'a pas été atteinte (fini)
  */
  async purgeRows (clazz: string, limit: number) : Promise<boolean> {
    let n = 0
    const cr = this.colRef(clazz)
    /* const fp = */ FieldPath.documentId()
    const q: Query = cr.limit(limit)
    const qs: QuerySnapshot = await q.get()
    const eop = qs.docs.length < limit
    if (!qs.empty) for (let doc of qs.docs)
      await doc.ref.delete()
    return eop
  }

  /* Import (insert / création) les rows : 
  - les row.data DOIVENT être cryptés par l'appelant
  */
  async importRows (clazz: string, rows: row[]) : Promise<void> {
    for(const row of rows) {
      const r = this.rowToDB(row, true)
      const dr = this.docRef(clazz, r.pk)
      await dr.create(r)
    }
  }

  /* Exportation des rows n'ayant pas dépassé leur TTL
  mark: dont les id sont > mark
  limit: nombre max de rows lus
  Retourne:
    rows : la liste des rows
    eox: true si le nombre de rows exportés n'a pas atteint la limite
    mark: dernière pk@col lue
  */
  async exportRowsQ (clazz: string, colName: string, mark: string, limit: number) 
    : Promise<expListQ> {
    let n = 0
    let lastMark = ''
    const rows: rowQ[] = []
    const cq = this.colRefQ(clazz, colName)
    const fp = FieldPath.documentId()
    const q: Query = cq.where(fp, '>', mark || '1').orderBy(fp).limit(limit)

    const qs: QuerySnapshot = await q.get()
    if (!qs.empty) for (let doc of qs.docs) {
      n++
      lastMark = doc.id
      const ttl = doc.get('ttl') as Timestamp
      if (ttl.seconds * 1000 > this.op.now) {
        const v = doc.get('v')
        const col = doc.get('col')
        // pk : pk du document ayant quitté
        const pk = doc.id.substring(0, doc.id.indexOf('@'))
        rows.push({pk, col, v})
      }
    }
    return { rows, eox: n < limit, lastMark} 
  }

  /* Purge limit documents - Retourne true si la limite n'a pas été atteinte (fini)
  */
  async purgeRowsQ (clazz: string, colName: string, limit: number) : Promise<boolean> {
    let n = 0
    const cq = this.colRefQ(clazz, colName)
    /* const fp = */ FieldPath.documentId()
    const q: Query = cq.limit(limit)
    const qs: QuerySnapshot = await q.get()
    const eop = qs.docs.length < limit
    if (!qs.empty) for (let doc of qs.docs)
      await doc.ref.delete()
    return eop
  }

  /* Import (insert / création) les rowQ
  */
  async importRowsQ (clazz: string, colName: string, rows: rowQ[]) : Promise<void> {
    for(const row of rows) {
      const dr = this.docRefQ(clazz, colName, row.pk || '', row.col)
      const r : rowQ = { 
        col: row.col, 
        v: row.v,
        ttl: new Timestamp(Math.floor(row.v / 1000) + zombiLapse, 0)
      }
      await dr.create(r)
    }
  }

  /* Inscrit (SET CREATE UPDATE) un row:
  - clazz: classe du document - 'Article'
  - row: row
  */
  writeRow (ut: updType, clazz: string, row: row) : void {
    this.setUpd(ut, this.docRef(clazz, row.pk), this.rowToDB(row))
  }

  /* Supprime (réellement) un document 
  */
  deleteRow (clazz: string, pk: string) : void {
    this.setDel(this.docRef(clazz, pk))
  }

  /* Inscrit le rowQ déclarant que le document clazz/pk ne fait plus
  partie de la collection clazz/col à partir de v.
  - clazz: classe du document - 'Article'
  - org: code l'organisation - 'demo'
  - colName: nom de la propriété de sous-collection - 'auteurs'
  - pk: identifiant du document "quitté"
  - row APP: { v, col, pk }
  Path: Org/demo/Article@auteurs/a5@Hugo
  Hugo a quitté la propriété auteurs du document a5 de classe Article 
  row DB: { v, col, ttl }
  */
  writeRowQ (clazz: string, colName: string, row: rowQ) : void {
    const r : rowQ = { 
      col: row.col, 
      v: row.v,
      ttl: new Timestamp(Math.floor(row.v / 1000) + zombiLapse, 0)
    }
    this.setUpd(updType.SET, this.docRefQ(clazz, colName, row.pk || '', row.col), r)
  }

  /* Retourne les data sérialisés de tous les rows de la classe indiquée:
  - si v = 0: tous ceux existant réellement à l'instant t.
  - sinon: ceux mis à jour ou zombifiés postérieueremt à v.
  */
  async allRowsData (clazz: string, v: number) : Promise<Uint8Array[]>{
    const datas: Uint8Array[] = []
    const cr = this.colRef(clazz)
    const q: Query = !v ? cr : cr.where('v', '>', v)
    const qs: QuerySnapshot = this.transaction ? await this.transaction.get(q) : await q.get()
    if (!qs.empty) for (let doc of qs.docs) {
      const row = this.rowToAPP(clazz, doc.data() as row)
      if (v || !row.deleted) datas.push(row.data)
    }
    return datas
  }

  /* Retourne le row de classe fixée ayant la pk fixée:
  - si v absent: ne retourne pas le row s'il est supprimé
  - si v présent ne retourne le row QUE s'il a été mis à jour ou supprimé après v.
  */
  async oneRow (clazz: string, pk: string, v: number) : Promise<row | null> {
    const cr = this.colRef(clazz)
    const q: Query = !v ? cr.where('pk', '==', pk) : cr.where('pk', '==', pk).where('v', '>', v)
    const qs: QuerySnapshot = this.transaction ? await this.transaction.get(q) : await q.get()
    if (qs.empty) return null
    const row = this.rowToAPP(clazz, qs.docs[0].data() as row)
    return v || !row.deleted ? row : null
  }

  /* Retourne la sous-collection 'clazz/colName/colValue' des documents 
  (par exemple: Article/auteurs/Zola)
  - si vs est absent: connue actuellement (à now)
  - sinon documents ajoutés ou partis de la sous-collection (ou zombifiés) 
    depuis la version vs de la sous-collection connue en session.
  Retour: liste des documents (leur version la plus récente). 
  - Certains d'entre eux peuvent ne plus appartenir à la collection ou être zombi
    (à vérifier en session).
  */
  async getColl(clazz: string, colName: string, col: string, isList: boolean, vs: number) 
    : Promise<Uint8Array[]> {
    
    // Map des documents par pk
    const m: Map<string, vdata> = new Map<string, vdata>()
    const datas: Uint8Array[] = []
    const crd = this.colRef(clazz)
    const crq = this.colRefQ(clazz, colName)
    const comp = isList ? 'array-contains' : '=='

    let q: Query
    if (!vs) {
      q = crd.where(colName, comp, col)
    } else {
      q = crd.where(colName, comp, col).where('v', '>', vs)
    }
    let qs: QuerySnapshot = this.transaction ? await this.transaction.get(q) : await q.get()
    if (!qs.empty) for (let doc of qs.docs) {
      const row = this.rowToAPP(clazz, doc.data() as row)
      if (!vs) {
        if (!row.deleted) datas.push(row.data)
      } else if (!row.deleted) m.set(row.pk, { v: row.v, data: row.data })
    }
    if (!vs) return datas

    q = crq.where('col', '==', col).where('v', '>', vs)
    qs = this.transaction ? await this.transaction.get(q) : await q.get()
    if (!qs.empty) for (let doc of qs.docs) {
      const ttl = doc.get('ttl') as Timestamp
      if (ttl.seconds * 1000 > this.op.now) {
        const v = doc.get('v')
        const pk = doc.id.substring(0, doc.id.indexOf('@'))
        const vd = m.get(pk)
        if (!vd || (v > vd.v)) {
          const r = await this.oneRow(clazz, pk, vs)
          m.set(pk, { v: r.v, data: r.data })
        }
      }
    }
    for(const [, {data}] of m) datas.push(data)
    return datas
  }

  /* Sélectionne les documents et les transmet à la fonction de traitement
  Par organisation.
  */
  async selectDocs(clazz: string, colName: string, filter: filter, col: any, 
    order: string, limit: number, fn: Function) : Promise<void> {
    
    let q: Query = this.colRef(clazz).where(colName, opFilter[filter] as WhereFilterOp, col)
    if (order) q = q.orderBy(order)
    if (limit) q = q.limit(limit)
    const qs: QuerySnapshot = this.transaction ? await this.transaction.get(q) : await q.get()
    if (!qs.empty) for (let doc of qs.docs) {
      const row = this.rowToAPP(clazz, doc.data() as row)
      if (!row.deleted) fn(row)
    }
  }

  /* Sélectionne les documents et les transmet à la fonction de traitement
  Toutes organisations confondues
  */
  async selectDocsGlobal(clazz: string, colName: string, filter: filter, col: any, 
    order: string, limit: number, fn: Function)  : Promise<void> {

    let q: Query = this.fs.collectionGroup(clazz).where(colName, opFilter[filter] as WhereFilterOp, col)
    if (order) {
      let dir = 'asc'
      if (order.startsWith('-')) {
        order = order.substring(1)
        dir = 'desc'
      }
      q = q.orderBy(order, dir as OrderByDirection)
    }
    if (limit) q = q.limit(limit)
    const qs: QuerySnapshot = this.transaction ? await this.transaction.get(q) : await q.get()
    if (!qs.empty) for (let doc of qs.docs) {
      const row = this.rowToAPP(clazz, doc.data() as row)
      if (!row.deleted) {
        const p = doc.ref.path
        const i = p.indexOf('/', 5)
        const org = p.substring(4, i)
        fn(org, row)
      }
    }
  }
}
