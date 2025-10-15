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
- url : url de l'application à ouvrir par le terminal sur web-push
- title : titre des notifications web-push
- v : version
- defs : un object `{ def: msg ... }` liste les définitions
  - def: sa définition.
  - msg: est un message ou ''
*/
export type subscription = {
  sessionId: string
  subJSON: string
  url: string
  title: string
  defs: Object
}

/* Un document Subs décrit la souscription d'une session:
*/
export class Subs extends Document {
  static release = 0

  sessionId: string
  subJSON: string
  defs: Object
  url: string
  title: string
  maxLife: number

  static newSubs (op: Operation, subs: subscription, maxLife: number) : Document {
    const initVals = { 
      subJSON: subs.subJSON,
      sessionId: subs.sessionId,
      url: subs.url,
      title: subs.title,
      defs: subs.defs,
      maxLife : maxLife
    }
    return op.cache.newDoc('Subs', initVals)
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
- type 0: clazz
- type 1: clazz/pkVal (c'est un shaC)
- type 2: clazz/colName/colVal (c'est un shaC)
def est une propriété indexée: permet de récupérer tous les SubsItem 
  ayant même définition (donc les sessionId correspondantes)
*/
export class SubsItem extends Document {
  static release = 0

  sessionId : string
  def : string // INDEXE
  maxLife : number

  constructor () {
    super()
  }

  static def0 (clazz: string) : string {
    return clazz
  }

  static def1 (clazz: string, pk: string) : string {
    return clazz + '/' + pk
  }

  static def2 (clazz: string, colName: string, val: string) : string {
    return clazz + '/' + colName + '/' + val
  }

  static newSubsItem (op: Operation, sessionId: string, def: string, maxLife: number) : Document {
    const initVals = {
      sessionId: sessionId,
      def: def,
      maxLife : maxLife
    }
    return op.cache.newDoc('SubsItem', initVals)
  }

  /* Retourne la liste des sessionId des sessions ayant une souscription de définition def
  (La méthode SubsItem.def(...) construit un def depuis des arguments )
  */
  static async getSessionIds (op: Operation, def: string) : Promise<string[]> {
    /*
    selectDocsGlobal(clazz: string, colName: string, filter: filter, col: any, 
      order: string, limit: number, fn: Function)  : Promise<void>
    */
    const sids : string[] = []
    op.db.selectDocs('SubsItem', 'def', filter.EQ, def, '', 0, 
      (org: string, data: Uint8Array) => {
        const d = decode(data)
        sids.push(d['sessionId'])
      })
    return sids
  }

  static async deleteSessionId (op: Operation, sessionId: string) : Promise<void> {
    // deleteDoc (org: string, clazz: string, pk: string) : Promise<void>
    op.db.selectDocs('SubsItem', 'sessionId', filter.EQ, sessionId, '', 0, 
      async (org: string, data: Uint8Array) => {
        const d = decode(data)
        const pk = Crypt.shaS(sessionId + '/' + d['def'])
        op.db.deleteRow('SubsItem', pk)
      })
  }

}
