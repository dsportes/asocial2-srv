import { Document } from './document'
import { Crypt } from './crypt'
import { filter } from './iDbGeneric'
import { decode } from '@msgpack/msgpack'
import { OperationWC } from './index'
import { Classes } from './config'
import { DocType } from './doctypes'

export function loadingDF () {
  console.log('fw documents loading: ', Classes.sizeD())
}

const encoder = new TextEncoder()
// const decoder = new TextDecoder()

class Task extends Document {
  static release = 0

}
Classes.registerD(Task)

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
Classes.registerD(Subs)

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
Classes.registerD(SubsItem)

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

  static async listManagers (op: OperationWC) : Promise<Object[]> {
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

  static async listUserCreds (op: OperationWC) : Promise<Object[]> {
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

  static idStr (svc: string, org: string, role: string, docId: string) { 
    return svc + '/' + org + '/' + role + '/' + docId || ''
  }
  static getId (svc: string, org: string, role: string, docId: string) { 
    return Crypt.shaS(encoder.encode(Credential.idStr(svc, org, role, docId)))
  }
}
Classes.registerD(Credential)

export class InvitationA extends Document {

  maxLife: number // epoch en MINUTES

  // Toujours présentes, dès la création de l'invitation
  invitId: string = '' // ID de l'invitation générée aléatoirement à sa création
  major: string = '' //code majeur 
  minor: string = '' // code mineur
  time: number = 0 // date-heure de création epoch en SECONDES. Ceci détermine aussi sa date d'auto-destruction.
  status: number = 0 // traduit l'état d'avancement dans le temps SEULE PROPRIETE NON immuable
  /*
  - (1) : demande déposée par U
  - (2) : demande annulée par U
  - (3) : demande rejetée par S
  - (4) : invitation faite par S
  - (5) : invitation déclinée par U
  - (6) : invitation validée par U
  */
  userId: string = '' // ID de U (demandeur)
  safeStore: string = '' // de la cible / demandeur U
  pubu: string = '' // clé publique de cryptage de U en base64

  // Dès la "demande" (pour un cycle complet seulement)
  req ?: string // texte en clair fourni par U pour exprimer ses souhaits / exigences / motivation.

  // st >= 4 ou 3 - invitatiopn (première en cycle court) ou 3 (demande rejet)
  pubs ?: string // clé publique C de cryptage du sponsor en base 64

  // st >= 4 - invitation (première en cycle court)
  etc ?: Uint8Array // Objet contenant les données nécessaires à la validation.
  spId ?: string // ID du soponsor
  etcSign: Uint8Array // signature de [etc, time] par le sponsor

  // st: 3 ou 5
  txt ?: string // texte humainement lisible 
  /*
  - soit Phase rejet : S explicite les raisons de son refus de faire une proposition à U.
  - soit Phase déclinaison: U explicite les raisons qui rendent les conditions (dans etc) non acceptables pour lui. 
  - crypté par la clé AES obtenu du couple de clés `pub-U/priv-S` (ou `pub-S/pub-U`, c'est la même)
  */

  /* Liste des demandes d'invitation à traiter (ou invitations traitées)
  pour un sponsor focus sur major ou major/minor */
  static async listInvits (op: OperationWC, major: string, minor: string) : Promise<Uint8Array[]> {
    const val = Crypt.shaS(encoder.encode(!minor ? major : major + '/' + minor))
    const crit = !minor ? 'major' : 'majorminor'
    return await op.db.getColl('Invitation', crit, val, false, 0)
  }

  /* A surcharger. Qui peut "proposer / rejeter" une invitation ? Qui est un "sponsor" possible ? */
  checkSponsor (op: OperationWC) : boolean {
    return true
  }

  /* A surcharger selon le type d'invitation. Retourne un status !== 0 si refus */
  async checkEtc (op: OperationWC) : Promise<number> {
    return 0
  }

  /* A surcharger selon le type d'invitation. */
  async validate (op: OperationWC, args: any) : Promise<void> {
  }

}