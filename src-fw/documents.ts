import { Document, DocStatus } from './document'
import { Crypt } from './crypt'
import { filter, IDbGeneric } from './iDbGeneric'
import { encode, decode } from '@msgpack/msgpack'
import { Operation, CredRequest, CredObj } from './operation'
import { config } from './config'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

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

/*
Un document `Credential` traduit la validité d'un credential 
et fixe ses conditions spécifiques d'exercice par les propriétés suivantes:
- Groupe de propriétés identifiantes:
  - `orguserId` : identifiant localisé de l'utilisateur.
  - `credId`: identifiant du credential.
  - `hpems`: hash du PEM de signature.
- `role` : rôle du droit.
- `entid` : identifiant de l'entité cible. 
  Le couple `[role , entid]` est indexé afin de pouvoir retrouver tous les droits attribués à une entité donnée.
- `pemv`: PEM de la clé de validation.
- `cond`: conditions spécifiques d'exercice.

export type AuthToken = {
  id: string
  role: string
  entid: string
  hpems: string
  sign: Uint8Array
  info: Object
}

export type CredObj = {
  id: string // hash court de `[role, org, entid]`.
  role: string // un des codes de rôle connu du service.
  org: string // le code de l'organisation.
  entid: string // identifiant d'une entité interprétable pour le service.
  pemv: string // clé publique (PEM) de vérification de signature,
  hpems: string // hash court de `pems`.
  setterId: string // id de l'utilisateur ayant enregistré le credential
  infou: Uint8Array
  infos: Uint8Array
  ctime: number
  dtime: number
  cond: Object
}

export type CredRequest = {
  userId: string
  role: string
  entid: string
  hpems: string
  pemv: string
  ctime: number
  dtime: number
  infou: Uint8Array
  infos: Uint8Array
  setterId: string
  cond: Object
}
*/

export class Credential extends Document {
  static release = 0

  id: string
  role: string
  org: string
  entid: string
  pemv: string
  hpems: string
  setterId: string
  ctime: number
  dtime: number
  infou: Uint8Array
  infos: Uint8Array
  cond: Object

  /* static newCredential (op: Operation, initVals: CredObj) : Credential {
    return op.cache.newDoc('Credential', initVals) as Credential
  } */

  static async newManager (op: Operation, cr: CredRequest) {
    const credObj: CredObj = {
      org: cr.org,

      role: 'manager',
      entid: '',
      ctime: Date.now(),
      setterId: op.authRecord.userId,
      cond: null,

      id: cr.userId,
      hpems: cr.hpems,
      pemv: cr.pemv,
      dtime: cr.dtime || 0,
      infou: cr.infou || null,
      infous: cr.infous || null,
      infos: cr.infos || null
    }
    // enregistrement d'un nouveau Credential "manager"
    op.cache.newDoc('Credential', credObj) as Credential
  }

  static async revokeManager (op: Operation, hpems: string, revoke: string ) {
    let credobj
    await op.db.selectDocs('Credential', 'hpems', filter.EQ, hpems, '', 0, 
      async (data) => {
        credobj = decode(data) as CredObj
      })
    const src = { orguserId: credobj.orguserId, role: 'manager', entid: '', hpems}
    const c = await op.cache.getDoc('Credential', src) as Credential
    c.cond['dtime'] = op.now
    c._status = DocStatus.UPD
  }

  static async listManagers (op: Operation) : Promise<Object[]> {
    const val = Crypt.shaS(encoder.encode('manager.'))
    const lst: Object[] = []
    await op.db.selectDocs('Credential', 'roleent', filter.EQ, val, '', 0, 
      async (data) => {
        const obj = decode(data) as CredObj
        const x = { 
          userId: obj.id,
          hpems: obj.hpems, 
          ctime: obj.ctime,
          dtime: obj.dtime, 
          infou: obj.infou,
          infous: obj.infous,
          infos: obj.infos,
          setterId: obj.setterId,
          cond: obj.cond || null
        }
        lst.push(x)
      })
    return lst
  }

}