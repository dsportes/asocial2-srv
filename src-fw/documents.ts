import { Document } from './document'
import { Crypt } from './crypt'
import { filter } from './iDbGeneric'
import { decode } from '@msgpack/msgpack'
import { OperationWC } from './index'
import { Operation } from '../src-fw/operation'
import { Registry } from './config'
import { DocType, FormType } from './doctypes'
import { config } from '../src-fw/config'
import { keyFromB64 } from './b64'
import { MDOperation, MDEvent } from '../src-fw/masterdir'
// import { AuthRecord } from '../src-fw/operation'

export function loadingDF () {
  console.log('fw documents loading: ', Registry.sizeD())
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

class $Task extends Document {
  static release = 0

}
Registry.registerD($Task)

export class $Status extends Document {
  static release = 0
  st: number // code 0: inconnu 1: UP 2: READ-ONLY 9: DOWN
  at: number // time de dernière mise à jour
  txt: string // texte explicatif éventuel de l'administrateur

  isUP () { return this.st === 1 || this.st === 2 }
  isRO () { return this.st === 2 }
  isRW () { return this.st === 1 }
  isDOWN () { return this.st === 9 }
}
Registry.registerD($Status)

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
export type $subscription = {
  sessionId: string
  subJSON: string
  url: string
  title: string
  defs: Object
}

/* Un document Subs décrit la souscription d'une session:
*/
export class $Subs extends Document {
  static release = 0

  sessionId: string
  subJSON: string
  defs: Object
  url: string
  title: string
  maxLife: number

  static newSubs (op: OperationWC, subs: $subscription, maxLife: number) : Document {
    const initVals = { 
      subJSON: subs.subJSON,
      sessionId: subs.sessionId,
      url: subs.url,
      title: subs.title,
      defs: subs.defs,
      maxLife : maxLife
    }
    return op.cache.newDoc('$Subs', initVals)
  }
}
Registry.registerD($Subs)

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
export class $SubsItem extends Document {
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
    return op.cache.newDoc('$SubsItem', initVals)
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
    await op.db.selectDocs('$SubsItem', 'def', filter.EQ, def, '', 0, 
      (org: string, data: Uint8Array) => {
        const d = decode(data)
        sids.push(d['sessionId'])
      })
    return sids
  }

  static async deleteSessionId (op: OperationWC, sessionId: string) : Promise<void> {
    // deleteDoc (org: string, clazz: string, pk: string) : Promise<void>
    await op.db.selectDocs('$SubsItem', 'sessionId', filter.EQ, sessionId, '', 0, 
      async (org: string, data: Uint8Array) => {
        const d = decode(data)
        const pk = Crypt.shaS(sessionId + '/' + d['def'])
        op.db.deleteRow('$SubsItem', pk)
      })
  }

}
Registry.registerD($SubsItem)

export type $Cred = {
  pubv: Uint8Array
  pubc: Uint8Array
  opaque: Uint8Array | null
  more: any
  credId: string
}

export class $Credential extends Document {
  static release = 0

  credId: string
  docCl: string
  docPk: string // clé primaire du document maitre
  /* epoch en MINUTES de fin de validité
  Recopie de cred.limit ou 0 */
  maxLife: number
  cred: any

  // Liste les credentials attribuable par un administrateur seulement
  static async listManagers (op: OperationWC) : Promise<$Cred[]> {
    const lst: $Cred[] = []
    let sel: string[] = []
    for(const cl of DocType.managerClasses) sel.push(cl + '/1')
    if (sel.length) await op.db.selectDocs('$Credential', 'creds', filter.IN, sel, '', 0, 
      (bin: Uint8Array) => {
        try {
          const obj = decode(bin) as $Credential
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

  /* Liste les credentials NON embarqués d'un document donné par sa classe
  et les propriétés de sa pk.
  */
  static async listByDoc (op: OperationWC, docCl: string, src: Object) : Promise<$Cred[]> {
    const docPk = DocType.getPk(docCl, src, true)
    const dd = DocType.get('$Credential')
    const val = dd.getIdx({ docCl, docPk }, 'doc')
    const lst: $Cred[] = []
    await op.db.selectDocs('$Credential', 'doc', filter.EQ, val[0], '', 0, 
      (bin) => {
        try {
          const obj = decode(bin) as $Credential
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

  /* Liste les credentials EMBARQUES d'un document donné par sa classe
  et les propriétés de sa pk.
  */
  static async listByDocEmbed (op: OperationWC, docCl: string, src: Object) : Promise<$Cred[]> {
    const doc: any = await op.cache.getDoc(docCl, src)
    return doc && doc.creds ? Array.from(doc.creds.values()) : []
  }
}
Registry.registerD($Credential)

export type $FormObj = {
  formId: string  // ID universel aléatoire.
  type: string  // type du formulaire.
  userId: string  // utilisateur cible.
  v: number  //  version du document (_epoch_).
  maxLife: number //  EPOCH en MINUTES de suppression automatique du formulaire.
  status: number // de 1 à 4.
  etc: Object | null  // objet de structure spécifique du type. Saisi par l'utilisateur et le tiers.
  etcB: Object | null  // valeur de etc _avant_: en statut 1 c'est le dernier état en statut 2, en statut 2 c'est le dernier état en statut 1. Permet un _undo_ de remord de U quand il avait modifié etc mais que finalement il accepte la dernière proposition de T (et symétriquement pour T).
  msgU: Uint8Array | null  // message écrit par U.
  msgT: Uint8Array | null  // message écrit par le tiers.

  /* liste des credentials permettant à un tiers d'agir quand il possède l'un de ceux-là:
  [ docCl1/docPk1 ... ]
  La liste dépende la valeur de etc : depuis la liste template [ docCl1/$x ... ]
  $x est remplacé par la valeur de etc.$x
  */
  creds?: string[]
  comment?: Uint8Array | null // commentaire écrit et crypté par U.
  ch?: string // challenge random de synchronisation initiale avec MDEvent
  lv?: number // lastView par U
}

/*
Document `Form` hébergé dans la DB spécifique de `svc / org`.
Sous-classes applicatives $Form_type par "type"
*/
export class $Form extends Document {
  formId: string = '' // ID universel aléatoire.
  type: string = '' // type du formulaire.
  userId: string = '' // utilisateur cible.
  v: number = 0 //  version du document (_epoch_).
  maxLife: number = 0 //  EPOCH en SECONDES de suppression automatique du formulaire.
  status: number = 0 // de 1 à 4.
  etcU: Object | null = null // objet de structure spécifique du type. Saisi par l'utilisateur et le tiers.
  etcT: Object | null = null // valeur de etc _avant_: en statut 1 c'est le dernier état en statut 2, en statut 2 c'est le dernier état en statut 1. Permet un _undo_ de remord de U quand il avait modifié etc mais que finalement il accepte la dernière proposition de T (et symétriquement pour T).
  msgU: Uint8Array | null = null // message écrit par U.
  msgT: Uint8Array | null = null // message écrit par le tiers.

  creds: string[] = [] // liste des credentials permettant à un tiers d'agir quand il possède l'un de ceux-là: `[ docCl1/docPk1 ... ]`.
  comment?: Uint8Array | null = null // commentaire écrit et crypté par U.
  ch?: string = '' // challenge random de synchronisation initiale avec MDEvent
  lv?: number = 0 // lastView par U

  /* Surchargé par type:
  retourne un objet "résumé" de etc à faire figurer dans MDEvents
  */
  getDetail () { return {} }

  /* Traitement final: surchargé par type :Retourne un statut de validation,
  - 0 si OK, N > 10 selon la cause d'échec
  */
  async validate (op: Operation) : Promise<number> { return 0 }

  static lp1 = ['formId', 'type', 'userId', 'v', 'maxLife', 'status', 'etcU', 'etcT', 'msgU', 'msgT' ]
  static lp2 = ['type', 'userId', 'v', 'maxLife', 'status', 'comment', 'lv' ]

  constructor (obj?: $FormObj) {
    super()
    if (obj) for (const p of $Form.lp1) this[p] = obj[p]
    if (obj.comment) this.comment = obj.comment
    if (obj.creds) this.creds = obj.creds
    if (obj.ch) this.ch = obj.ch
    if (obj.lv) this.lv = obj.lv
  }

  toFormObj () : $FormObj {
    const obj = {}
    for (const p of $Form.lp1) obj[p] = this[p]
    return obj as $FormObj
  }

  toEvObj () : MDEvent {
    // @ts-expect-error
    const obj: MDEvent = {}
    for (const p of $Form.lp2) obj[p] = this[p]
    obj['eventId'] = this.formId
    obj['detail'] = this.getDetail()
    return obj
  }

  chk (op: OperationWC) { 
    return Crypt.shaS([this.formId, this.type, this.userId, config.SVC, op.org].join('/')) 
  }

  setMaxLife () {
    this.maxLife = Math.floor(Date.now() / 1000) + config.FORMMAXLIFE
  }

  get isOld () { return Date.now() > this.maxLife * 1000 }

  get ft () : FormType { return FormType.formTypes.get(this.type) || FormType.formTypes.get('default')}
  get kp () : { pub: Buffer, priv: Buffer } { 
    const x = config['DCkeys'][this.ft.key]
    return { pub: keyFromB64(x.pub), priv: keyFromB64(x.pub) }
  }
  async uPub (op: OperationWC) : Promise<Buffer> {
    const [c, v] = await MDOperation.getCV(op, this.userId)
    return keyFromB64(c)
  }

  /* Une opération de lecture du formulaire peut décrypter `msgU` en utilisant le couple, 
  de la clé _privée_ de décryptage du formulaire (accessible dans l'opération du service)
  et de la clé _publique_ de cryptage de U (également accessible puisque `userId` est l'ID de U). 
  */
  async decryptMsgU (op: OperationWC) : Promise<void> {
    if (!this.msgT) {
      const aes = await Crypt.getAESKey(await this.uPub(op), this.kp.priv)
      this.msgU = await Crypt.decrypt(aes, this.msgU)
    }
  }

  /* `msgT` est le texte écrit par T: il est envoyé en clair à l'opération d'enregistrement du formulaire ou il est crypté par le couple, 
  - de la clé _privée_ de décryptage du formulaire (accessible dans l'opération du service) 
  - et de la clé _publique_ de cryptage de U (également accessible puisque `userId` est l'ID de U).
  Une opération de lecture peut décrypter `msgT` en utilisant le couple, 
  - de la clé _privée_ de décryptage du formulaire (accessible dans l'opération du service)
  - et de la clé _publique_ de cryptage de U (également accessible puisque `userId` est l'ID de U).
  */
  async cryptMsgT (op: OperationWC) : Promise<void> {
    if (this.msgT) {
      const aes = await Crypt.getAESKey(await this.uPub(op), this.kp.priv)
      this.msgT = await Crypt.crypt(aes, this.msgT)
    }
  }

  async decryptMsgT (op: OperationWC) : Promise<void> {
    if (this.msgT) {
      const aes = await Crypt.getAESKey(await this.uPub(op), this.kp.priv)
      this.msgT = await Crypt.decrypt(aes, this.msgT as Uint8Array)
    }
  }

  // Calcul this.creds depuis le template du type et les arguments $x dans etc
  setCreds () {
    const etc = this.status === 1 ? this.etcU : this.etcT
    const creds = []
    for(const c of this.ft.creds) {
      const i = c.indexOf('$')
      if (i !== -1) {
        const arg = c.substring(i, i + 1)
        const val = etc[arg] || ''
        creds.push(c.replace(arg, val))
      } else creds.push(c)
    }
    this.creds = creds
  }

  // vérifie si le tiers est habilité
  checkAuthTP (op: Operation) : boolean {
    const t = this.ft.creds
    if (t && t.length === 1 && t[0] === 'A') op.requireAuth()
    else for (const c of this.creds) {
      const x = c.split('/')
      const cred = op.getCred(x[0], x[1] || '1')
      if (cred) return true
    }
    return false
  }

  /* Retourne une liste de $Form pour un utilisateur tiers
  si f = ['A'] retourne les forms devant être traitées par un administrateur
  */
  static async filteredList (op: Operation, f: string[]) : Promise<$FormObj[]> {    
    const l: $FormObj[] = []
    await op.db.selectDocs('$Form', 'creds', filter.CONTAINSANY, f, '', 0, 
      async (bin) => {
      const obj = decode(bin) as $FormObj
      const f = Registry.newD('$Form', obj) as $Form
      if (!f.isOld) {
        await f.decryptMsgT(op)
        await f.decryptMsgU(op)
        l.push(f.toFormObj())
      }
    })
    return l
  }

}
Registry.registerD($Form)
