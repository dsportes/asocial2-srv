import { Document, DocStatus } from './document'
import { Crypt } from './crypt'
import { filter, IDbGeneric } from './iDbGeneric'
import { encode, decode } from '@msgpack/msgpack'

export class Task extends Document {
  static release = 0

}

/* Un document Subs décrit la souscription d'une session:
- wpToken : le token de la session.
- sessionId : sha16 de wpToken clé primaire
- v : version
- defs : une map `{ hdef: [def, msg] }`
  - def: sa définition.
  - msg: est un message facultatif.
  - hdef: hash de def
*/
export class Subs extends Document {
  static release = 0

  static newSubs (wpToken: string, sessionId: string, defs: Object) : Document {
    const initVals = { v: 0, wpToken, sessionId, defs }
    return Document.newDoc('Subs', '', DocStatus.NEW, initVals)
  }
  
}

export type defStruct = {
  type: number // 0 1 2
  org: string
  clazz: string
  colName: string // nom de la colonne
  colVal: string // valeur de colonne name
  pkVal: string // valeur de la pk
}

/* Une souscription élémentaire SubsItem d'une sessionId est IMMUTABLE 
et peut avoir trois formes:
- 0 : souscription à la classe de documents: tous changements des documents de la classe 
  dont les créations et les zombifications.
- 1 : souscription à un document de pk citée. pk est un hash de la ou des
  propriétés de la clé primaire.
- 2 : souscription à la sous-collection nommée des documents de la classe

La définition def d'un SubsItem est le string:
- type 0: org/clazz
- type 1: org/clazz/pkVal
- type 2: org/clazz/colName/colVal
hdef est une propriété indexée: permet de récupérer tous les SubsItem 
  ayant même définition (donc les sessionId correspondantes)
*/
export class SubsItem extends Document {
  static release = 0

  sessionId : string
  hdef : string // INDEXE - hash de def

  constructor (sessionId: string, def: string) {
    super()
    this.sessionId = sessionId
    this.hdef = Crypt.sha16(def)
  }

  static defFromStruct (s: defStruct) {
    let x = s.org + '/' + s.clazz
    if (s.type) {
      if (s.type === 1) x += '/' + s.pkVal
      else x += '/' + s.colName + '/' + s.colVal
    }
    return x
  }

  static defToStruct (def: string) : defStruct {
    const as : string[] = def.split('/')
    const org = as[0]
    const clazz = as[1]
    let colName = '' // nom de la colonne
    let colVal = '' // valeur de colonne name
    let pkVal = '' // valeur de la pk
    const type = as.length - 2
    if (type === 1) pkVal = as[2]
    else if (type === 2) { colName = as[2]; colVal = as[3] }
    return { type, org, clazz, pkVal, colName, colVal }
  }

  /* Retourne la liste des sessionId des sessions ayant une souscription de définition def
  (La méthode SubsItem.def(...) construit un def depuis des arguments )
  */
  static async getSessionIds (db: IDbGeneric, def: string) : Promise<string[]> {
    /*
    selectDocsGlobal(clazz: string, colName: string, filter: filter, col: any, 
      order: string, limit: number, fn: Function)  : Promise<void>
    */
    const hdef = Crypt.sha16(def)
    const sids : string[] = []
    db.selectDocsGlobal('SubsItem', 'hdef', filter.EQ, hdef, '', 0, 
      (org: string, data: Uint8Array) => {
        const d = decode(data)
        sids.push(d['sessionId'])
      })
    return sids
  }

  /*
  sessionId : string
  org: string
  clazz: string
  val : string // valeur de la pk ou de la colonne name
  name : string // nom de la colonne
  hdef : string // INDEXE - hash de def

  get type () { return this.name ? 2 : (this.val ? 1 : 0) }

  static declare (sessionId: string, def: string) {
    const as : string[] = def.split('/')
    switch (as.length) {
      case 2 : return new SubsItem(sessionId, as[0], as[1], '', '')
      case 3 : return new SubsItem(sessionId, as[0], as[1], as[2], '')
      case 4 : return new SubsItem(sessionId, as[0], as[1], as[2], as[3])
    }
  }

  constructor (sessionId: string, org: string, clazz: string, pkVal?: string, colName?: string, colVal?: string) {
    super()
    this.sessionId = sessionId
    this.org = org
    this.clazz = clazz
    this.val = pkVal || colName ? ( pkVal || colName) : ''
    this.name = colName || ''
    this.hdef = Crypt.sha16(this.def)
  }

  get def () {
    switch (this.type) {
      case 0 : return this.org + '/' + this.clazz
      case 1 : return this.org + '/' + this.clazz + '/' + this.val
      case 0 : return this.org + '/' + this.clazz + '/' + this.name+ '/' + this.val
    }
  }
  */

}
