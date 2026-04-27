import { encode } from '@msgpack/msgpack'
import { Operation, Cache } from '../src-fw/operation'
import { AppExc, OrgsConfig } from '../src-fw/index'
import { Crypt } from '../src-fw/crypt'
import { config, Classes } from '../src-fw/config'
import { Subs, subscription, SubsItem, 
  Credential, InvitationA, InvObj } from '../src-fw/documents'
import { Invitation } from '../src/documents'
import { DocStatus } from '../src-fw/document'
import { DocType } from '../src-fw/doctypes'

export function loadingOF () {
  console.log('fw operations loading: ', Classes.sizeOp())
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
Classes.registerOp(Bug)

/* SvcOpIsAdmin retourne true si l\'utilisateur est administrateur
*/
class SvcOpIsAdmin$ extends Operation {
  async phase2 () {
    this.setRes('isadmin', this.authRecord.isAdmin)
  }
}
Classes.registerOp(SvcOpIsAdmin$)

/* GetSvcOpStatus retourne le status du service: { st, at, txt }
  st: code 0: inconnu 1: UP 9: DOWN
  at: time de dernière mise à jour
  txt: texte explicatif éventuel de l'administrateur
*/
class GetSvcOpStatus$ extends Operation {
  async phase2 () {
    const svcStatus = await Cache.getSrvStatus(this)
    this.setRes('svcStatus', svcStatus)
  }
}
Classes.registerOp(GetSvcOpStatus$)

/* SetSvcOpStatus fixe le status du service: { st, at, txt } pour cet opérateur
  st: code 0: DOWN, 1: UP
  txt: texte explicatif éventuel de l'administrateur
  ADMINISTRATEUR
*/
class SetSvcOpStatus$ extends Operation {
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
}
Classes.registerOp(SetSvcOpStatus$)

/* GetOrgStatus retourne le status de l'organisation: { st, at, txt }
  st: code 0: inconnu 1: UP 2: READ-ONLY 9: DOWN
  at: time de dernière mise à jour
  txt: texte explicatif éventuel de l'administrateur
*/
class GetSvcOrgStatus extends Operation {
  async phase2 () {
    const orgDoc = await this.cache.getOrg()
    this.setRes('orgStatus', orgDoc && orgDoc['status'] ? orgDoc['status'] : { st: 0, at: 0, txt: '' })
    // this.setRes('orgStatus', { st: 0, at: 0, txt: '' })
  }
}
Classes.registerOp(GetSvcOrgStatus)

/* SetOrgStatus fixe le status de l'organisation: { st, at, txt }
  st: code 0: inconnu 1: UP 2: READ-ONLY 9: DOWN
  at: time de dernière mise à jour
  txt: texte explicatif éventuel de l'administrateur
*/
class SetSvcOrgStatus extends Operation {
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
      this.cache.newDoc('Org', { status })
    }
  }
}
Classes.registerOp(SetSvcOrgStatus)

class SetOrgConfig$ extends Operation {
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
}
Classes.registerOp(SetOrgConfig$)

class GetOrgConfig$ extends Operation {
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
}
Classes.registerOp(GetOrgConfig$)

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
Classes.registerOp(GetPutUrl)

/* SetSubscription enregistre la sousciption d'une session *************************
- Supprime la précédente s'il y en avait une
- Créé une nouvelle si l'argument subscription n'est pas null
*/
class SetSubscription extends Operation {
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
}
Classes.registerOp(SetSubscription)

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
}
Classes.registerOp(UpdateSubscription)

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
Classes.registerOp(Sync)

/* GrantNewManager positionne la date de fin d'un Credential "manager" sous admin
class GrantNewManager extends Operation {
  _cr: CredRequest
  init () {
    super.init()
    this._cr = this.args['credRequest']
  }
  async phase2 () {
    this.requireAdmin()
    const c = await this.cache.getDoc('Credential', this._cr) as Credential
    if (!c) // enregistrement d'un nouveau Credential "manager"
      this.cache.newDoc('Credential', this._cr) as Credential
    else { // réactivation (après une révocation)
      c.pemv = this._cr.pemv
      c.limit = 0
      c._status = DocStatus.UPD
    }
  }
}
Classes.registerOp(GrantNewManager', () => { return new GrantNewManager()})
*/

type RevokeReq = {
  userId: string
  role: string
  docId: string
}
/* RevokeCred marque la fin de validité d'un Credential 
par admin ou l'utilisateur lui-même (auto-revocation)
*/
class RevokeCred extends Operation {
  _rr: RevokeReq 
  init () {
    super.init()
    this._rr = this.args['revokeReq']
  }
  async phase2 () {
    // this.requireAdmin()
    this.requireAuth()
    const c = await this.cache.getDoc('Credential', this._rr) as Credential
    if (c) {
      if (!this.authRecord.isAdmin && this.authRecord.userId !== c.userId)
        this.setRes('status', 2)
      else {
        c.limit = this.now
        this.setRes('status', 0)
        c._status = DocStatus.UPD
      }
    } else this.setRes('status', 1)
  }
}
Classes.registerOp(RevokeCred)

/* ListManagers liste les managers enregistrés (qu'ils soient valides ou non)
Retourne une liste de : { id, userId, time, limit }
*/
class ListManagers extends Operation {
  init () {
    super.init()
  }
  async phase2 () {
    this.requireAuth()
    let status = 0
    let lst = []
    /* Finalement ouverte pour permettre à un ex manager de relire la liste
    et pouvoir auto-nettoyer ses credentials dans son safe */
    /*
    if (!this.authRecord.isAdmin) {
      const cr = this.getCred('Org.manager', '', true)
      if (!cr) status = 1
    }
    */
    if (!status)
      lst = await Credential.listManagers(this)
    this.setRes('list', lst)
    this.setRes('status', status)
  }
}
Classes.registerOp(ListManagers)

/* ListUserCreds liste les credential enregistrés du user (qu'ils soient valides ou non)
Retourne une liste de : { id, role, docId, time, limit, cond }
*/
class ListUserCreds extends Operation {
  init () {
    super.init()
  }
  async phase2 () {
    this.requireAuth()
    const lst = await Credential.listUserCreds(this)
    this.setRes('list', lst)
  }
}
Classes.registerOp(ListUserCreds)

/* InvitList liste, pour un sponsor, les invitations enregistrées pour un "major"
- soit toutes, avec le credential 'Org.manager' ou 'Sponsor.major'
- soit uniquement celles du "minor" indiqué pour un 'Sponsor.minor'
Retourne une liste d'invitations 
*/
class InvitList extends Operation {
  _major: string
  _minor: string
  init () {
    super.init()
    this._major = this.stringValue('major', true)
    this._minor = this.stringValue('minor', true)
  }
  async phase2 () {
    this.requireAuth()
    let cr = this.getCred('Org.manager', '', true)
    if (!cr) {
      cr = this.getCred('Sponsor.', this._major, true)
      if (!cr) cr = this.getCred('Sponsor.', this._major + '/' + this._minor, true)
    }
    if (!cr) {
      this.setRes('status', 1)
      return
    }
    const lst = await InvitationA.listInvits(this, this._major, this._minor)
    this.setRes('list', lst)
    this.setRes('status', 0)
  }
}
Classes.registerOp(InvitList)

/* InvitGet retourne une invitation d'après son ID.
Si le user n'est pas certifié (cas d'appel depuis Master Directory pour ZZINVITS) 
seulement les propriétés: v major minor
*/
class InvitGet extends Operation {
  _invitId: string
  _userId: string
  init () {
    super.init()
    this._invitId = this.stringValue('invitId', true)
    this._userId = this.stringValue('userId', true)
  }
  async phase2 () {
    const invit = await this.cache.getDoc('Invitation', { invitId: this._invitId}) as Invitation
    if (invit && invit.userId === this._userId) {
      if (this.authRecord.userId === invit.userId) this.setRes('invitation', invit.toObj())
      else this.setRes('invitation', { v: invit.v, major: invit.major, minor: invit.minor })
    }
  }
}
Classes.registerOp(InvitGet)

/* CreateInvit: création d'une invitation. Enregistrement en base seulement.
- invObj
L'enregistrement dans le SafeStore du user U a été faite par l'application avant cette opération.
*/
class InvitCreateByU extends Operation {
  _invObj: InvObj
  init () {
    super.init()
    this._invObj = this.args['invObj'] as InvObj
    this._invObj.etc = null
    this._invObj.byU = true
  }
  async phase2 () {
    this.requireAuth()
    let invit = await this.cache.getDoc('Invitation', this._invObj) as Invitation
    if (invit) 
      { this.setRes('status', 1); return }
    if (this.authRecord.userId !== this._invObj.userId)
      { this.setRes('status', 2); return }
    invit = this.cache.newDoc('Invitation', this._invObj) as Invitation
    invit.maxLife = Math.floor(this.now / 60000) + config.INVITMAXLIFE
  }
}
Classes.registerOp(InvitCreateByU)

class InvitUpdByU extends Operation {
  _tab: string
  _invitId: string

  init () {
    super.init()
    this._tab = this.stringValue('tab', true)
    this._invitId= this.stringValue('invitId', true)
  }
  async phase2 () {
    this.requireAuth()
    let invit = await this.cache.getDoc('Invitation', { invitId: this._invitId }) as Invitation
    if (invit) 
      { this.setRes('status', 1); return }
    invit.tab = this._tab
    invit.byU = true
    invit.maxLife = Math.floor(this.now / 60000) + config.INVITMAXLIFE
    invit._status = DocStatus.UPD
  }
}
Classes.registerOp(InvitUpdByU)

class InvitCreateByS extends Operation {
  _invObj: InvObj
  init () {
    super.init()
    this._invObj = this.args['invObj'] as InvObj
    this._invObj.byU = false
  }
  async phase2 () {
    this.requireAuth()
    if (!Invitation.checkSponsor(this.authRecord, this._invObj))
      { this.setRes('status', 3); return }
    let invit = await this.cache.getDoc('Invitation', this._invObj) as Invitation
    if (invit) 
      { this.setRes('status', 1); return }
    invit = this.cache.newDoc('Invitation', this._invObj) as Invitation
    invit.maxLife = Math.floor(this.now / 60000) + config.INVITMAXLIFE
  }
}
Classes.registerOp(InvitCreateByS)

class InvitUpdByS extends Operation {
  _tab: string
  _invitId: string
  _etc: any

  init () {
    super.init()
    this._tab = this.stringValue('tab', true)
    this._invitId= this.stringValue('invitId', true)
    this._etc = this.args['etc'] as InvObj
  }
  async phase2 () {
    this.requireAuth()
    let invit = await this.cache.getDoc('Invitation', { invitId: this._invitId }) as InvitationA
    if (!invit) 
      { this.setRes('status', 1); return }
    if (!Invitation.checkSponsor(this.authRecord, invit))
      { this.setRes('status', 3); return }
    invit.tab = this._tab
    invit.byU = true
    invit.etc = this._etc
    invit.maxLife = Math.floor(this.now / 60000) + config.INVITMAXLIFE
    invit._status = DocStatus.UPD
  }
}
Classes.registerOp(InvitUpdByS)

class InvitCancel extends Operation {
  _invitId: string
  init () {
    super.init()
    this._invitId = this.stringValue('invitId', true)
  }
  async phase2 () {
    this.requireAuth()
    const invit = await this.cache.getDoc('Invitation', { invitId: this._invitId}) as Invitation
    if (!invit) return
    if (invit.userId !== this.authRecord.userId) return
    this.cache.delDoc('Invitation', this._invitId)
  }
}
Classes.registerOp(InvitCancel)

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
*/
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
    this.cache.delDoc('Invitation', this._invitId)
    this.setRes('status', 0)
  }
}
Classes.registerOp(InvitValidate)
