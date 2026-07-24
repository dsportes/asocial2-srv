import { $Document, DocStatus } from '../src-fw/document'
import { Crypt } from '../src-fw/crypt'
import { filter } from '../src-fw/iDbGeneric'
import { encode, decode } from '@msgpack/msgpack'
import { OperationWC } from './index'
import { Operation } from '../src-fw/operation'
import { Registry } from '../src-fw/config'
import { DocDescriptor, FormType } from '../src-fw/docDescriptor'
import { config } from '../src-fw/config'
import { keyFromB64, keyToB64 } from '../src-fw/b64'
import { MDandSafe, AppExc } from '../src-fw/index'
import { SetCred } from '../src-fw/safeop'

// import { AuthRecord } from '../src-fw/operation'
// const encoder = new TextEncoder()
// const decoder = new TextDecoder()

let nd = 0

export function loadingDF () {
  console.log('fw documents loading: ', nd)
}

class ADMIN$Task extends $Document {
  static release = 0

}
nd++; Registry.register(ADMIN$Task)

export class ADMIN$Status extends $Document {
  static release = 0
  st: number // code 0: inconnu 1: UP 2: READ-ONLY 9: DOWN
  at: number // time de dernière mise à jour
  txt: string // texte explicatif éventuel de l'administrateur

  isUP () { return this.st === 1 || this.st === 2 }
  isRO () { return this.st === 2 }
  isRW () { return this.st === 1 }
  isDOWN () { return this.st === 9 }
}
nd++; Registry.register(ADMIN$Status)

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
export class ADMIN$Subs extends $Document {
  static release = 0

  sessionId: string
  subJSON: string
  defs: Object
  url: string
  title: string
  maxLife: number

  static newSubs (op: OperationWC, subs: $subscription, maxLife: number) : $Document {
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
nd++; Registry.register(ADMIN$Subs)

/* TODO : QUID de org ?
Une souscription élémentaire SubsItem d'une sessionId est IMMUTABLE 
et peut avoir trois formes: 
- 0 : souscription à la classe de documents: tous changements des documents de la classe 
  dont les créations et les zombifications.
- 1 : souscription à un document de pk citée. pk est un hash de la ou des
  propriétés de la clé primaire.
- 2 : souscription à la sous-collection nommée des documents de la classe

La définition def d'un SubsItem est le string:
- type 0: clazz COMPLET (svc$docCl) OU (org/svc$docCl) ???
- type 1: clazz/pkVal (c'est un shaC)
- type 2: clazz/colName/colVal (c'est un shaC)
def est une propriété indexée: permet de récupérer tous les SubsItem 
  ayant même définition (donc les sessionId correspondantes)
*/
export class ADMIN$SubsItem extends $Document {
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

  static newSubsItem (op: OperationWC, sessionId: string, def: string, maxLife: number) : $Document {
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
nd++; Registry.register(ADMIN$SubsItem)

export type $CredObj = {
  credId: string
  docCl: string
  docPk: string
  pubv: Uint8Array
  pubc: Uint8Array
  props: Object | null
  maxLife?: number
}

export class $CredTempl {
  userId: string
  credId: string
  docCl: string
  docPk: string
  credK: string
  nameK: string // crypté par clé K de U en base 64
  signId: string // signature de credId par privs en base 64

  pubv: Uint8Array
  pubc: Uint8Array
  props: Object

  constructor (obj: any) {
    for (const p of Object.keys(obj)) this[p] = obj[p]
  }

  toEmbedCred () : Embed$Cred {
    return { credId: this.credId, pubv: this.pubv, pubc: this.pubc, props: this.props }
  }

  toCredObj () : $CredObj {
    return {
      credId: this.credId,
      docCl: this.docCl,
      docPk: this.docPk,
      pubv: this.pubv,
      pubc: this.pubc,
      props: this.props
    }
  }

  async CreateSafeCred (op: Operation) : Promise<number>{
    const setCred: SetCred = {
      userId: this.userId,
      signId: this.signId,
      credId: this.credId,
      nameK: this.nameK,
      credK: this.credK
    }
    try {
      const res: any = await MDandSafe.doSafeOp(op, this.userId, '$CreateCred', setCred)
      return res.status || 0
    } catch (e) {
      return 98
    }
  }

  newCredential () : $Credential {
    return $Credential.new(this.credId, this.docCl, this.docPk, this.toEmbedCred())
  }

}

export type $Cred = {
  credId: string
  svc: string
  org: string
  docCl: string
  docPk: string
  props: any
}

export type Embed$Cred = {
  credId: string
  pubv: Uint8Array
  pubc: Uint8Array
  props: any
}

export class $Credential extends $Document {
  static release = 0

  credId: string
  docCl: string
  docPk: string // clé primaire du document maitre
  cred: Embed$Cred
  maxLife: number
  // En cache d'opération SEULEMENT sur détection de credential par authRecord
  embeddingDoc?: $Document

  get dt () { return DocDescriptor.get(this.docCl)}
  get isEmbed () { return this.dt.embedCreds }
  get isValid () {
    const p = this.cred.props
    return p && (!p.limit || (p.limit * 60000) >= Date.now())
  }

  static new (credId: string, docCl: string, docPk: string, ec: Embed$Cred) : $Credential {
    const c = Registry.newD('', '$Credential', { docCl } ) as $Credential
    c.credId = credId
    c.docCl = docCl
    c.docPk = docPk
    c.cred = ec
    return c
  }

  async create (op: Operation): Promise<$Document> {
    if (this.isEmbed) {
      const doc = await op.cache.getDoc(this.docCl, { pk: this.docPk }) as $Document
      if (!doc) return null
      if (!doc.embedCreds)
        doc.embedCreds = {}
      doc.embedCreds[this.credId] = this.cred
      if (doc._status !== DocStatus.NEW)
        doc._status = DocStatus.UPD
      return doc
    }
    const maxLife = this.cred.props['limit'] || 0
    let doc = await op.cache.getDoc('$Credential', { credId: this.credId, docCl: this.docCl }) as $Credential
    if (doc) {
      doc.maxLife = maxLife
      doc.cred.pubv = this.cred.pubv
      doc.cred.pubc = this.cred.pubc
      doc.cred.props = this.cred.props
      doc._status = DocStatus.UPD
    } else {
      const obj = { credId: this.credId, docCl: this.docCl, docPk: this.docPk, maxLife, cred: this.cred }
      doc = op.cache.newDoc('$Credential', obj) as $Credential
    }
    return doc
  }

  static async update (op: Operation, credId: string, docCl: string, docPk: string, props: Object): Promise<$Document> {
    const dt = Registry.getDescr('', docCl)
    let doc
    if (dt.embedCreds) {
      doc = await op.cache.getDoc(docCl, { pk: docPk }) as $Document
      if (!doc || !doc.embedCreds || !doc.embedCreds.has(credId)) return null
      const e = doc.embedCreds.get(credId)
      e.props = props
      doc._status = DocStatus.UPD
    } else {
      doc = await op.cache.getDoc('$Credential', { credId, docCl }) as $Credential
      if (!doc) return null
      doc.maxLife = props['limit'] || 0
      doc.cred.props = props
      doc._status = DocStatus.UPD
    }
    return doc
  }

  // Liste les credentials attribuable par un administrateur seulement
  static async listManagers (op: OperationWC) : Promise<$Cred[]> {
    const org = op.org
    const lst: $Cred[] = []
    let sel: string[] = []
    for(const cl of Registry.managers) 
      sel.push(Crypt.shaS(cl + '/1'))
    if (sel.length) await op.db.selectDocs('$Credential', 'doc', filter.IN, sel, '', 0, 
      (bin: Uint8Array) => {
        try {
          const c: any = decode(bin)
          const x = {
            credId: c.credId,
            svc: config.SVC,
            org: org,
            docCl: c.docCl,
            docPk: c.docPk,
            props: c.cred.props
          }
          if (!x.props.limit || x.props.limit * 60000 > op.now)
            lst.push(x)
        } catch(e) {
          console.log(e)
        }    
      }) 
    return lst
  }

  /* Liste les credentials NON embarqués d'un document donné par sa classe
  et les propriétés de sa pk.
  */
  static async listByDoc (op: Operation, docCl: string, src: Object) : Promise<$Cred[]> {
    const org = op.org
    const docPk = Registry.getPk('', docCl, src, true)
    const dd = Registry.getDescr(op.svc, 'Credential')
    const val = dd.getIdx({ docCl, docPk }, 'doc')
    const lst: $Cred[] = []
    await op.db.selectDocs('$Credential', 'doc', filter.EQ, val[0], '', 0, 
      (bin) => {
        try {
          const c: any = decode(bin)
          const x = {
            credId: c.credId,
            svc: config.SVC,
            org: org,
            docCl: c.docCl,
            docPk: c.docPk,
            props: c.cred.props
          }
          if (!x.props.limit || x.props.limit * 60000 > op.now)
            lst.push(x)
        } catch(e) {
          console.log(e)
        }
      })
    return lst
  }

  /* Liste les credentials EMBARQUES d'un document donné par sa classe
  et les propriétés de sa pk.
  */
  static async listByDocEmbed (op: Operation, docCl: string, src: Object) : Promise<$Cred[]> {
    const svc = config.SVC
    const org = op.org
    const pk = Registry.getPk(op.svc, docCl, src)
    const doc: any = await op.cache.getDoc(docCl, { pk })
    const creds: $Cred[] = doc && doc.creds ? Array.from(doc.creds.values()) : []
    const lst: $Cred[] = []
    for (const c of creds)
      if (!c.props.limit || c.props.limit * 60000 > op.now)
        lst.push({
          credId: c.credId,
          svc: svc,
          org: org,
          docCl: docCl,
          docPk: pk,
          props: c.props
        })
    return lst
  }

}

export type $FormObj = {
  formId: string  // ID universel aléatoire.
  type: string  // type du formulaire.
  userId: string  // utilisateur cible.
  v: number  //  version du document (_epoch_).
  maxLife: number //  EPOCH en MINUTES de suppression automatique du formulaire.
  status: number // de 1 à 4.
  etcU: Object | null  // objet de structure spécifique du type. Saisi par U
  etcT: Object | null  // saisi par T
  msgU: Uint8Array | null  // message écrit par U.
  msgT: Uint8Array | null  // message écrit par le tiers.
  opts: Object | null

  ch?: string // challenge random de synchronisation initiale avec MDEvent
}

/*
Document `Form` hébergé dans la DB spécifique de `svc / org`.
Sous-classes applicatives $Form_type par "type"
*/
export class $Form extends $Document {
  formId: string = '' // ID universel aléatoire.
  type: string = '' // type du formulaire.
  userId: string = '' // utilisateur cible.
  v: number = 0 //  version du document (_epoch_).
  maxLife: number = 0 //  EPOCH en MINUTES de suppression automatique du formulaire.
  status: number = 0 // de 1 à 4.
  etcU: Object | null = null // objet de structure spécifique du type. Saisi par l'utilisateur et le tiers.
  etcT: Object | null = null // valeur de etc _avant_: en statut 1 c'est le dernier état en statut 2, en statut 2 c'est le dernier état en statut 1. Permet un _undo_ de remord de U quand il avait modifié etc mais que finalement il accepte la dernière proposition de T (et symétriquement pour T).
  msgU: Uint8Array | null = null // message écrit par U.
  msgT: Uint8Array | null = null // message écrit par le tiers.
  opts?: any = null // options éventuelles de validation (calculées par compileEtc)

  /* Propriétés reçues à la création par U ou T et à mettre à jour dans MDEvent
  par MDEventFull - supprimées de $Form à ce moment
  */
  ch?: string = '' // challenge random de synchronisation initiale avec MDEvent
  creds?: string[]

  /* Surchargé par type:
  retourne un string[] "résumé" de etc à faire figurer dans MDEvents
  le premier terme est le code de d'un i18N
  */
  getDetail () : string[] { return [] }

  /* Traitement final: surchargé par type : Retourne un statut de validation,
  - 0 si OK, N > 10 selon la cause d'échec
  Les credentials ont été créés.
  Les documents créés ou modifiés dans la méthode sont à ajouter
  dans newDocs. En cas de status NON 0, leur DocStatus sera mis à NONE
  */
  async validate (op: Operation, newDocs: $Document[]) : Promise<number> { 
    return 0 
  }

  // Utilisé sur opération getForm et liste filtrée
  static new (obj) : $Form {
    const f = Registry.newD('', '$Form', obj) as $Form
    for (const p of $Form.lp1) f[p] = obj[p]
    return f
  }

  static lp1 = ['formId', 'type', 'userId', 'v', 'maxLife', 'status', 'etcU', 'etcT', 'msgU', 'msgT', 'opts']

  // Utilisé par newDoc dans les 2 opérations de create
  constructor (obj?: $FormObj) {
    super()
    if (obj) {
      for (const p of $Form.lp1) this[p] = obj[p]
      if (obj.ch) this.ch = obj.ch
    }
  }

  toFormObj () : $FormObj {
    const obj = {}
    for (const p of $Form.lp1) obj[p] = this[p]
    return obj as $FormObj
  }

  chk (op: OperationWC) { 
    return Crypt.shaS([this.formId, this.type, this.userId, config.SVC, op.org].join('/')) 
  }

  setMaxLife () {
    this.maxLife = Math.floor(Date.now() / 60000) + config.FORMMAXLIFE
  }

  get isOld () { return Date.now() > this.maxLife * 60000 }

  get ft () : FormType { return FormType.get('', this.type) }
  get kp () : { pub: Buffer, priv: Buffer } { 
    const x = config.keys['DCKeys'][this.ft.key]
    return { pub: keyFromB64(x.pub), priv: keyFromB64(x.priv) }
  }
  async uPub () : Promise<Buffer> {
    const cvs = await MDandSafe.getCVS(this.userId)
    if (!cvs) throw new AppExc(105, 'userid_not_found_in_masterdir', null, [this.userId])
    return keyFromB64(cvs[0])
  }

  /* Une opération de lecture du formulaire peut décrypter `msgU` en utilisant le couple, 
  de la clé _privée_ de décryptage du formulaire (accessible dans l'opération du service)
  et de la clé _publique_ de cryptage de U (également accessible puisque `userId` est l'ID de U). 
  */
  async decryptMsgU () : Promise<void> {
    if (this.msgU) {
      const pub = await this.uPub()
      const aes = await Crypt.getAESKey(pub, this.kp.priv)
      const x = await Crypt.decrypt(aes, this.msgU)
      // const y = decoder.decode(x)
      this.msgU = x
    }
  }

  /* `msgT` est le texte écrit par T: il est envoyé en clair à l'opération d'enregistrement du formulaire ou il est crypté par le couple, 
  - de la clé _privée_ de décryptage du formulaire (accessible dans l'opération du service) 
  - et de la clé _publique_ de cryptage de U (également accessible puisque `userId` est l'ID de U).
  Une opération de lecture peut décrypter `msgT` en utilisant le couple, 
  - de la clé _privée_ de décryptage du formulaire (accessible dans l'opération du service)
  - et de la clé _publique_ de cryptage de U (également accessible puisque `userId` est l'ID de U).
  */
  async cryptMsgT () : Promise<void> {
    if (this.msgT) {
      const pub = await this.uPub()
      const aes = await Crypt.getAESKey(pub, this.kp.priv)
      this.msgT = await Crypt.crypt(aes, this.msgT)
    }
  }

  async decryptMsgT () : Promise<void> {
    if (this.msgT) {
      const pub = await this.uPub()
      const aes = await Crypt.getAESKey(pub, this.kp.priv)
      this.msgT = await Crypt.decrypt(aes, this.msgT as Uint8Array)
    }
  }

  // Calcul this.creds depuis le template du type et les arguments $x dans etc
  getCreds () : string[] {
    const creds = []
    for(const c of this.ft.creds) {
      const i = c.indexOf('$')
      if (i !== -1) {
        const arg = c.substring(i, i + 2)
        const val = this.opts[arg] || ''
        creds.push(c.replace(arg, val))
      } else creds.push(c)
    }
    this.creds = creds
    return creds
  }

  // vérifie si le tiers / user qui a invoqué l'opération est habilité à lire le document
  checkAuthTP (op: Operation) : boolean {
    const creds = this.getCreds()
    if (op.authRecord.userId === this.userId) return true
    if (!creds.length) return false
    if (creds.length === 1 && creds[0] === 'A')
      return op.authRecord.isAdmin
    for (const c of creds) {
      const x = c.split('/')
      const cred = op.getCred(x[0], x[1], true)
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
      const f = $Form.new(obj)
      if (!f.isOld) {
        if (f.checkAuthTP(op)) {
          try {
            await f.decryptMsgT()
            await f.decryptMsgU()
            l.push(f.toFormObj())
          } catch (e) {
            console.log(e)
          }
        }
      }
    })
    return l
  }

}
