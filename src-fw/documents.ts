import { Document, DocStatus } from './document'
import { Crypt } from './crypt'
import { filter, IDbGeneric } from './iDbGeneric'
import { encode, decode } from '@msgpack/msgpack'
import { Operation } from './operation'
import { config } from './config'

export class Task extends Document {
  static release = 0

}

/* 
- sessionId : shaS de subJSON clé primaire
- subJSON : token web-push
- v : version
- defs : une map `{ hdef: [def, msg] }`
  - def: sa définition.
  - msg: est un message facultatif.
  - hdef: hash de def
*/
export type subscription = {
  sessionId: string
  subJSON: string
  defs: Object
}

/* Un document Subs décrit la souscription d'une session:
*/
export class Subs extends Document {
  static release = 0

  sessionId: string
  subJSON: string
  defs: Object
  maxLife: number

  static newSubs (op: Operation, subs: subscription) : Document {
    const initVals = { 
      subJSON: subs.subJSON,
      sessionId: subs.sessionId,
      defs: subs.defs,
      maxLife : op.SUBSMAXLIFE
    }
    return op.cache.newDoc('', 'Subs', initVals)
  }
  
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
  maxLife : number

  constructor () {
    super()
  }

  static hdef (def: string[]) {
    return Crypt.shaS(def.join('/'))
  }

  static hdef0 (org: string, clazz: string) : string {
    return Crypt.shaS(org + '/' + clazz)
  }

  static hdef1 (org: string, clazz: string, pk: string) : string {
    return Crypt.shaS(org + '/' + clazz + '/' + pk)
  }

  static hdef2 (org: string, clazz: string, colName: string, val: string) : string {
    return Crypt.shaS(org + '/' + clazz + '/' + colName + '/' + val)
  }

  static newSubsItem (op: Operation, sessionId: string, def: string) : Document {
    const initVals = {
      sessionId: sessionId,
      hdef: Crypt.shaS(def),
      maxLife : op.SUBSMAXLIFE
    }
    return op.cache.newDoc('', 'SubsItem', initVals)
  }

  /* Retourne la liste des sessionId des sessions ayant une souscription de définition def
  (La méthode SubsItem.def(...) construit un def depuis des arguments )
  */
  static async getSessionIds (op: Operation, hdef: string) : Promise<string[]> {
    /*
    selectDocsGlobal(clazz: string, colName: string, filter: filter, col: any, 
      order: string, limit: number, fn: Function)  : Promise<void>
    */
    const sids : string[] = []
    op.db.selectDocsGlobal('SubsItem', 'hdef', filter.EQ, hdef, '', 0, 
      (org: string, data: Uint8Array) => {
        const d = decode(data)
        sids.push(d['sessionId'])
      })
    return sids
  }

  static async deleteSessionId (op: Operation, sessionId: string) : Promise<void> {
    // deleteDoc (org: string, clazz: string, pk: string) : Promise<void>
    op.db.selectDocsGlobal('SubsItem', 'sessionId', filter.EQ, sessionId, '', 0, 
      async (org: string, data: Uint8Array) => {
        const d = decode(data)
        const pk = Crypt.shaS(sessionId + '/' + d['hdef'])
        op.db.deleteRow('', 'SubsItem', pk)
      })
  }

}
