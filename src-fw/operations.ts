// import { encode } from '@msgpack/msgpack'
import { config } from '../src/config'
import { Log } from '../src-fw/log'
import { Operation, Cache } from '../src-fw/operation'
import { MDEventS } from '../src-fw/masterdir'
import { AppExc } from '../src-fw/log'
import { MDandSafe } from '../src-fw/index'
import { Registry, topCl } from '../src-fw/registry'
import { DocDescriptor } from '../src-fw/docDescriptor'
import { ADMIN$Status, $Subs, $SubsObj, $Credential, 
  $Cred, $Form, $FormObj, $CredTempl, $CredChecker } from '../src-fw/documents'
import { DocStatus, $Document, $ADocument } from '../src-fw/document'
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
  Du fait de $, adresse la pseudo organisation 'ADMIN$' (donc le service)
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
      const s = dd.doc as ADMIN$Status // s.st: 1 2 ou 9
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

/* ADMIN$getAllStatus reçoit en argument:
- un objet avec une entrée par service
  - pour chaque entrée:
    - une propriété $ST$ : reçue à 0 pour le statut du service
    - une propriété org par organisation reçue à 0 pour le statut de l'organisation 
  st: 0:inconnu, 1:UP, 2:RO 9:DOWN
*/
class ADMIN$getAllStatus extends Operation {
  _status: Object
  init () {
    super.init()
    this._status = this.objectValue('status', true)
  }
  async phase2 () {
    for(const svc of Object.keys(this._status)) {
      if (svc === '$ST$') continue
      const obj = this._status[svc]
      const dds = await Cache.getRow(this, 'ADMIN$Status', { svc: svc}, config.STATUSLAZYNESS)
      dds.init()
      const s = dds.doc as ADMIN$Status // s.st: 1 (UP) 2 (RO) ou 9(DOWN)
      obj['$ST$'] = s.st
      if (s.st !== 9) for(const org of Object.keys(obj)) {
        if (org === '$ST$') continue
        this.org = org
        await this.dbConnector.getConnexion(this, this.org)
        const ddo = await Cache.getRow(this, svc + '$Status', { pk: '1' }, config.STATUSLAZYNESS)
        if (!ddo) obj[org] = 0
        else {
          ddo.init()
          const s: any = ddo.doc
          obj[org] = s.st
        }
      }
    }
    this.setRes('status', this._status)
  }
}
Registry.registerOp(ADMIN$getAllStatus)

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

/* FW$setSubscription enregistre la souscription d'une session (pour le svc / org de l'opération)
- Si subs.defs est vide : c'est une suppression
  si elle existait suppression de subs
- Sinon c'est une création OU une mise à jour.
*/
class FW$setSubscription extends Operation {
  _subs: $SubsObj
  _maxLife: number
  init () {
    super.init()
    this._subs = this.objectValue('subscription', true) as $SubsObj
    const longLife = this.boolValue('longLife', false)
    this._maxLife = longLife ? this.SUBSLONGMAXLIFE : this.SUBSSHORTMAXLIFE
  }
  async phase2 () {
    const subs = await this.cache.getDoc(this.svc + '$Subs', { sessionId: this.sessionId }) as $Subs

    if (this._subs.defs && this._subs.defs.length) { // Création ou mise à jour
      if (subs) { // Mise à jour
        let upd = (subs.url !== this._subs.url) || (subs.title !== this._subs.title)
          || (subs.maxLife !== this._maxLife)
        subs.url = this._subs.url
        subs.title = this._subs.title
        subs.maxLife = this._maxLife

        if (!upd) {
          const olddefs = new Set(subs.defs || [])
          const newdefs = new Set(this._subs.defs || [])      
          for (const def of olddefs) if (!newdefs.has(def)) upd = true
          if (!upd) for (const def of olddefs) if (!newdefs.has(def)) upd = true
        }
        subs.defs = this._subs.defs

        if (!upd) {
          const t1 = []
          if (subs.msgs) {
            for(const x in Object.keys(subs.msgs)) t1.push(x + '@' + subs.msgs[x])
            t1.sort((a,b) => a < b ? -1 : (a > b ? 1 : 0))
          }
          const s1 = t1.join('\n')
          const t2 = []
          if (this._subs.msgs) {
            for(const x in Object.keys(subs.msgs)) t2.push(x + '@' + subs.msgs[x])
            t2.sort((a,b) => a < b ? -1 : (a > b ? 1 : 0))
          }
          const s2 = t1.join('\n')
          upd = s1 !== s2
        }
        subs.msgs = this._subs.msgs || []

        if (upd) subs._status = DocStatus.UPD
      } else { // Création
        const initVals = { 
          subJSON: this._subs.subJSON,
          sessionId: this._subs.sessionId,
          url: this._subs.url,
          title: this._subs.title,
          defs: this._subs.defs || null,
          msgs: this._subs.msgs || null,
          maxLife : this._maxLife
        }
        this.cache.newDoc(this.svc + '$Subs', initVals)
      }
    } else { // suppression de la subscription pour sessionId
      if (subs) subs._status = DocStatus.DEL
    }
  }
}
Registry.registerOp(FW$setSubscription)

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
  _svc: string
  init () { 
    super.init() 
    this._svc = this.stringValue('svc', true)
  }
  async phase2 () {
    const dd = await Cache.getRow(this, this._svc + '$Status', { pk: '1' }, config.STATUSLAZYNESS)
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
    let doc = await this.cache.getDoc(this._svc + '$Status', { pk: '1' }) as $Document
    if (doc) doc._status = DocStatus.UPD
    else doc = this.cache.newDoc(this._svc + '$Status', { pk: '1' })
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
    const dd = DocDescriptor.get(this._docCl)
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

type SubsToSync = {
  def: string, 
  v: number
}

/* FW$Sync : synchronise les defs des souscriptions citées *************************
- toSync = SubsToSync[]
subsToSync = {
  def: string, 
  v: number - version la plus récente détenue en session
    - si v == 0, INTEGRALE, sinon INCREMENTALE
}
Pour chaque 'def' retourne la sous-collection 'clazz/colName/colValue' 
des documents par exemple: 
  - type 0: Auteur : collection de 0-N éléments.
  - type 1: Auteur/sh(Zola) : 0-1 élément.
  - type 2: Article/auteurs/sh(Zola) : collection de 0-N éléments.
- pour chaque def d'entrée, un élément syncs[def] est retourné
  - type 0 et 2: { incr, v, datas: Uint8Array[], datasD: Uint8Array[], datasM: Uint8Array[] } 
  - type 1: { incr, v, data: Uint8Array | null } datas 0 ou 1 élément

- INTEGRALE: tous les éléments connus actuellement.
  - pour le type 1 
    - le document n'existe PAS : v == 0, data: absent
    - le document existe : v: sa version data: son contenu
  - pour les types 0 et 2 
    - la collection est vide : v == 0 (datas datasM dels sont absents)
    - la collection n'est PAS vide:
      - datas : liste des contenus des documents
      - v : version du document le plus récent de datas

- INCREMENTAL, liste des changements depuis vs:
  - pour le type 1
    - document ayant disparu DEPUIS vs: v version de disparition, data: null
    - document ayant changé (pas disparu): v est sa version, data: son contenu
    - document inchangé: v: 0
  - pour les types 0 et 2, 
    - collection inchangée: v: 0 (datas dels sont absents)
    - collection changée: v et 1 à 3 listes
      - v : version du changement le plus récent
      - datas : [Uint8Array]
        - ceux ajoutés à la collection depuis vs avec leur data complète
        - ceux qui sont dans la collection et ont changé depuis vs avec data complète
      - moved : [Uint8Array] type 2 seulement
        - ceux ayant quitté la collection depuis vs avec leur data complète
      - deleted : couples des [pk, v] des documents supprimés 
        où v est leur dh de supression

Retour:
- syncs[def]: { v, data: Uint8Array[], 
  datas: Uint8Array[], moved :Uint8Array[], deleted: [[pk, v], ...]}
  - si v == -1: credential non trouvé (autres éléments null)
- now : date-heure de l'opération IMPORTANTE. C'est la dh d'ASSERTION,
  à cette date-heure l'image de la collection est celle-ci.
*/
export class FW$Sync extends Operation {
  _toSync : SubsToSync[]
  syncs: Object = {}
  checker: $CredChecker
  dd: DocDescriptor

  init () {
    super.init()
    this._toSync = this.arrayValue('toSync', true) as SubsToSync[]
    this.checker = Registry.newD(this.svc, 'CredChecker') as $CredChecker
    this.checker.op = this
  }
  async phase2 () {
    this.requireAuth()
    this.requireR()
    for (const { def, v } of this._toSync) {
      const item = def.split('/')
      // 0: classe, 1: document, 2: coll
      const type = item.length - 1
      this.dd = DocDescriptor.get(this.svc + '$' + item[0])
      switch (type) {
        case 0 : { await this.sync0(def, v, item[0]); break }
        case 1 : { await this.sync1(def, v, item[0], item[1]); break }
        case 2 : { await this.sync2(def, v, item[0], item[1], item[2]); break }
      }
    }
    this.setRes('syncs', this.syncs)
  }

  async sync0 (def: string, v: number, clazz: string) : Promise<void> {
    if (!this.checker.check0()) this.syncs[def] = { v: -1 }
    const vdatas = await this.db.allRowsData(clazz, v)
    this.syncs[def] = vdatas
  }

  async sync1 (def: string, v: number, clazz: string, pk: string) : Promise<void> {
    if (!this.checker.check1(pk))
      throw new AppExc(105, 'credential_required_not_found', this, [this.svc, clazz, pk])
    let incr = v !== 0
    const row = await this.db.oneRow(this.svc + '$' + clazz, pk, v)
    this.syncs[def] =  row ? { incr, v: row.v, data: row.data } 
      : { incr, v: 0, data: [] }
  }

  async sync2 (def: string, v: number, clazz: string, colName: string, val: string) : Promise<void> {
    if (this.dd.hasColls) {
      const x = this.dd.colls.get(colName)
      if (x) {
        if (!this.checker.check2(colName, val))
          throw new AppExc(105, 'credential_required_not_found', this, [this.svc, colName, val])
        const vdatas = await this.db.getColl(clazz, colName, val, x.list, v)
        this.syncs[def] = vdatas
      }
    }
  }
}
Registry.registerOp(FW$Sync)

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

/* Auto-revocation d'un credential.
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
      throw new AppExc(103, 'no_cred_owner', this, [this.opName, this.args.svc || '', this.args.org || '?', this._docCl, this._docPk])
    const dd = DocDescriptor.get(topCl(this.svc, this._docCl))
    if (dd.embedCreds) {
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
    const dd = DocDescriptor.get(topCl(this.svc, this._docCl))
    let lst: $Cred[]
    if (dd.embedCreds)
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
    if (!credRef || credRef.cred.credId !== this._credId || credRef.isEmbed) 
      { this.setRes('status', 1); return }
    const credCl = credRef.doc.constructor
    const sp = credCl['userCredProps'] as Set<string>
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
