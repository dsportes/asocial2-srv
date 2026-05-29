import { Document } from './document'
import { Crypt } from './crypt'
import { filter } from './iDbGeneric'
import { decode } from '@msgpack/msgpack'
import { OperationWC } from './index'
import { Registry } from './config'
import { DocType } from './doctypes'
// import { AuthRecord } from '../src-fw/operation'

export function loadingDF () {
  console.log('fw documents loading: ', Registry.sizeD())
}

const encoder = new TextEncoder()
// const decoder = new TextDecoder()

class Task extends Document {
  static release = 0

}
Registry.registerD(Task)

export type OrgStatus = {
  st: number // code 0: inconnu 1: UP 2: READ-ONLY 9: DOWN
  at: number // time de dernière mise à jour
  txt: string // texte explicatif éventuel de l'administrateur
}

export class OrgA extends Document {
  static release = 0
  status: OrgStatus

  isUP () { return this.status && (this.status.st === 1 || this.status.st === 2) }
  isRO () { return this.status && this.status.st === 2 }
  isRW () { return this.status && this.status.st === 1 }
  isDOWN () { return this.status && this.status.st === 9 }

}

export class PropertyA extends Document {
  static release = 0
  id: string
  value: Object
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

  static newSubs (op: OperationWC, subs: subscription, maxLife: number) : Document {
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
Registry.registerD(Subs)

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

  static newSubsItem (op: OperationWC, sessionId: string, def: string, maxLife: number) : Document {
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
  static async getSessionIds (op: OperationWC, def: string) : Promise<string[]> {
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

  static async deleteSessionId (op: OperationWC, sessionId: string) : Promise<void> {
    // deleteDoc (org: string, clazz: string, pk: string) : Promise<void>
    op.db.selectDocs('SubsItem', 'sessionId', filter.EQ, sessionId, '', 0, 
      async (org: string, data: Uint8Array) => {
        const d = decode(data)
        const pk = Crypt.shaS(sessionId + '/' + d['def'])
        op.db.deleteRow('SubsItem', pk)
      })
  }

}
Registry.registerD(SubsItem)

export type Cred = {
  pubv: Uint8Array
  pubc: Uint8Array
  limit: number
  opaque: Uint8Array | null
  more: any
  credId: string
}

export class Credential extends Document {
  static release = 0

  credId: string
  docCl: string
  docId: string
  /* epoch en MINUTES de fin de validité
  Recopie de cred.limit ou 0 */
  maxLife: number
  cred: any

  static async listManagers (op: OperationWC) : Promise<Cred[]> {
    return await Credential.listByDoc(op, 'Org', '1')
  }

  static async listByDoc (op: OperationWC, docCl: string, docId: string) : Promise<Cred[]> {
    const dd = DocType.get('Credential')
    const val = dd.getIdx({ docCl, docId }, 'doc')
    const lst: Cred[] = []
    await op.db.selectDocs('Credential', 'doc', filter.EQ, val[0], '', 0, 
      async (data) => {
        try {
          const obj = decode(data) as Credential
          const c = obj.cred
          delete c.pubv
          delete c.pubc
          lst.push(c)
        } catch(e) {
          console.log(e)
        }
      })
    return lst
  }

}
Registry.registerD(Credential)

export type CaseObj = { // de document
  caseId: string // ID universel généré aléatoirement à la création.
  v: number // version du document. Elle détermine aussi la limite de validité du document.
  userId: string // ID de l'utilisateur détenteur du cas. Depuis une opération du service la clé publique de cryptage `CU` est donc accessible.
  topicId: string // ID du topic auquel le cas se rapporte.
  subject: string // code (facultatif) désignant une cible plus précise permettant à un utilisateur _sponsor_ de se concentrer sur un sujet précis. 
  status: number // 0-annulé 1-actif-U 2-actif-H 3-finalisé.
  tabX: Uint8Array | null // texte de l'ardoise crypté par `X`
  etc: any // objet qui ne peut être écrit configuré que par une opération d'un _sponsor_ autorisé.
  maxLife: number // epoch en MINUTES
}

export class Case extends Document {
  caseId: string = '' // ID universel généré aléatoirement à la création.
  v: number = 0 // version du document. Elle détermine aussi la limite de validité du document.
  userId: string = '' // ID de l'utilisateur détenteur du cas. Depuis une opération du service la clé publique de cryptage `CU` est donc accessible.
  topicId: string = '' // ID du topic auquel le cas se rapporte.
  subject: string = '' // code (facultatif) désignant une cible plus précise permettant à un utilisateur _sponsor_ de se concentrer sur un sujet précis. 
  status: number = 0 // 0-annulé 1-actif-U 2-actif-H 3-finalisé.
  tabX: Uint8Array | null  = null // texte de l'ardoise crypté par `X`
  etc: any = {} // objet qui ne peut être écrit configuré que par une opération d'un _sponsor_ autorisé.
  maxLife: number // epoch en MINUTES

  static lp1 = ['caseId', 'v', 'userId', 'topicId', 'subject', 'status', 'tabX', 'etc', 'maxlife']

  toObj () : CaseObj {
    const obj = {}; for (const p of Case.lp1) obj[p] = this[p]; return obj as CaseObj
  }

  constructor (obj?: CaseObj) {
    super()
    if (obj) for (const p of Case.lp1) this[p] = obj[p]
  }

  /* Liste des demandes des cas à traiter par un sponsor*/
  static async listCases (op: OperationWC, topicId: string, subject: string) : Promise<Uint8Array[]> {
    const dt = DocType.get('Case')
    if (subject) {
      const val = dt.getIdx({ topicId, subject}, 'topicsub')
      return await op.db.getColl('Case', 'topicsub', val, false, 0)
    }
    const val = dt.getIdx({ topicId }, 'topic')
    return await op.db.getColl('Case', 'topic', val, false, 0)
  }

  /* Est "surchargée" selon le topic. Le user est-il un "sponsor" possible */
  async checkSponsor (op: OperationWC) : Promise<boolean> {
    return false
  }

  /* A surcharger selon le type d'invitation. */
  async validate (op: OperationWC, args: any) : Promise<number> {
    return 0
  }

}
Registry.registerD(Case)
