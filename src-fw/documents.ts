import { Document, DocStatus } from './document'
import { Crypt } from './crypt'
import { filter, IDbGeneric } from './iDbGeneric'
import { encode, decode } from '@msgpack/msgpack'
import { Operation } from './operation'
import { DocType } from './doctypes'
import { CredRequest } from './operations'
import { config } from './config'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export class Task extends Document {
  static release = 0

}

export type OrgStatus = {
  st: number // code 0: inconnu 1: UP 2: READ-ONLY 9: DOWN
  at: number // time de dernière mise à jour
  txt: string // texte explicatif éventuel de l'administrateur
}

export class Org extends Document {
  static release = 0
  status: OrgStatus

  isUP () { return this.status && (this.status.st === 1 || this.status.st === 2) }
  isRO () { return this.status && this.status.st === 2 }
  isRW () { return this.status && this.status.st === 1 }
  isDOWN () { return this.status && this.status.st === 9 }

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

export class Credential extends Document {
  static release = 0

  id: string
  userId: string
  role: string
  org: string
  docId: string
  time: number
  pubv: string
  limit: number
  cond: Object

  static async listManagers (op: Operation) : Promise<Object[]> {
    const dd = DocType.get('Credential')
    const val = dd.getIdx({ role: 'Org.manager', docId: ''}, 'roles')
    // const val = Crypt.shaS(encoder.encode('Org.manager/'))
    const lst: Object[] = []
    await op.db.selectDocs('Credential', 'roles', filter.EQ, val, '', 0, 
      async (data) => {
        try {
          const obj = decode(data) as Credential
          const x = { 
            id: obj.id,
            userId: obj.userId,
            time: obj.time, 
            limit: obj.limit,
            cond: obj.cond
          }
          lst.push(x)
        } catch(e) {
          console.log(e)
        }
      })
    return lst
  }

  static async listUserCreds (op: Operation) : Promise<Object[]> {
    const dd = DocType.get('Credential')
    const val = dd.getCollId({ userId: op.authRecord.userId }, 'userId')
    const lst: Object[] = []
    await op.db.selectDocs('Credential', 'userId', filter.EQ, val[0], '', 0, 
      async (data) => {
        try {
          const obj = decode(data) as Credential
          const x = { 
            id: obj.id,
            role: obj.role,
            docId: obj.docId,
            time: obj.time,
            limit: obj.limit,
            cond: obj.cond
          }
          lst.push(x)
        } catch(e) {
          console.log(e)
        }
      })
    return lst
  }

  static idStr (svc: string, org: string, docId: string, role: string) { 
    return svc + '/' + org + '/' + role + '/' + docId || ''
  }
  static getId (svc: string, org: string, docId: string, role: string) { 
    return Crypt.shaS(encoder.encode(Credential.idStr(svc, org, role, docId)))
  }
}

export class Invitation extends Document {
  static release = 0

  ttl: number // ttl (en minutes)

  invitId: string // ID de l'invitation
  major: string //code majeur 
  minor: string // code mineur
  time: number // date-heure de création epoch en SECONDES. Ceci détermine aussi sa date d'auto-destruction.
  status: number // 1: déposée, 2: validée, 3: rejetée, 4: acceptée, 5: déclinée
  userId: string // ID de U (demandeur)
  safeStore: string // URL du store hébergeant le safe de U (ou '' si c'est le MASTER)
  skeyK: Uint8Array // clé symétrique générée par U, cryptée par sa clé K. Requise ou non selon le `major`.
  pemU: string // clé publique C de U.
  txtm: string // texte de motivation de la demande d'invitation (en clair).
  txtx: string // quand déclinée, texte d'explication de U (en clair).
  label: string // pour les codes `major` qui en exige un, _label_ en clair à faire figurer dans le document à créer.
  // Données fixées par le sponsor**
  pemS: string // clé publique du sponsor traitant l'invitation.
  txti: string | Uint8Array // texte de réponse du sponsor, crypté par pemS / U.
      // - si acceptation: termes explicatifs des conditions.
      // - si rejet: justificatif textuel de rejet par le sponsor.
  role: string // rôle du credential associé (et classe du document associé).
  docId: string // `docId` du credential associé (et du document associé le cas échéant).
  cond: any // données à faire figurer en `cond` du credential.
  etc: any // autres données nécessaires pour créer le document associé. U n'a pas à connaître ni interpréter `etc` (_opaque_ pour lui) et qui ne sert qu'à l'opération de création de l'objet / enregistrement du credential.

  // Reçues sur create: ['ttl', 'invitId', 'major', 'minor', 'time', 'status', 'userId', 'safeStore', 'skeyK', 'pemU', 'txtm', 'label']

  static async listInvits (op: Operation, major: string, minor: string) : Promise<Uint8Array[]> {
    const val = Crypt.shaS(encoder.encode(!minor ? major : major + '/' + minor))
    const crit = !minor ? 'major' : 'majorminor'
    return await op.db.getColl('Invitation', crit, val, false, 0)
  }

}