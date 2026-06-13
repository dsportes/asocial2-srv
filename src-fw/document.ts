import { DocType } from './doctypes'
import { row } from './iDbGeneric'
import { config, Registry } from './config'
import { encode } from '@msgpack/msgpack'
import { AppExc } from '../src-fw/index'

export enum DocStatus { NONE, UPD, NEW, DEL }

export type changedColl = {
  n: string, // nom de la collection
  a: string, // valeur actuelle
  b: string // valeur avant
}

export class Document {
  _clazz: string
  _status?: DocStatus
  _before?: Map<string, string[]> // Map des valeurs des collections AVANT
  _deleted?: boolean
  v: number
  release: number // numéro de release de la structure de l'objet
  maxLife?: number // EPOCH en MINUTES de fin de vie logique du document

  /* Mute un data en fonction de sa release et d'éventuelles options
  Met à jour, supprime ajoute les propriétés requises dans la
  dernière version en fonction de sa release actuell.
  Retourne couple du data (ancien ou celui muté) 
  et de l'indicateur de mutation (false si inchangé)
  */
  static mutate (clazz: string, data: any, options?: Object) : [any, boolean] {
    const cl = Registry.getD(clazz, data)
    if (!cl) return [data, false]
    const f = cl.mutateCl
    return f ? f(data, options) : [data, false]
  }

  // Numéro de release de la structure de la classe
  get classRelease() : number {
    const cl = Registry.getD(this._clazz, this)
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

  // Retourne true si le document n'est pas _zombi_ et n'a pas dépassé sa maxLife
  isAlive (now: number) : boolean {
    if (this._deleted) return false
    return !this.maxLife || (this.maxLife * 60000 > now)
  }

  get isZombi () : boolean {
    return this._deleted || this._status === DocStatus.DEL
  }

  /* Retourne la VALEUR de la propriété "collection" nommée name:
  C'est un STRING[] des valeurs hachées.
  Quand la propriété de collection N'EST PAS une liste, sa valeur est [0]
  */
  collValue (name: string) : string[] { return this.docType.getCollId(this, name)}

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

  /* Invoqué pour sérialisation un Document à destination de l'application terminale.
  Passe dans le "résultat" de l'opération.
  A défaut de surcharge applicative:
  - transmet org et clazz et 
  - toutes les propriétés du document dont le nom ne commencent pas par _
  */
  serialForApp (clazz: string) : Uint8Array { 
    const d = { clazz }
    for (const k of Object.keys(this)) if (k.charAt[0] !== '_') d[k] = this[k]
    return encode(d)
  }

  // Surchargé par classe
  compile () {}

  /* Méthodes INTERNES au FW ***************************************************/

  /* Création de l'instance de "Document" depuis des valeurs initiales de propriétés,
  - row lu de la DB
  - propriétés de création.
  Retourne le Document.
  */
  static newDoc (clazz: string, status: DocStatus, initVals: Object) : Document {
    const cl = Registry.getD(clazz, initVals)
    if (!cl) throw new AppExc(105, 'document_class_not_registered', null, [clazz])
    const doc = new cl() as Document
    doc._clazz = clazz
    doc._status = status
    doc.release = cl.release
    doc.v = 0
    let data = initVals
    if (status === DocStatus.NONE && cl.mutateCl) {
      const [d, m] = cl.mutate(initVals)
      if (m) data = d
    }
    for (const [key, value] of Object.entries(data)) 
      if (!key.startsWith('_')) doc[key] = value
    doc.compile()
    /* _before: Map: traçant les collections
      - clé: nom de la collection
      - valeur: valeur de la propriété clé de la collection dans le document 
        AVANT mise à jour éventuelle de cette valeur
    */
   if (doc._status !== DocStatus.NEW && doc.docType.hasColls)
      doc._before = doc.docType.extractColls(doc)
    return doc
  }

  /* Construit un "row" pour DB depuis un document - data encodé pas crypté
  */
  toRow (now: number) {
    const d = {}
    for (const k of Object.keys(this))
      if (k.charAt(0) !== '_') d[k] = this[k]
    d['v'] = now
    const x = encode(d)
    const row: row = {
      v: now,
      pk: this.pk,
      data: x,
      dataORIG: new Uint8Array(x)
    }
    const ml = this['maxLife']; if (ml) row.maxLife = ml
    const dt = this.docType
    if (dt.colls) for (const [n, c] of dt.colls) 
      row[n] = c.list ? this.collValue(n) : this.collValue(n)[0]
    if (dt.indexes) for (const [n, ] of dt.indexes) 
      row[n] = this.idxValue(n)
    return row
  }

  /* Construit un "row minimal" pour DB - data null */
  toZombiRow (now: number) : row {
    /*
    const dt = this.docType
    const d = { v : now, _deleted: true }
    dt.pk.forEach(p => { const v = this[p] ; if (v) d[p] = v })
    const row: row = {
      v: now,
      pk: this.pk,
      deleted: true,
      data: Crypt.syncCrypt(key, encode(d))
    }
    */
    return { v: now, pk: this.pk, data: null }
  }

}
