import { DocType } from './doctypes'
import { row } from './iDbGeneric'
import { config } from './config'
import { encode } from '@msgpack/msgpack'
import { Crypt } from './crypt'

export enum DocStatus { NONE, UPD, NEW, DEL }

export type changedColl = {
  n: string, // nom de la collection
  a: string, // valeur actuelle
  b: string // valeur avant
}

export class Document {
  _clazz: string
  _org: string
  _status?: DocStatus
  _before?: Object
  v: number
  release: number // numéro de release de la structure de l'objet

  /* Mute un data en fonction de sa release et d'éventuelles options
  Met à jour, supprime ajoute les prpropriétés requises dans la
  dernière version en fonction de sa release actuell.
  Retourne couple du data (ancien ou celui muté) 
  et de l'indicateur de mutation (false si inchangé)
  */
  static mutate (clazz: string, data: any, options?: Object) : [any, boolean] {
    const cl = config.documentClasses[clazz]
    if (!cl) return [data, false]
    const f = cl.mutateCl
    return f ? f(data, options) : [data, false]
  }

  static newDoc (clazz: string, org: string, status: DocStatus, initVals: Object) : Document {
    const cl = config.documentClasses[clazz]
    if (!cl) return null
    const doc = new cl()
    doc._clazz = clazz
    doc._org = org
    doc._status = status
    doc.release = cl.release
    doc.v = 0
    let data = initVals
    if (status === DocStatus.NONE && cl.mutateCl) {
      const [d, m] = cl.mutate(initVals)
      if (m) data = d
    }
    for (const [key, value] of Object.entries(data)) this[key] = value
    if (doc.compile) doc.compile()
    if (!DocStatus.NONE) doc._before = doc.docType.extractColls(doc)
    return doc
  }

  // Numéro de release de la structure de la classe
  get classRelease() : number {
    const cl = config.documentClasses[this._clazz]
    return cl ? cl.release : 0
  }

  get hasLastRelease () : boolean {
    return this.release === this.classRelease
  }

  get docType () : DocType { return DocType.get(this._clazz) }

  get pk () : string { return this.docType.pkValue(this)}

  collValue (name: string) : string[] { return this.docType.getColl(this, name)}

  idxValue (name: string) : any { return this.docType.getIdx(this, name)}
  
  // Construit un "row" pour DB depuis un document
  toRow (now: number, key: Uint8Array) {
    const d = {}
    for (const k of Object.keys(this))
      if (k.charAt[0] !== '_') d[k] = this[k]
    d['v'] = now
    const row: row = {
      clazz: this._clazz,
      v: now,
      pk: this.pk,
      data: Crypt.syncCrypt(key, encode(d))
    }
    const dt = this.docType
    for (const [n, c] of dt.colls) row[n] = c.list ? this.collValue(n) : this.collValue(n)[0]
    for (const [n, ] of dt.indexes) row[n] = this.idxValue(n)
    return row
  }

  /* Construit un "row" pour DB depuis un "data" ZOMBI de document
  { v, deleted, propriétés de pk }
   */
  toZombiRow (now: number, key: Uint8Array) {
    const dt = this.docType
    const d = { v : now, deleted: true }
    dt.pk.forEach(p => { const v = this[p] ; if (v) d[p] = v })
    const row: row = {
      clazz: this._clazz,
      v: now,
      pk: this.pk,
      deleted: true,
      data: Crypt.syncCrypt(key, encode(d))
    }
    return row
  }

  // Absrtract : compile () { }

}
