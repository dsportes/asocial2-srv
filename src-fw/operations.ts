import { decode } from '@msgpack/msgpack'
import { Operation, Cache } from '../src-fw/operation'
import { MDOperation, MDEventS } from '../src-fw/masterdir'
import { AppExc, OrgsConfig } from '../src-fw/index'
import { Crypt } from '../src-fw/crypt'
import { config, Registry } from '../src-fw/config'
import { $Status, $Subs, $subscription, $SubsItem, $Credential, $Cred, $Form, $FormObj } from '../src-fw/documents'
import { DocStatus } from '../src-fw/document'
import { DocType } from '../src-fw/doctypes'
import { filter } from '../src-fw/iDbGeneric'

export function loadingOF () {
  console.log('fw operations loading: ', Registry.sizeOp())
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

class Bug extends Operation {
  init () { super.init() }
  async phase2 () { await this.db.bug(); console.log('Bug op') }
}
Registry.registerOp(Bug)

class ErrorTest extends Operation {
  init () { super.init() }
  async phase2 () { 
    throw new AppExc(102, 'error_test', this, ['arg1', 'arg2'])
  }
}
Registry.registerOp(ErrorTest)

/* SvcOpIsAdmin retourne true si l\'utilisateur est administrateur
*/
class SvcOpIsAdmin$ extends Operation {
  async phase2 () {
    this.setRes('isadmin', this.authRecord.isAdmin)
  }
}
Registry.registerOp(SvcOpIsAdmin$)

/* GetStatus$ retourne le status du service: { st, at, txt }
  st: code 0: inconnu 1: UP 9: DOWN
  at: time de dernière mise à jour
  txt: texte explicatif éventuel de l'administrateur
  Du fait de $, adresse la pseudo organisation 'A' (donc le service)
*/
class GetStatus$ extends Operation {
  async phase2 () {
    const dd = await Cache.getRow(this, '$Status', null, config.STATUSLAZYNESS)
    if (!dd) this.setRes('status', { st: 0, at: 0, txt: '' })
    else {
      dd.init()
      const s = dd.doc as $Status
      this.setRes('status', { st: s.st, at: s.at, txt: s.txt})
    }
  }
}
Registry.registerOp(GetStatus$)

/* GetStatus retourne le status de l'organisation: { st, at, txt }
  st: code 0: inconnu 1: UP 9: DOWN
  at: time de dernière mise à jour
  txt: texte explicatif éventuel de l'administrateur
*/
class GetStatus extends Operation {
  async phase2 () {
    const dd = await Cache.getRow(this, '$Status', null, config.STATUSLAZYNESS)
    if (!dd) this.setRes('status', { st: 0, at: 0, txt: '' })
    else {
      dd.init()
      const s = dd.doc as $Status
      this.setRes('status', { st: s.st, at: s.at, txt: s.txt})
    }
  }
}
Registry.registerOp(GetStatus)

/* SetStatus$ fixe le status du service: { st, at, txt }
  st: code 0: DOWN, 1: UP
  txt: texte explicatif éventuel de l'administrateur
  ADMINISTRATEUR
*/
class SetStatus$ extends Operation {
  _st: number
  _txt: string
  init () {
    super.init()
    this._st = this.intValue('st', true, 0, 9)
    this._txt = this.stringValue('txt', true)
  }
  async phase2 () {
    this.requireAdmin()
    let doc: $Status = await this.cache.getDoc('$Status') as $Status
    if (doc) doc._status = DocStatus.UPD
    else doc = this.cache.newDoc('$Status') as $Status
    doc.at = Date.now()
    doc.st = this._st
    doc.txt = this._txt || ''
  }
}
Registry.registerOp(SetStatus$)

/* SetStatus fixe le status de l'organisation: { st, at, txt }
  st: code 0: DOWN, 1: UP
  txt: texte explicatif éventuel de l'administrateur
  ADMINISTRATEUR
*/
class SetStatus extends Operation {
  _st: number
  _txt: string
  init () {
    super.init()
    this._st = this.intValue('st', true, 0, 9)
    this._txt = this.stringValue('txt', true)
  }
  async phase2 () {
    this.requireAdmin()
    let doc: $Status = await this.cache.getDoc('$Status') as $Status
    if (doc) doc._status = DocStatus.UPD
    else doc = this.cache.newDoc('$Status') as $Status
    doc.at = Date.now()
    doc.st = this._st
    doc.txt = this._txt || ''
  }
}
Registry.registerOp(SetStatus)

class SetOrgConfig$ extends Operation {
  _torg: string
  _st: string
  _db: string
  init () {
    super.init()
    this._torg = this.stringValue('torg', true)
    this._st = this.stringValue('st', true, 0, 9)
    this._db = this.stringValue('db', true)
  }
  async phase2 () {
    this.requireAdmin()
    OrgsConfig.save(this, this._torg, this._db, this._st)
    this.setRes('orgconfig', { db: this._db, st: this._st })
  }
}
Registry.registerOp(SetOrgConfig$)

class GetOrgConfig$ extends Operation {
  _torg: string
  init () {
    super.init()
    this._torg = this.stringValue('torg', true)
  }
  async phase2 () {
    this.requireAdmin()
    const dbs = Array.from(config.databases.keys())
    const sts = Array.from(config.storages.keys())
    const x = OrgsConfig.getDbSt(this._torg)
    if (x) {
      const [db, st] = x
      this.setRes('orgconfig', { dbs, sts, db, st })
    } else 
      this.setRes('orgconfig', { dbs, sts, db: '', st: '' })
  }
}
Registry.registerOp(GetOrgConfig$)

/* HasAlias retourne true s'il existe un document de la classe docCl
dont l'index d'alias aliasName donné à la valeur donnée aliasValue.
*/
class HasAlias extends Operation {
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
    const testable = DocType.isTestable(this._docCl, this._aliasName)
    if (!testable) this.setRes('hasalias', false)
    else {
      const doc = await this.db.oneRowByAlias(this._docCl, this._aliasName, this._aliasValue)
      this.setRes('hasalias', doc !== null)
    }
  }
}
Registry.registerOp(HasAlias)

/* GetEnum retourne la liste des valeurs (string)
- name: nom du singleton - peut être relatif à une org: MyEnum_myOrg
*/
class GetEnum$ extends Operation {
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
Registry.registerOp(GetEnum$)

/* SetEnum fixe la liste des valeurs d'une enumération
*/
class SetEnum$ extends Operation {
  _name: string
  _value: string[]

  init () {
    super.init()
    this._name = this.stringValue('name', true)
    this._value = this.stringArrayValue('value', true)
  }

  async phase2 () {
    await this.db.setSingleton(this._name, JSON.stringify(this._value))
  }
}
Registry.registerOp(SetEnum$)

// GetPutUrl retourne l'URL de GET ou de PUT d'un fichier en storage
class GetPutUrl extends Operation {
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
Registry.registerOp(GetPutUrl)

/* SetSubscription enregistre la sousciption d'une session *************************
- Supprime la précédente s'il y en avait une
- Créé une nouvelle si l'argument subscription n'est pas null
*/
class SetSubscription extends Operation {
  _subs: $subscription
  _life: number
  init () {
    super.init()
    this._subs = this.objectValue('subsscription', false) as $subscription
    const longLife = this.boolValue('longLife', false)
    this._life = Math.floor(this.now / 1440000) + (longLife ? this.SUBSLONGMAXLIFE : this.SUBSSHORTMAXLIFE)
  }
  async phase2 () {
    await $SubsItem.deleteSessionId(this, this._subs.sessionId)
    if (this._subs) {
      const subs = $Subs.newSubs(this, this._subs, this._life) as $Subs
      for (const def in subs.defs) {
        // const msg = subs.defs[def] - pas enregistré dans SubsItem
        $SubsItem.newSubsItem(this, this._subs.sessionId, def, this._life)
      }
    }
  }
}
Registry.registerOp(SetSubscription)

/* UpdateSubscription corrige la sousciption d'une session SI ELLE EXISTAIT
Maj éventuelle de title / url
Ajoute des defs, met à jour leur message ou en enlève { def1: 'm1', def2: '', def3: false }
*/
class UpdateSubscription extends Operation {
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
    const subs = await this.cache.getDoc('$Subs', { sessionId: this.sessionId}) as $Subs
    if (!subs) 
      throw new AppExc(105, 'Subscription_unknown_session', this, [this.sessionId])

    if (this.args['title']) { subs.title = this._title; subs._status = DocStatus.UPD }

    if (this.args['url']) { subs.url = this._url; subs._status = DocStatus.UPD }

    for (const def in this._defs) {
      const src = { sessionId: this.sessionId, def, maxLife: subs.maxLife }
      const msg = this._defs[def]
      if (msg === false) {
        delete subs.defs[def]
        await this.cache.getDoc('$SubsItem', src) as $SubsItem
        this.cache.delDoc('$SubsItem', Crypt.shaS(this.sessionId + '/' + def))
      } else {
        subs.defs[def] = msg
        let subsItem = await this.cache.getDoc('$SubsItem', src) as $SubsItem
        if (!subsItem) {
          subsItem = this.cache.newDoc('$SubsItem', src) as $SubsItem
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
Registry.registerOp(UpdateSubscription)

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
    const dt = DocType.get(clazz)
    if (dt && dt.hasColls) {
      const x = dt.colls.get(colName)
      if (x) {
        const datas = await this.db.getColl(clazz, colName, col, x.list, v)
        this.addRes(def, datas)
      }
    }
  }
}
Registry.registerOp(Sync)

/* getCredUpdates retourne [v more] d'un credential
pour SON détenteur (signature vérifiée).
credId pour éviter les "vieux" credential (superstition)
*/
class getCredUpdates extends Operation {
  _credId: string
  _docCl: string
  _docId: string 
  init () {
    super.init()
    this._credId = this.stringValue('credId', true)
    this._docCl = this.stringValue('docCl', true)
    this._docId = this.stringValue('docId', false) || ''
  }
  async phase2 () {
    this.requireAuth()
    const cred = this.getCred(this._docId, this._docId, true)
    if (cred && cred.credId === this._credId)
      this.setRes('more', [cred.pubv, cred.more])
  }
}
Registry.registerOp(getCredUpdates)

/* Auto-recvocation d'un credential.
Le user est authentifié et doit avoir présenté son credential:
- sa possession est donc assuré, il peut le supprimer
*/
class AutoRevokeCred extends Operation {
  _credId: string
  _docCl: string
  _docId: string 
  init () {
    super.init()
    this._credId = this.stringValue('credId', true)
    this._docCl = this.stringValue('docCl', true)
    this._docId = this.stringValue('docId', true)
  }
  async phase2 () {
    // this.requireAdmin()
    this.requireAuth()
    const cred = this.authRecord.getCred(this._docCl, this._docId, true)
    if (!cred || cred.credId !== this._credId)
      throw new AppExc(103, 'no_cred_owner', this, [this._docCl, this._docId])
    const dt = DocType.get(this._docCl)
    if (dt.embedCreds) {
      const d = await this.cache.getDoc(this._docCl, { docId: this._docId })
      const x = d['creds']
      if (x) delete x[this._credId]
    } else {
      const c = await this.cache.getDoc('$Credential', { credId: this._credId }) as $Credential
      if (c) this.cache.delDoc('$Credential', c.pk)
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
    const dt = DocType.get(this._docCl)
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
    const f = await this.cache.getDoc('$Form', { formId: this._eventId, type: this._type }) as $Form
    if (f && f.ch === this._ch) {
      f.setMaxLife()
      delete f.ch
      f._status = DocStatus.UPD
      this.setRes('mdevent', f.toEvObj())
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
    const f = await this.cache.getDoc('$Form', { formId: this._eventId, type: this._type }) as $Form
    if (f && f.chk(this) === this._chk) {
      const x = { v: f.v, maxLife: f.maxLife, status: f.status, detail: f.getDetail() } as MDEventS
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
    let f = await this.cache.getDoc('$Form', this._formObj) as $Form
    if (f) 
      { this.setRes('status', 1); return }
    f = this.cache.newDoc('$Form', this._formObj) as $Form
    if (this.authRecord.userId !== f.userId)
      { this.setRes('status', 2); return }
    f.setCreds()
    f.maxLife = Math.floor(this.now / 1000) + 10
    f.lv = this.now
    f.status = 1
    f.msgT = null
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
    let f = await this.cache.getDoc('$Form', this._formObj) as $Form
    if (f) 
      { this.setRes('status', 1); return }
    f = this.cache.newDoc('$Form', this._formObj) as $Form
    if (!f.checkAuthTP(this))
      { this.setRes('status', 2); return }
    f.setCreds()
    f.maxLife = Math.floor(this.now / 1000) + 10
    f.lv = this.now
    f.status = 1
    f.msgU = null
    await f.cryptMsgT(this)
    this.setRes('status', 0)
  }
}
Registry.registerOp(FormCreateByT)

class FormUpdByU extends Operation {
  _formId: string
  _type: string
  _status: number
  _etcU: Object
  _msgU: Uint8Array

  init () {
    super.init()
    this._formId = this.stringValue('formId', true)
    this._type = this.stringValue('type', true)
    this._status = this.intValue('type', true)
    this._etcU = this.objectValue('etcU', true)
    this._msgU = this.binValue('msgU', true)
  }

  async phase2 () {
    this.requireAuth()
    const f = await this.cache.getDoc('$Form', { eventId: this._formId, type: this._type }) as $Form
    if (!f) 
      { this.setRes('status', 1); return }
    if (f.userId !== this.authRecord.userId)
      { this.setRes('status', 2); return }
    f.etcU = this._etcU
    f.status = this._status
    f.msgU = this._msgU
    f.setCreds()
    f.setMaxLife()
    this.setRes('status', 0)
  }
}
Registry.registerOp(FormUpdByU)

class FormUpdByT extends Operation {
  _formId: string
  _type: string
  _status: number
  _etcT: Object
  _msgT: Uint8Array | null

  init () {
    super.init()
    this._formId = this.stringValue('formId', true)
    this._type = this.stringValue('type', true)
    this._status = this.intValue('type', true)
    this._etcT = this.objectValue('etcT', true)
    this._msgT = this.binValue('msgT', false)
  }

  async phase2 () {
    this.requireAuth()
    const f = await this.cache.getDoc('$Form', { formId: this._formId, type: this._type }) as $Form
    if (!f) 
      { this.setRes('status', 1); return }
    if (!f.checkAuthTP(this))
      { this.setRes('status', 2); return }
    f.etcT = this._etcT
    f.status = this._status
    f.msgT = this._msgT
    await f.cryptMsgT(this)
    f.setCreds()
    f.setMaxLife()
    this.setRes('status', 0)
  }
}
Registry.registerOp(FormUpdByT)

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
    const f = await this.cache.getDoc('$Form', { formId: this._formId, type: this._type }) as $Form
    if (!f) 
      { this.setRes('status', 1); return }
    if (this.authRecord.userId !== f.userId && !f.checkAuthTP(this))
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

/*
class CaseCancel extends Operation {
  _caseId: string
  init () {
    super.init()
    this._caseId = this.stringValue('caseId', true)
  }
  async phase2 () {
    this.requireAuth()
    const cas = await this.cache.getDoc('Case', { invitId: this._caseId}) as Case
    if (!cas) return
    if (cas.userId !== this.authRecord.userId) return
    this.cache.delDoc('Case', cas.pk)
    this.setRes('status', 0)
  }
}
Registry.registerOp(CaseCancel)
*/

/* InvitValidate réalise les opérations correspondantes. 
Le demandeur doit être l'utilisateur.
Le traitement conduit à une importante logique spécifique:
- création éventuelle d'un ou plusieurs documents "de position" (compte, abonné, employé ...)
- enregistrement d'un ou plusieurs credentials.
Tout ceci s'effectue depuis les données (dont etc) du document invitation.
Côté application, 
- les credentials sont à enregistrer en Safe.
- des subscriptions sont à gérer sur le / les documents de "position".
- l'invitation est à supprimer du Master Directory

export class InvitValidate extends Operation {
  _invitId: string
  _validArgs: any
  init () {
    super.init()
    this._invitId = this.stringValue('invitId', true)
    this._validArgs = this.objectValue('validArgs', true)
  }
  async phase2 () {
    let s = 0
    this.requireAuth()
    const invit = await this.cache.getDoc('Invitation', { invitId: this._invitId}) as Invitation
    if (!invit) 
      { this.setRes('status', 1); return}
    if (invit.userId !== this.authRecord.userId) 
      { this.setRes('status', 2); return }
    // Do the job: logique spécifique de l'application
    const status = await invit.validate(this, this._validArgs)
    if (status !== 0)
      { this.setRes('status', status); return }
    this.cache.delDoc('Invitation', invit.pk)
    this.setRes('status', 0)
  }
}
Registry.registerOp(InvitValidate)
*/