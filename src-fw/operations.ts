import { encode, decode } from '@msgpack/msgpack'
import { Operation, Cache } from './operation'
import { AppExc, OrgsConfig } from './index'
// import { filter } from './iDbGeneric'
// import { Util } from './util'
// import { Log } from './log'
import { Crypt } from './crypt'
import { config } from './config'
import { Subs, subscription, SubsItem, Credential, Org, Invitation } from './documents'
import { DocStatus } from './document'
import { DocType } from './doctypes'
import { MasterDir } from './index'
import { StatusInvit } from './safeop'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function register () {
  return Operation.nbOf()
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
  constructor () { super() }
  init () { super.init() }
  async phase2 () { await this.db.bug(); console.log('Bug op') }
  phase3 : null
}
Operation.register('Bug', () => { return new Bug()})

/* SvcOpIsAdmin retourne true si l\'utilisateur est administrateur
*/
class SvcOpIsAdmin extends Operation {
  constructor () { super() }

  async phase2 () {
    this.setRes('isadmin', this.authRecord.isAdmin)
  }

  phase3 : null
}
Operation.register('SvcOpIsAdmin', () => { return new SvcOpIsAdmin()})


/* GetSvcOpStatus retourne le status du service: { st, at, txt }
  st: code 0: inconnu 1: UP 9: DOWN
  at: time de dernière mise à jour
  txt: texte explicatif éventuel de l'administrateur
*/
class GetSvcOpStatus$ extends Operation {
  constructor () { super() }

  async phase2 () {
    const svcStatus = await Cache.getSrvStatus(this)
    this.setRes('svcStatus', svcStatus)
  }

  phase3 : null
}
Operation.register('GetSvcOpStatus$', () => { return new GetSvcOpStatus$()})

/* SetSvcOpStatus fixe le status du service: { st, at, txt } pour cet opérateur
  st: code 0: DOWN, 1: UP
  txt: texte explicatif éventuel de l'administrateur
  ADMINISTRATEUR
*/
class SetSvcOpStatus$ extends Operation {
  constructor () { super() }

  _st: number
  _txt: string

  init () {
    super.init()
    this._st = this.intValue('st', true, 0, 9)
    this._txt = this.stringValue('txt', true)
  }

  async phase2 () {
    // const tokens = this.authRecord.getTokens('admin', '')
    // tokens a toujours un élément, sinon ça serait sorti en exception
    this.requireAdmin()
    const now = Date.now()
    const value = { at: Date.now(), st: this._st, txt: this._txt }
    await this.db.setSingleton('status', JSON.stringify(value))
    value['now'] = now
    Cache.srvStatus = value
    this.setRes('svcOpStatus', Cache.srvStatus)
  }

  phase3 : null
}
Operation.register('SetSvcOpStatus$', () => { return new SetSvcOpStatus$()})

/* GetOrgStatus retourne le status de l'organisation: { st, at, txt }
  st: code 0: inconnu 1: UP 2: READ-ONLY 9: DOWN
  at: time de dernière mise à jour
  txt: texte explicatif éventuel de l'administrateur
*/
class GetSvcOrgStatus extends Operation {
  constructor () { super() }

  async phase2 () {
    const orgDoc = await this.cache.getOrg()
    this.setRes('orgStatus', orgDoc && orgDoc['status'] ? orgDoc['status'] : { st: 0, at: 0, txt: '' })
    // this.setRes('orgStatus', { st: 0, at: 0, txt: '' })
  }

  phase3 : null
}
Operation.register('GetSvcOrgStatus', () => { return new GetSvcOrgStatus()})

/* SetOrgStatus fixe le status de l'organisation: { st, at, txt }
  st: code 0: inconnu 1: UP 2: READ-ONLY 9: DOWN
  at: time de dernière mise à jour
  txt: texte explicatif éventuel de l'administrateur
*/
class SetSvcOrgStatus extends Operation {
  constructor () { super() }

  _st: number
  _txt: string

  init () {
    super.init()
    this._st = this.intValue('st', true, 0, 9)
    this._txt = this.stringValue('txt', true)
  }

  async phase2 () {
    this.requireAdmin()
    const status = { at: this.now, st: this._st, txt: this._txt }
    let orgDoc = await this.cache.getOrg()
    if (orgDoc) {
      orgDoc.status = status
      orgDoc._status = DocStatus.UPD
    } else {
      orgDoc = this.cache.newDoc('Org', { status }) as Org
    }
  }

  phase3 : null
}
Operation.register('SetSvcOrgStatus', () => { return new SetSvcOrgStatus()})

class SetOrgConfig$ extends Operation {
  constructor () { super() }
  _st: string
  _db: string

  init () {
    super.init()
    this._st = this.stringValue('st', true, 0, 9)
    this._db = this.stringValue('db', true)
  }

  async phase2 () {
    this.requireAdmin()
    OrgsConfig.save(this, this.org, this._db, this._st)
    this.setRes('orgconfig', { db: this._db, st: this._st })
  }

  phase3 : null
}
Operation.register('SetOrgConfig$', () => { return new SetOrgConfig$()})

class GetOrgConfig$ extends Operation {
  constructor () { super() }

  async phase2 () {
    this.requireAdmin()
    /*
    const ar = this.args['authRecord']
    const isAdmin = config.ADMINUSERS.has(ar.userId)
    if (!isAdmin) 
      throw new AppExc(2007, 'admin required', this)
    */
    const dbs = Array.from(config.databases.keys())
    const sts = Array.from(config.storages.keys())
    const x = OrgsConfig.getDbSt(this.org)
    if (x) {
      const [db, st] = x
      this.setRes('orgconfig', { dbs, sts, db, st })
    } else 
      this.setRes('orgconfig', { dbs, sts, db: '', st: '' })
  }

  phase3 : null
}
Operation.register('GetOrgConfig$', () => { return new GetOrgConfig$()})

// GetPutUrl retourne l'URL de GET ou de PUT d'un fichier en storage
class GetPutUrl extends Operation {
  constructor () { super() }

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
  phase3 : null

}
Operation.register('GetPutUrl', () => { return new GetPutUrl()})

/* SetSubscription enregistre la sousciption d'une session *************************
- Supprime la précédente s'il y en avait une
- Créé une nouvelle si l'argument subscription n'est pas null
*/
class SetSubscription extends Operation {
  constructor () { super() }

  _subs: subscription
  _life: number

  init () {
    super.init()
    this._subs = this.objectValue('subsscription', false) as subscription
    const longLife = this.boolValue('longLife', false)
    this._life = Math.floor(this.now / 1440000) + (longLife ? this.SUBSLONGMAXLIFE : this.SUBSSHORTMAXLIFE)
  }

  async phase2 () {
    await SubsItem.deleteSessionId(this, this._subs.sessionId)
    if (this._subs) {
      const subs = Subs.newSubs(this, this._subs, this._life) as Subs
      for (const def in subs.defs) {
        // const msg = subs.defs[def] - pas enregistré dans SubsItem
        SubsItem.newSubsItem(this, this._subs.sessionId, def, this._life)
      }
    }
  }

  phase3 : null

}
Operation.register('SetSubscription', () => { return new SetSubscription()})

/* UpdateSubscription corrige la sousciption d'une session SI ELLE EXISTAIT
Maj éventuelle de title / url
Ajoute des defs, met à jour leur message ou en enlève { def1: 'm1', def2: '', def3: false }
*/
class UpdateSubscription extends Operation {
  constructor () { super() }

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
    const subs = await this.cache.getDoc('Subs', { sessionId: this.sessionId}) as Subs
    if (!subs) 
      throw new AppExc(1025, 'Unknown session', this, [this.sessionId])

    if (this.args['title']) { subs.title = this._title; subs._status = DocStatus.UPD }

    if (this.args['url']) { subs.url = this._url; subs._status = DocStatus.UPD }

    for (const def in this._defs) {
      const src = { sessionId: this.sessionId, def, maxLife: subs.maxLife }
      const msg = this._defs[def]
      if (msg === false) {
        delete subs.defs[def]
        await this.cache.getDoc('SubsItem', src) as SubsItem
        this.cache.delDoc('SubsItem', Crypt.shaS(this.sessionId + '/' + def))
      } else {
        subs.defs[def] = msg
        let subsItem = await this.cache.getDoc('SubsItem', src) as SubsItem
        if (!subsItem) {
          subsItem = this.cache.newDoc('SubsItem', src) as SubsItem
          subsItem._status = DocStatus.NEW
        } else { 
          subsItem.def = def
          subsItem._status = DocStatus.UPD
        }
      }
      subs._status = DocStatus.UPD
    }
  }

  phase3 : null

}
Operation.register('UpdateSubscription', () => { return new UpdateSubscription()})

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
  constructor () { super() }

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

  phase3 : null

}
Operation.register('Sync', () => { return new Sync()})

/* GrantNewManager positionne la date de fin d'un Credential "manager" sous admin
*/
class GrantNewManager extends Operation {
  constructor () { super() }

  _cr: CredRequest

  init () {
    super.init()
    this._cr = this.args['credRequest']
  }

  async phase2 () {
    this.requireAdmin()
    const c = await this.cache.getDoc('Credential', this._cr)
    if (!c) // enregistrement d'un nouveau Credential "manager"
      this.cache.newDoc('Credential', this._cr) as Credential
    else {
      c._status = DocStatus.UPD
    }
  }

  phase3 : null
}
Operation.register('GrantNewManager', () => { return new GrantNewManager()})

/* RevokeManager marque la fin de validité d'un Credential "manager" sous admin
*/
class RevokeManager extends Operation {
  constructor () { super() }

  _credId: string 

  init () {
    super.init()
    this._credId = this.stringValue('credId', true)
  }

  async phase2 () {
    this.requireAdmin()
    const c = await this.cache.getDoc('Credential', { id: this._credId}) as Credential
    if (c) {
      c.limit = this.now
      c._status = DocStatus.UPD
    }
  }

  phase3 : null
}
Operation.register('RevokeManager', () => { return new RevokeManager()})

/* ListManagers liste les managers enregistrés (qu'ils soient valides ou non)
Retourne une liste de : { id, userId, time, limit }
*/
class ListManagers extends Operation {
  constructor () { super() }

  init () {
    super.init()
  }

  async phase2 () {
    this.requireAuth()
    let status = 0
    let lst = []
    if (!this.authRecord.isAdmin) {
      const cr = this.getCred('Org.manager', '', true)
      if (!cr) status = 1
    }
    if (!status)
      lst = await Credential.listManagers(this)
    this.setRes('list', lst)
    this.setRes('status', status)
  }

  phase3 : null
}
Operation.register('ListManagers', () => { return new ListManagers()})

/* CreateInvit: création d'une invitation.
Enregistrement en base seulement.
- org
- invObj
L'enregistrement dans le SafeStore du user U a été faite
par l'application elle-même.
*/
class InvitCreate extends Operation {
  constructor () { super() }

  init () {
    super.init()
  }

  async phase2 () {
    const inv: Invitation = this.cache.newDoc('Invitation', this.args['invObj']) as Invitation
    console.log('OK CreateInvit')
  }

  phase3 : null
}
Operation.register('InvitCreate', () => { return new InvitCreate()})

/* InvitList liste les invitations enregistrées pour un "major"
- soit toutes, avec le credential 'Org.manager' ou 'Sponsor.major'
- soit uniquement celles du "minor" indiqué pour un 'Sponsor.minor'
Retourne une liste d'invitations 
*/
class InvitList extends Operation {
  constructor () { super() }

  _major: string
  _minor: string
  _isSp: boolean

  init () {
    super.init()
    this._major = this.stringValue('major', true)
    this._minor = this.stringValue('minor', true)
    this._isSp = this.boolValue('isSp', true)
  }

  async phase2 () {
    this.requireAuth()
    let cr: any
    if (!this._isSp) this.getCred('Org.manager', '', true)
    else {
      cr = this.getCred('Sponsor.', this._major, true)
      if (!cr) cr = this.getCred('Sponsor.', this._major + '.' + this._minor, true)
    }
    if (!cr) {
      this.setRes('status', 2)
      return
    }
    const lst = await Invitation.listInvits(this, this._major, this._minor)
    this.setRes('list', lst)
    this.setRes('status', 0)
  }

  phase3 : null
}
Operation.register('InvitList', () => { return new InvitList()})

/* InvitGet retourne une invitation d'après son ID. 
Le demandeur doit être l'utilisateur ayant demandé l'invitation.
*/
class InvitGet extends Operation {
  constructor () { super() }

  _invitId: string

  init () {
    super.init()
    this._invitId = this.stringValue('invitId', true)
  }

  async phase2 () {
    let s = 0
    this.requireAuth()
    const invit = await this.cache.getDoc('Invitation', { invitId: this._invitId}) as Invitation
    if (!invit) s = 1
    else {
      if (invit.userId !== this.authRecord.userId) s = 3
      else this.setRes('invitation', encode(invit))
    }
    this.setRes('status', s)
  }

  phase3 : null
}
Operation.register('InvitGet', () => { return new InvitGet()})

/* InvitDC marque le status d'une invitation comme déclinée ou annulée 
Le demandeur doit être l'utilisateur ayant demandé l'invitation
et en status 2.
*/
class InvitDC extends Operation {
  constructor () { super() }

  _invitId: string
  _txtx: string
  s: number
  invit: Invitation

  init () {
    super.init()
    this._invitId = this.stringValue('invitId', true)
    this._txtx = this.stringValue('txtx', false)
  }

  async phase2 () {
    this.s = 0
    this.requireAuth()
    this.invit = await this.cache.getDoc('Invitation', { invitId: this._invitId}) as Invitation
    if (!this.invit) this.s = 1
    else {
      if (this.invit.userId !== this.authRecord.userId) this.s = 3
      else if ((!this._txtx && this.invit.status !== 1) // cancel
          || (this._txtx && this.invit.status !== 2)) this.s = 4 // decline
    }
    if (this.s === 0) {
      this.invit.status = !this._txtx ? 6 : 5
      if (this._txtx) this.invit.txtx = this._txtx
      this.invit._status = DocStatus.UPD
    }
    this.setRes('status', this.s)
  }

  async phase3 () {
    if (this.s === 0) {
      const statusInvit: StatusInvit = {
        status: this.invit.status,
        targetId: this.invit.userId,
        invitId: this.invit.invitId
      }
      await MasterDir.post('$StatusInvit', { statusInvit }, this.invit.safeStore)
    }
  }
}
Operation.register('InvitDC', () => { return new InvitDC()})

export type Accept = {
  role: string // rôle du credential associé (et classe du document associé).
  docId: string // `docId` du credential associé (et du document associé le cas échéant).
  cond: any // données à faire figurer en `cond` du credential.
  etc: any // autres données nécessaires pour créer le document associé. 
    // U n'a pas à connaître ni interpréter `etc` (_opaque_ pour lui)
    // ne sert qu'à l'opération de création de l'objet / enregistrement du credential.
}

/* InvitAR
- soit marque le status d'une invitation en status 1 comme rejetée (3).
- soit enregistre les données d'acceptation utilisable à la validation par U (status 2 acceptée).
Le demandeur doit être un sponsor habilité. 
Logique applicative choisie ici:
- un "manager" est toujours un sponsor valide.
- un utilisateur qui a un credential Sponsor pour le "major" de l'invitation
  est un sponsor valide (quelque soit le "minor").
- un utilisateur qui a un credential Sponsor pour le "major.minor" de l'invitation
  est un sponsor valide (à condition bien sur que l'invitation ait un minor).
EN PHASE 3, le status est mis à jour dans le SafeStore du user U
*/
class InvitAR extends Operation {
  constructor () { super() }

  _invitId: string
  _txti: Uint8Array // REJECT : justification de rejet crypté par le sponsor (clé privSP / pubU)
  _accept: Accept // ACCEPT: NON null - { role, docId, cond, etc }
  s: number // status de retour

  invit: Invitation

  init () {
    super.init()
    this._accept = this.args['accept'] as Accept
    this._invitId = this.stringValue('invitId', true)
    this._txti = this.binValue('txti', true)
  }

  async phase2 () {
    this.s = 0
    this.requireAuth()
    // const sponsor = this.authRecord.userId
    this.invit = await this.cache.getDoc('Invitation', { invitId: this._invitId}) as Invitation
    if (!this.invit) this.s = 1
    if (this.invit.status !== 1) this.s = 4
    else {
      let c: Credential = this.authRecord.getCred('Org.manager', '' ,true)
      if (!c) c = this.authRecord.getCred('Sponsor.', this.invit.major ,true)
      if (!c) c = this.authRecord.getCred('Sponsor.', this.invit.major + '.' + this.invit.minor ,true)
      if (!c) this.s = 2
      else {
        if (this._accept) {
          this.invit.status = 2
          this.invit.role = this._accept.role
          this.invit.docId = this._accept.docId
          this.invit.cond = this._accept.cond
          this.invit.etc = this._accept.etc
        } else {
          this.invit.status = 3
        }
        this.invit.txti = this._txti
        this.invit.pemS = this.authRecord.pemC
        this.invit._status = DocStatus.UPD
      }
    }
    this.setRes('status', this.s)
  }

  async phase3 () {
    if (this.s === 0) {
      const statusInvit: StatusInvit = {
        status: this.invit.status,
        targetId: this.invit.userId,
        invitId: this.invit.invitId
      }
      await MasterDir.post('$StatusInvit', { statusInvit }, this.invit.safeStore)
    }
  }
}
Operation.register('InvitAR', () => { return new InvitAR()})

/* InvitValidateA (abstract) marque le status d'une invitation en status 4 (acceptée). 
Le demandeur doit être l'utilisateur.
Le traitement conduit à une importante logique spécifique:
- création éventuelle d'un ou plusieurs documents "de position" (compte, abonné, employé ...)
- enregistrement d'un ou plusieurs credentials.
Tout ceci s'effectue depuis les données role / docId / cond / etc du document invitation.
Côté application, les credentials sont à enregistrer en Safe et des subscriptions
sont à gérer sur le / les documents de "position".
*/
export class InvitValidateA extends Operation {
  constructor () { super() }

  _invitId: string
  invit: Invitation
  s: number

  init () {
    super.init()
    this._invitId = this.stringValue('invitId', true)
  }

  // Méthode abstraite systématiquement surchargée
  async doIt() { }

  async phase2 () {
    this.s = 0
    this.requireAuth()
    // const sp = this.authRecord.userId
    this.invit = await this.cache.getDoc('Invitation', { invitId: this._invitId}) as Invitation
    if (!this.invit) this.s = 1
    else {
      if (this.invit.userId !== this.authRecord.userId) this.s = 3
      else if (this.invit.status !== 2) this.s = 4
      else {
        // Do the job: logique spécifique de l'application
        await this.doIt()
        this.invit.status = 4
        this.invit._status = DocStatus.UPD
      }
    }
    this.setRes('status', this.s)
  }

  async phase3 () {
    if (this.s === 0) {
      const statusInvit: StatusInvit = {
        status: this.invit.status,
        targetId: this.invit.userId,
        invitId: this.invit.invitId
      }
      await MasterDir.post('$StatusInvit', { statusInvit }, this.invit.safeStore)
    }
  }
}
Operation.register('InvitValidateA', () => { return new InvitValidateA()})
