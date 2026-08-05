// import { encode } from '@msgpack/msgpack'
import { config } from '../src/config'
import { Log } from '../src-fw/log'
import { Operation, Cache } from '../src-fw/operation'
import { MDEventS } from '../src-fw/masterdir'
import { AppExc } from '../src-fw/log'
import { MDandSafe } from '../src-fw/index'
import { Crypt } from '../src-fw/crypt'
import { Registry } from '../src-fw/registry'
import { ADMIN$Status, ADMIN$Subs, $subscription, ADMIN$SubsItem, $Credential, 
  $Cred, $Form, $FormObj, $CredTempl } from '../src-fw/documents'
import { DocStatus, $Document } from '../src-fw/document'
// import { Util } from '../src-fw/util'

export function loadingOF () {
  Log.info('fw operations loading: ' + Registry.sizeOp())
}

export type CredRequest = {
  id: string
  userId: string
  role: string
  docId: string
  time: number
  pemv: string
  limit: number
  cond: Object
}

/* Operations d'administration ***********************************************************/

class ADMIN$isAdmin extends Operation {
  async phase2 () {
    this.setRes('isAdmin', this.authRecord.userId && this.authRecord.isAdmin)
  }
}
Registry.registerOp(ADMIN$isAdmin)

/* ADMIN$getStatus retourne le status du service: { st, at, txt }
  st: code 0: inconnu 1: UP 9: DOWN
  at: time de dernière mise à jour
  txt: texte explicatif éventuel de l'administrateur
  Du fait de $, adresse la pseudo organisation 'A' (donc le service)
*/
class ADMIN$getStatus extends Operation {
  _svc: string
  init () {
    super.init()
    this._svc = this.stringValue('svc', true)
  }
  async phase2 () {
    const dd = await Cache.getRow(this, 'ADMIN$Status', { svc: this._svc}, config.STATUSLAZYNESS)
    if (!dd) this.setRes('status', { st: 0, at: 0, txt: '' })
    else {
      dd.init()
      const s = dd.doc as ADMIN$Status
      this.setRes('status', { st: s.st, at: s.at, txt: s.txt})
    }
  }
}
Registry.registerOp(ADMIN$getStatus)

/* ADMIN$setStatus fixe le status du site: { st, at, txt }
  st: code 0: DOWN, 1: UP
  txt: texte explicatif éventuel de l'administrateur
*/
class ADMIN$setStatus extends Operation {
  _svc: string
  _st: number
  _txt: string
  init () {
    super.init()
    this._svc = this.stringValue('svc', true)
    this._st = this.intValue('st', true, 0, 9)
    this._txt = this.stringValue('txt', true)
  }
  async phase2 () {
    this.requireAdmin()
    let doc: ADMIN$Status = await this.cache.getDoc('ADMIN$Status', { svc: this._svc }) as ADMIN$Status
    if (doc) doc._status = DocStatus.UPD
    else doc = this.cache.newDoc('ADMIN$Status', { svc: this._svc }) as ADMIN$Status
    doc.at = Date.now()
    doc.st = this._st
    doc.txt = this._txt || ''
    this.setRes('status', { st: doc.st, at: doc.at, txt: doc.txt})
  }
}
Registry.registerOp(ADMIN$setStatus)

/* ADMIN$getEnum retourne la liste des valeurs (string)
- name: nom du singleton: forme générale svc$name_org
  - svc$ : espace de noms par service
  - _org : facultatif, pour spécialiser des énumérations par organisation
*/
class ADMIN$getEnum extends Operation {
  _name: string
  init () {
    super.init()
    this._name = this.stringValue('name', true)
  }

  async phase2 () {
    const valx = await this.db.getSingleton('this._name') as string
    let x: string[] = JSON.parse(valx || '[]') 
    this.setRes('enum', x)
  }
}
Registry.registerOp(ADMIN$getEnum)

/* ADMIN$setEnum fixe la liste des valeurs d'une enumération
*/
class ADMIN$setEnum extends Operation {
  _name: string
  _value: string[]

  init () {
    super.init()
    this._name = this.stringValue('name', true)
    this._value = this.stringArrayValue('value', true)
  }

  async phase2 () {
    // TODO requireAdmin ???
    await this.db.setSingleton(this._name, JSON.stringify(this._value))
  }
}
Registry.registerOp(ADMIN$setEnum)

/* Gestion des souscriptions:
- les documents sont: ADMIN$Subs ADMIN$SubsItem.
- ils sont enregistrés au niveau du site (dans la db "par défaut" du site)
- les opérations sont des ADMIN$... qui cite le "site"
*/

/* ADMIN$setSubscription enregistre la souscription d'une session *************************
- Supprime la précédente s'il y en avait une
- Créé une nouvelle si l'argument subscription n'est pas null
*/
class ADMIN$setSubscription extends Operation {
  _subs: $subscription
  _life: number
  init () {
    super.init()
    this._subs = this.objectValue('subsscription', false) as $subscription
    const longLife = this.boolValue('longLife', false)
    this._life = Math.floor(this.now / 1440000) + (longLife ? this.SUBSLONGMAXLIFE : this.SUBSSHORTMAXLIFE)
  }
  async phase2 () {
    await ADMIN$SubsItem.deleteSessionId(this, this._subs.sessionId)
    if (this._subs) {
      const subs = ADMIN$Subs.newSubs(this, this._subs, this._life) as ADMIN$Subs
      for (const def in subs.defs) {
        // const msg = subs.defs[def] - pas enregistré dans SubsItem
        ADMIN$SubsItem.newSubsItem(this, this._subs.sessionId, def, this._life)
      }
    }
  }
}
Registry.registerOp(ADMIN$setSubscription)

/* ADMIN$updateSubscription corrige la sousciption d'une session SI ELLE EXISTAIT
Maj éventuelle de title / url
Ajoute des defs, met à jour leur message ou en enlève { def1: 'm1', def2: '', def3: false }
*/
class ADMIN$updateSubscription extends Operation {
  _title: string
  _url: string
  _defs: Object
  init () {
    super.init()
    this._title = this.stringValue('title', false)
    this._url = this.stringValue('url', false)
    this._defs = this.objectValue('defs', true)
  }
  async phase2 () {
    const subs = await this.cache.getDoc('ADMIN$Subs', { sessionId: this.sessionId}) as ADMIN$Subs
    if (!subs) 
      throw new AppExc(105, 'Subscription_unknown_session', this, [this.sessionId])

    if (this.args['title']) { subs.title = this._title; subs._status = DocStatus.UPD }

    if (this.args['url']) { subs.url = this._url; subs._status = DocStatus.UPD }

    for (const def in this._defs) {
      const src = { sessionId: this.sessionId, def, maxLife: subs.maxLife }
      const msg = this._defs[def]
      if (msg === false) {
        delete subs.defs[def]
        await this.cache.getDoc('ADMIN$$SubsItem', src) as ADMIN$SubsItem
        this.cache.delDoc('ADMIN$$SubsItem', Crypt.shaS(this.sessionId + '/' + def))
      } else {
        subs.defs[def] = msg
        let subsItem = await this.cache.getDoc('ADMIN$$SubsItem', src) as ADMIN$SubsItem
        if (!subsItem) {
          subsItem = this.cache.newDoc('ADMIN$$SubsItem', src) as ADMIN$SubsItem
          subsItem._status = DocStatus.NEW
        } else { 
          subsItem.def = def
          subsItem._status = DocStatus.UPD
        }
      }
      subs._status = DocStatus.UPD
    }
  }
}
Registry.registerOp(ADMIN$updateSubscription)


/* Operations standard ***********************************************************/
class FW$Bug extends Operation {
  init () { super.init() }
  async phase2 () { await this.db.bug(); Log.info('Bug op') }
}
Registry.registerOp(FW$Bug)

class FW$ErrorTest extends Operation {
  init () { super.init() }
  async phase2 () { 
    throw new AppExc(102, 'error_test', this, ['arg1', 'arg2'])
  }
}
Registry.registerOp(FW$ErrorTest)

/* GetStatus retourne le status de l'organisation: { st, at, txt }
  st: code 0: inconnu 1: UP 9: DOWN
  at: time de dernière mise à jour
  txt: texte explicatif éventuel de l'administrateur
*/
class FW$getStatus extends Operation {
  async phase2 () {
    const dd = await Cache.getRow(this, this.svc + '$Status', null, config.STATUSLAZYNESS)
    if (!dd) this.setRes('status', { st: 0, at: 0, txt: '' })
    else {
      dd.init()
      const s: any = dd.doc
      this.setRes('status', { st: s.st, at: s.at, txt: s.txt})
    }
  }
}
Registry.registerOp(FW$getStatus)

/* SetStatus fixe le status de l'organisation: { st, at, txt }
  st: code 0: DOWN, 1: UP
  txt: texte explicatif éventuel de l'administrateur
  ADMINISTRATEUR
*/
class FW$setStatus extends Operation {
  _st: number
  _txt: string
  init () {
    super.init()
    this._st = this.intValue('st', true, 0, 9)
    this._txt = this.stringValue('txt', true)
  }
  async phase2 () {
    this.requireAdmin()
    let doc = await this.cache.getDoc(this.svc + '$Status') as $Document
    if (doc) doc._status = DocStatus.UPD
    else doc = this.cache.newDoc(this.svc + '$Status')
    doc['at'] = Date.now()
    doc['st'] = this._st
    doc['txt'] = this._txt || ''
    this.setRes('status', { st: doc['st'], at: doc['at'], txt: doc['txt']})
  }
}
Registry.registerOp(FW$setStatus)

/* FW$HasAlias retourne true s'il existe un document 
de la classe docCl (SANS le préfixe svc$)
dont l'index d'alias aliasName donné a la valeur donnée aliasValue.
*/
class FW$hasAlias extends Operation {
  _docCl: string
  _aliasName: string
  _aliasValue: string
  init () {
    super.init()
    this._docCl = this.stringValue('docCl', true)
    this._aliasName = this.stringValue('aliasName', true)
    this._aliasValue = this.stringValue('aliasValue', true)
  }

  async phase2 () {
    const dd = Registry.getDescr('', this._docCl)
    const testable = dd.isTestable(this._aliasName)
    if (!testable) this.setRes('hasalias', false)
    else {
      const doc = await this.db.oneRowByAlias(
        this.svc + '$' + this._docCl, this._aliasName, this._aliasValue)
      this.setRes('hasalias', doc !== null)
    }
  }
}
Registry.registerOp(FW$hasAlias)

// FW$GetPutUrl retourne l'URL de GET ou de PUT d'un fichier en storage
class FW$GetPutUrl extends Operation {
  _id1 : string
  _id2 : string
  _id3 : string
  _isPut : boolean
  init () {
    super.init()
    this._id1 = this.stringValue('id1', true)
    this._id2 = this.stringValue('id2', true)
    this._id3 = this.stringValue('id3', true)
    this._isPut = this.boolValue('put', true)
  }
  async phase2 () {
    const url = this._isPut ? 
      this.storage.putUrl(this, this._id1, this._id2, this._id3)
      : this.storage.getUrl(this, this._id1, this._id2, this._id3)
    this.setRes('url', url)
  }
}
Registry.registerOp(FW$GetPutUrl)


type subsToSync = {
  def: string, 
  v: number
}

/* Sync : synchronise les souscriptions citées *************************
- toSync = subsToSync[]
subsToSync = {
  def: string, 
  v: number - version 'vs' la plus récente détenue en session
}
Pour chaque 'def' retourne la sous-collection 'clazz/colName/colValue' des documents (par exemple: Article/auteurs/Zola)
- si vs est absent: connue actuellement (à now)
- changements (documents ajoutés ou partis de la sous-collection ou zombifiés) depuis la version vs
    de la sous-collection connue en session.
- { def0: [Uint8Array], def1: Uint8array, def2: { pk: data | v ... }}
  Pour les 'def2', un objet { pk: data | v ... }
  - v: version du document si n'est PLUS dans la collection
  - data: data du document s'il est dans la collection
  TODO
*/
class Sync extends Operation {
  _toSync : subsToSync[]
  init () {
    super.init()
    this._toSync = this.arrayValue('toSync', true) as subsToSync[]
  }
  async phase2 () {
    for (const { def, v } of this._toSync) {Cache.getRow
      const item = def.split('/')
      // 0: subs classe 1: subs document 2:subs coll
      const type = item.length - 1
      switch (type) {
        case 0 : { await this.sync0(def, v, item[0]); break }
        case 1 : { await this.sync1(def, v, item[0], item[1]); break }
        case 2 : { await this.sync2(def, v, item[0], item[1], item[2]); break }
      }
    }
  }

  async sync0 (def: string, v: number, clazz: string) : Promise<void> {
    const datas = await this.db.allRowsData(clazz, v)
    this.addRes(def, datas)
  }

  async sync1 (def: string, v: number, clazz: string, pk: string) : Promise<void> {
    const row = await this.db.oneRow(clazz, pk, v)
    this.addRes(def, row ? row.data : null)
  }

  async sync2 (def: string, v: number, clazz: string, colName: string, col: string) : Promise<void> {
    const dt = Registry.getDescr('', clazz)
    if (dt.hasColls) {
      const x = dt.colls.get(colName)
      if (x) {
        const datas = await this.db.getColl(clazz, colName, col, x.list, v)
        this.addRes(def, datas)
      }
    }
  }
}
Registry.registerOp(Sync)

/* getCredUpdates retourne [v, props] d'un credential
pour SON détenteur (signature vérifiée).
credId pour éviter les "vieux" credential (superstition ?)
*/
class GetCredProps extends Operation {
  _credId: string
  _docCl: string
  _docPk: string 
  init () {
    super.init()
    this._credId = this.stringValue('credId', true)
    this._docCl = this.stringValue('docCl', true)
    this._docPk = this.stringValue('docPk', false) || ''
    this.acceptBadCredential = true
  }
  async phase2 () {
    this.requireAuth()
    if (!this.authRecord.koCreds.has(this._docCl + '/' + this._docPk)) {
      const c = this.getCredRef(this._docCl, this._docPk, true)
      if (c && c.cred.credId === this._credId)
        this.setRes('vprops', [c.doc.v, c.cred.props])
    }
  }
}
Registry.registerOp(GetCredProps)

class PropsOfMyCreds extends Operation {
  init () {
    super.init()
  }
  async phase2 () {
    this.requireAuth()
    const props: Object = {}
    for(const [,credRef] of this.authRecord.creds)
      props[credRef.cred.credId] = credRef.cred.props
    this.setRes('props', props)
  }
}
Registry.registerOp(PropsOfMyCreds)

/* Auto-recvocation d'un credential.
Le user est authentifié et doit avoir présenté son credential:
- sa possession est donc assuré, il peut le supprimer
*/
class AutoRevokeCred extends Operation {
  _credId: string
  _docCl: string
  _docPk: string 
  init () {
    super.init()
    this._credId = this.stringValue('credId', true)
    this._docCl = this.stringValue('docCl', true)
    this._docPk = this.stringValue('docPk', true)
  }
  async phase2 () {
    // this.requireAdmin()
    this.requireAuth()
    const credRef = this.authRecord.getCredRef(this._docCl, this._docPk, true)
    if (!credRef || credRef.cred.credId !== this._credId)
      throw new AppExc(103, 'no_cred_owner', this, [this._docCl, this._docPk])
    const dt = Registry.getDescr('', this._docCl)
    if (dt.embedCreds) {
      const d = await this.cache.getDoc(this._docCl, { pk: this._docPk })
      const x = d.embedCreds
      if (x) delete x[this._credId]
      d._status = DocStatus.UPD
    } else {
      const c = await this.cache.getDoc('$Credential', { credId: this._credId }) as $Credential
      if (c) this.cache.delDoc('$Credential', c.myPk)
    }
  }
}
Registry.registerOp(AutoRevokeCred)

/* ListManagers liste les credentials "managers" enregistrés (qu'ils soient valides ou non)
quelle que soit leurs classes.
Un _credential manager_ est un credential qui ne peut être attribué que par un _administrateur_ .
*/
class ListManagers extends Operation {
  init () {
    super.init()
  }
  async phase2 () {
    this.requireAdmin()
    const lst = await $Credential.listManagers(this)
    this.setRes('creds', lst)
  }
}
Registry.registerOp(ListManagers)

/* credsByDoc liste les credential enregistrés .
src: map des propriétés de la pk. Pour un credential NON embedded: { docId: gheyrb... }
Retourne une liste de Cred */
class credsByDoc extends Operation {
  _docCl: string
  _src: Object 
  init () {
    super.init()
    this._docCl = this.stringValue('docCl', true)
    this._src = this.objectValue('src', true)
  }
  async phase2 () {
    this.requireAuth()
    const dt = Registry.getDescr('', this._docCl)
    let lst: $Cred[]
    if (dt.embedCreds)
      lst = await $Credential.listByDocEmbed(this, this._docCl, this._src)
    else
      lst = await $Credential.listByDoc(this, this._docCl, this._src)
    this.setRes('creds', lst)
  }
}
Registry.registerOp(credsByDoc)

/* MDEventFull retourne après création toutes les propriétés d'un Form du _document_.
Requiert que le challenge ch soit celui enregistré dans l'event créé.
*/
class MDEventFull extends Operation {
  _eventId: string
  _type: string
  _ch: string

  init () {
    super.init()
    this._eventId = this.stringValue('eventId', true)
    this._type = this.stringValue('type', true)
    this._ch = this.stringValue('ch', true)
  }
  async phase2 () {
    const f = await this.cache.getDoc(this.svc + '$Form', 
      { formId: this._eventId, type: this._type }) as $Form
    if (f && f.ch === this._ch) {
      f.setMaxLife()
      const x = { 
        v: f.v, 
        maxLife: f.maxLife, 
        status: f.status, 
        detail: f.getDetail()
      } as MDEventS
      this.setRes('mdsync', x)
      delete f.ch
      f._status = DocStatus.UPD
    }
  }
}
Registry.registerOp(MDEventFull)

/* MDEventSync retourne les propriétés `v maxLife status detail` 
d'un Form du _document_.
*/
class MDEventSync extends Operation {
  _eventId: string
  _type: string
  _chk: string

  init () {
    super.init()
    this._eventId = this.stringValue('eventId', true)
    this._type = this.stringValue('type', true)
    this._chk = this.stringValue('chk', true)
  }
  async phase2 () {
    const f = await this.cache.getDoc(this.svc + '$Form', 
      { formId: this._eventId, type: this._type }) as $Form
    if (f && f.chk(this) === this._chk && !f.isOld) {
      const x = { 
        v: this.now, 
        maxLife: f.maxLife, 
        status: f.status, 
        detail: f.getDetail() 
      } as MDEventS
      this.setRes('mdsync', x)
    }
  }
}
Registry.registerOp(MDEventSync)

/* Création d'un Form par U
- ch a ét créé par U à Crypt.rnd(9)
Il reste à la session de U 10s pour valider la création en MD
*/
class FormCreateByU extends Operation {
  _formObj: $FormObj

  init () {
    super.init()
    this._formObj = this.args['formObj'] as $FormObj
  }

  async phase2 () {
    this.requireAuth()
    let f = await this.cache.getDoc(this.svc + '$Form', this._formObj) as $Form
    if (f) 
      { this.setRes('status', 1); return }
    f = this.cache.newDoc(this.svc + '$Form', this._formObj) as $Form
    f.maxLife = Math.floor(this.now / 1000) + 10
    f.status = 1
    f.msgT = null
    if (!f.checkAuthTP(this))
      { this.setRes('status', 2); return }
    this.setRes('status', 0)
  }
}
Registry.registerOp(FormCreateByU)

/* Création d'un Form par U
- ch a ét créé par U à Crypt.rnd(9)
Il reste à la session de U 10s pour valider la création en MD
*/
class FormCreateByT extends Operation {
  _formObj: $FormObj

  init () {
    super.init()
    this._formObj = this.args['formObj'] as $FormObj
  }

  async phase2 () {
    this.requireAuth()
    let f = await this.cache.getDoc(this.svc + '$Form', this._formObj) as $Form
    if (f) 
      { this.setRes('status', 1); return }
    f = this.cache.newDoc(this.svc + '$Form', this._formObj) as $Form
    f.maxLife = Math.floor(this.now / 1000) + 10
    f.status = 2
    f.msgU = null
    await f.cryptMsgT(this)
    if (!f.checkAuthTP(this))
      { this.setRes('status', 2); return }
    this.setRes('status', 0)
  }
}
Registry.registerOp(FormCreateByT)

class FormUpdByU extends Operation {
  _formId: string
  _type: string
  _etcU: Object
  _msgU: Uint8Array

  init () {
    super.init()
    this._formId = this.stringValue('formId', true)
    this._type = this.stringValue('type', true)
    this._etcU = this.objectValue('etcU', true)
    this._msgU = this.binValue('msgU', true)
  }

  async phase2 () {
    this.requireAuth()
    const f = await this.cache.getDoc(this.svc + '$Form',
      { formId: this._formId, type: this._type }) as $Form
    if (!f || f.isOld) 
      { this.setRes('status', 1); return }
    if (!f.checkAuthTP(this))
      { this.setRes('status', 2); return }
    if (f.status > 2 ) { this.setRes('status', 3); return }
    f.etcU = this._etcU
    f.status = 1
    f.msgU = this._msgU
    f.setMaxLife()
    f._status = DocStatus.UPD
    this.setRes('status', 0)
  }
}
Registry.registerOp(FormUpdByU)

class FormUpdByT extends Operation {
  _formId: string
  _type: string
  _etcT: Object
  _msgT: Uint8Array | null

  init () {
    super.init()
    this._formId = this.stringValue('formId', true)
    this._type = this.stringValue('type', true)
    this._etcT = this.objectValue('etcT', true)
    this._msgT = this.binValue('msgT', false)
  }

  async phase2 () {
    this.requireAuth()
    const f = await this.cache.getDoc(this.svc + '$Form', 
      { formId: this._formId, type: this._type }) as $Form
    if (!f || f.isOld) 
      { this.setRes('status', 1); return }
    if (!f.checkAuthTP(this))
      { this.setRes('status', 2); return }
    if (f.status > 2 ) { this.setRes('status', 3); return }
    f.etcT = this._etcT
    f.status = 2
    f.msgT = this._msgT
    await f.cryptMsgT(this)
    f.setMaxLife()
    f._status = DocStatus.UPD
    this.setRes('status', 0)
  }
}
Registry.registerOp(FormUpdByT)

class FormCancel extends Operation {
  _formId: string
  _type: string

  init () {
    super.init()
    this._formId = this.stringValue('formId', true)
    this._type = this.stringValue('type', true)
  }

  async phase2 () {
    this.requireAuth()
    const f = await this.cache.getDoc(this.svc + '$Form', 
      { formId: this._formId, type: this._type }) as $Form
    if (!f || f.isOld) 
      { this.setRes('status', 1); return }
    if (f.userId !== this.authRecord.userId)
      { this.setRes('status', 2); return }
    if (f.status > 2 ) { this.setRes('status', 3); return }
    f.status = 4
    f._status = DocStatus.UPD
    this.setRes('status', 0)
  }
}
Registry.registerOp(FormCancel)

class ValidateForm extends Operation {
  _formId: string
  _type: string
  _opts: any
  etc: Object
  msg: Uint8Array
  byU: boolean = true
  st: number
  credTemplates: $CredTempl[] = [] 
  // Credentials To Check: credentials dont toCheck doit être reseté en phase 3

  init () {
    super.init()
    this.hasPhase3 = true
    this._formId = this.stringValue('formId', true)
    this._type = this.stringValue('type', true)
    this._opts = this.binValue('opts', true)
    if (this._opts && this._opts.credTemplates)
      for(const credId in this._opts.credTemplates)
        this.credTemplates.push(new $CredTempl(this._opts.credTemplates[credId]))
  }

  async phase2 () : Promise<void> {
    this.requireAuth()
    const f = await this.cache.getDoc(this.svc + '$Form', 
      { formId: this._formId, type: this._type }) as $Form
    if (!f || f.isOld) 
      { this.setRes('status', 1); return }
    if (!f.checkAuthTP(this))
      { this.setRes('status', 2); return }
    if (f.status > 2 ) { this.setRes('status', 3); return }
    f.opts = this._opts
    if (this.byU) {
      f.etcU = this.etc
      f.msgU = this.msg
    } else {
      f.etcT = this.etc
      f.msgT = this.msg
      await f.cryptMsgT(this)
    }
    f.setMaxLife()

    // Actions spécifique de la validation: création / maj de documents
    const newDocs = []
    this.st = await f.validate(this, newDocs)

    if (this.st) { // échec de la  validation spécifique: on annule les updates / new des credentials
      for(const d of newDocs) d._status = DocStatus.NONE
      // l'opération devient un simple update
      f.status = this.byU ? 1 : 2
      f._status = DocStatus.UPD
      this.setRes('status', this.st)
      return
    }

    // Création (éventuelle) des credentials en Safe Box de l'utilisateur cible
    for(const ct of this.credTemplates) {
      this.st = await ct.CreateSafeCred(this)
      if (this.st) break
    }
    if (this.st) { // Echec très inattendu : l'opération devient un simple update
      for(const d of newDocs) d._status = DocStatus.NONE
      f.status = this.byU ? 1 : 2
      f._status = DocStatus.UPD
      this.setRes('status', this.st)
      return
    }

    // Création (éventuelle) des documents credential
    for(const ct of this.credTemplates) {
      const doc = await ct.createCredential(this)
      if (doc) newDocs.push(doc)
      else { this.st = 99; break } // embedding document not found
    }

    if (this.st) { // Echec très inattendu : l'opération devient un simple update
      for(const d of newDocs) d._status = DocStatus.NONE
      f.status = this.byU ? 1 : 2
      f._status = DocStatus.UPD
      this.setRes('status', this.st)
      return
    }

    // succès de la validation
    
    f.status = 3
    f._status = DocStatus.UPD
    this.setRes('status', 0)
  }

  async phase3 () {
    if (this.st || !this.credTemplates.length) return
    for(const ct of this.credTemplates) {
      const args = { userId: ct.userId, credId: ct.credId, signId: ct.signId }
      await MDandSafe.doSafeOp(this, ct.userId, '$FixOneCred', args)
    }
  }
}

class FormValidateByU extends ValidateForm {
  init () {
    super.init()
    this.etc = this.objectValue('etcU', true)
    this.msg = this.binValue('msgU', true)
    this.byU = true
  }
}
Registry.registerOp(FormValidateByU)

class FormValidateByT extends ValidateForm {
  init () {
    super.init()
    this.etc = this.objectValue('etcT', true)
    this.msg = this.binValue('msgT', true)
    this.byU = false
  }
}
Registry.registerOp(FormValidateByT)

/* Retourne le form demandé par formId en tant que $FormObj
- l'appelant doit être soit U, soit un tiers ayant droit de traiter form
*/
class FormGet extends Operation {
  _formId: string
  _type: string

  init () {
    super.init()
    this._formId = this.stringValue('formId', true)
    this._type = this.stringValue('type', true)
  }
  async phase2 () {
    this.requireAuth()
    const f = await this.cache.getDoc(this.svc + '$Form', 
      { formId: this._formId, type: this._type }) as $Form
    if (!f || f.isOld) 
      { this.setRes('status', 1); return }
    if (!f.checkAuthTP(this))
      { this.setRes('status', 2); return }
    await f.decryptMsgU(this)
    await f.decryptMsgT(this)
    this.setRes('form', f.toFormObj())
  }
}
Registry.registerOp(FormGet)

class FormFilteredList extends Operation {
  _filter: string[]
  init () {
    super.init()
    this._filter = this.stringArrayValue('filter', true)
  }
  async phase2 () {
    this.requireAuth()
    // this._filter = ['Auteur/VictorHugo', 'Redaction/1'] ou ['A']
    if (this._filter.length === 1 && this._filter[0] === 'A')
      this.requireAdmin()
    const l: $FormObj[] = await $Form.filteredList(this, this._filter)
    this.setRes('forms', l)
  }
}
Registry.registerOp(FormFilteredList)

class UpdateCredential extends Operation {
  _credId: string
  _docCl: string
  _docPk: string
  _props: Object
  init () {
    super.init()
    this._credId = this.stringValue('credId', true)
    this._docCl = this.stringValue('docCl', true)
    this._docPk = this.stringValue('docPk', true)
    this._props = this.objectValue('props', true)
  }
  async phase2 () {
    this.requireAuth()
    const doc = await $Credential.update(this, this._credId, this._docCl, this._docPk, this._props)
    this.setRes('status', doc ? 0 : 1)
  }
}
Registry.registerOp(UpdateCredential)

/* Met à jour les propriétés "user" d'un Credential
- celles que l'utilisateur est libre de pouvoir éditer
- elles sont listées en static dans la classe du document du credential
(userCredProps)
*/ 
class UpdPropsCred extends Operation {
  _credId: string
  _docCl: string
  _docPk: string
  _props: Object
  init () {
    super.init()
    this._credId = this.stringValue('credId', true)
    this._docCl = this.stringValue('docCl', true)
    this._docPk = this.stringValue('docPk', true)
    this._props = this.objectValue('props', true)
  }
  async phase2 () {
    this.requireAuth()
    const credRef = this.getCredRef(this._docCl, this._docPk)
    if (!credRef || credRef.cred.credId !== this._credId) 
      { this.setRes('status', 1); return }

    const cl = Registry.newD('', this._docCl, {})
    if (!cl) { this.setRes('status', 2); return }
    const sp = cl['userCredProps'] as Set<string>
    if (!sp || !sp.size) { this.setRes('status', 3); return }

    let upd = false
    const cred = credRef.isEmbed ? credRef.doc.embedCred[credRef.cred.credId]
      : credRef.doc['cred']

    const props = cred.props
    for(const p of Object.keys(this._props)) {
      if (sp.has(p)) {
        const v = this._props[p]
        if (props[p] !== v) {
          props[p] = v
          upd = true
        }
      }
    }
    this.setRes('props', props)
    if (!upd) return
    credRef.doc._status = DocStatus.UPD
  }
}
Registry.registerOp(UpdPropsCred)
