import { encode, decode } from '@msgpack/msgpack'
import { Operation, Cache } from './operation'
import { AppExc } from './index'
import { Util } from './util'
import { Log } from './log'
import { Crypt } from './crypt'
import { config } from './config'
import { Subs, subscription, SubsItem } from './documents'
import { DocStatus } from './document'
import { DocType } from './doctypes'

export function register () {
  return Operation.nbOf()
}

// EchoText retourne le texte passé en argument (un peu modifié)
class EchoText extends Operation {
  constructor () { super() }

  _text: string

  init () {
    super.init()
    this._text = this.stringValue('text', true, 1, 10)
    if (this._text === 'KO1') throw Error('KO')
    if (this._text === 'KO2') 
      throw new AppExc(1001, 'Fake in EchoText', this)
  }

  phase2 : null
  phase3 : null

  async run () {
    this.setRes('echo', 'echo >>>' + this._text + '<<< [' + new Date(this.now).toISOString() + ']')
  }

}
Operation.register('EchoText', () => { return new EchoText()})

// Test d'une phase 2 limitée à setAuths() *************************************
class TestAuth extends Operation {
  constructor () { super() }

  // exécute une phase 2 vide, en fait juste un setAuths()
  phase3 : null

}
Operation.register('TestAuth', () => { return new TestAuth()})

/* GetSrvStatus retourne le status du service: { st, at, txt }
  st: code 0: DOWN, 1: UP
  at: time de dernière mise à jour
  txt: texte explicatif éventuel de l'administrateur
*/
class GetSrvStatus extends Operation {
  constructor () { super() }

  async phase2 () {
    const srvStatus = await Cache.getSrvStatus(this)
    this.setRes('srvStatus', srvStatus)
  }

  phase3 : null
}
Operation.register('GetSrvStatus', () => { return new GetSrvStatus()})

/* SetSrvStatus fixe le status du service: { st, at, txt }
  st: code 0: DOWN, 1: UP
  txt: texte explicatif éventuel de l'administrateur
  ADMINISTRATEUR
*/
class SetSrvStatus extends Operation {
  constructor () { super() }

  _st: number
  _txt: string

  init () {
    super.init()
    this._st = this.intValue('st', true, 0, 2)
    this._txt = this.stringValue('txt', true)
  }

  async phase2 () {
    if (!this.auths.has('ADMIN'))
      throw new AppExc(1010, 'ADMIN required', this, ['SetSrvStatus'])
    Cache.srvStatus = await this.db.setSrvStatus(this._st, this._txt)
    this.setRes('srvStatus', Cache.srvStatus)
  }

  phase3 : null
}
Operation.register('SetSrvStatus', () => { return new SetSrvStatus()})

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
      this.storage.putUrl(this._id1, this._id2, this._id3)
      : this.storage.getUrl(this._id1, this._id2, this._id3)
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
    for (const { def, v } of this._toSync) {
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
