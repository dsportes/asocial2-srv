import { DocType } from './doctypes'
import { row } from './iDbGeneric'
import { config } from './config'
import { encode } from '@msgpack/msgpack'
import { Crypt } from './crypt'
import { Operation } from './operation'

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

  // Numéro de release de la structure de la classe
  get classRelease() : number {
    const cl = config.documentClasses[this._clazz]
    return cl ? cl.release : 0
  }

  // true si le Document est de la dernière release
  get hasLastRelease () : boolean {
    return this.release === this.classRelease
  }

  // Descriptif DocType du document
  get docType () : DocType { return DocType.get(this._clazz) }

  // Retourne la VALEUR HASH de pk (séparation par / PUIS hash)
  get pk () : string { return this.docType.pkValue(this)}

  // Retourne la VALEUR NON HACHEE de pk (séparation par /)
  get pkNH () : string { return this.docType.pkValue(this)}

  /* Retourne la VALEUR de la propriété "collection" nommée name:
  C'est un STRING[] des valeurs hachées.
  Quand la propriété de collection N'EST PAS une liste, sa valeur est [0]
  */
  collValue (name: string) : string[] { return this.docType.getColl(this, name)}

  /* Retourne la VALEUR la propriété d'index nommée name:
  Selon le type de cette propriété c'est:
  - string : pour les type STRING HASH
  - number : pour les types INTEGER FLOAT
  - string[] : pour le type LIST
  */
  idxValue (name: string) : any { return this.docType.getIdx(this, name)}

  /* Invoqué après lecture de DB, désérialisation du data et création
  du Document associé. Traitement éventuel, pour génération de propriétés
  d'aide / techniques faciltant les consultations / mises à jour applicatives.
  FACULTATIF: compile () { }
  */

  /* Invoqué avant sérialisation du Document en "data" pour écriture en DB.
  Reconstitution éventuelle de propriétés, synthèses, etc.
  */
  decompile (op: Operation, org: string, clazz: string) : void { }

  /* Invoqué pour sérialisation un Document à destination de l'application terminale.
  Passe dans le "résultat" de l'opération.
  A défaut de surcharge applicative:
  - transmet org et clazz et 
  - toutes les propriétés du document dont le nom ne commencent pas par _
  */
  serialForApp (op: Operation, org: string, clazz: string) : Uint8Array { 
    const d = { org, clazz }
    for (const k of Object.keys(this)) if (k.charAt[0] !== '_') d[k] = this[k]
    return encode(d)
  }

  /* Méthodes INTERNES au FW ***************************************************/

  /* Création de l'instance de "Document" depuis des valeurs initiales de propriétés,
  - row lu de la DB
  - propriétés de création.
  Retourne le Document.
  */
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

  /* Construit un "row" pour DB depuis un document
  decompile() a été invoqué juste avant.
  */
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

}
