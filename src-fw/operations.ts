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

// EchoTexte retourne le texte passé en argument (un peu modifié)
class EchoTexte extends Operation {
  constructor () { super() }

  _text: string

  init () {
    super.init()
    this._text = this.stringValue('text', true, 1, 10)
    if (this._text.startsWith('KO')) throw Error('KO')
  }

  phase2 : null
  phase3 : null

  async run () {
    this.setRes('echo', 'echo >>>' + this._text + '<<< [' + new Date(this.now).toISOString() + ']')
  }

}
Operation.register('EchoTexte', () => { return new EchoTexte()})

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

/* CreateSubscription enregistre la sousciption d'une session *************************
Supprime la précédente auparavant
Créé une nouvelle
*/
class CreateSubscription extends Operation {
  constructor () { super() }

  _subs : subscription
  _life: number

  init () {
    super.init()
    this._subs = this.objectValue('subs', true) as subscription
    const longLife = this.boolValue('longLife', false)
    this._life = Math.floor(this.now / 1440000) + (longLife ? this.SUBSLONGMAXLIFE : this.SUBSSHORTMAXLIFE)
  }

  async phase2 () {
    await SubsItem.deleteSessionId(this, this._subs.sessionId)
    const subs = Subs.newSubs(this, this._subs, this._life) as Subs
    for (const xdef in subs.defs) {
      const [def, msg] = subs.defs[xdef]
      SubsItem.newSubsItem(this, this._subs.sessionId, def, this._life)
    }
  }

  phase3 : null

}
Operation.register('CreateSubscription', () => { return new CreateSubscription()})

/* DeleteSubscription supprime la souscription de sessionId *****************************
et tous ses items
*/
class DeleteSubscription extends Operation {
  constructor () { super() }

  _sessionId : string

  init () {
    super.init()
    this._sessionId = this.stringValue('sessionId', true)
  }

  async phase2 () {
    this.db.deleteRow('Subs', this._sessionId)
    await SubsItem.deleteSessionId(this, this._sessionId)
  }

  phase3 : null

}
Operation.register('DeleteSubscription', () => { return new DeleteSubscription()})

/* UpdateSubscription met à jour la souscription de sessionId ********************************
et la créé si elle ne l'était pas.
Ses items antérieurs non repris dans l'actuelle sont supprimés.
Les items déjà existants sont réinscrits si leur maxLife est trop courte
- longLife : true si vie longue
*/
class UpdateSubscription extends Operation {
  constructor () { super() }

  _subs : subscription
  _life: number
  _lifeMin: number

  init () {
    super.init()
    this._subs = this.objectValue('subs', true) as subscription
    const longLife = this.boolValue('longLife', false)
    this._life = Math.floor(this.now / 1440000) + (longLife ? this.SUBSLONGMAXLIFE : this.SUBSSHORTMAXLIFE)
    this._lifeMin = Math.floor(this.now / 1440000) + 
      Math.floor((longLife ? this.SUBSLONGMAXLIFE : this.SUBSSHORTMAXLIFE) / 2)
  }

  async phase2 () {
    let subs = await this.cache.getDoc('Subs', { sessionId: this._subs.sessionId}) as Subs
    if (!subs) {
      await SubsItem.deleteSessionId(this, this._subs.sessionId)
      subs = Subs.newSubs(this, this._subs, this._life) as Subs
      for (const xdef in subs.defs) {
        const [def, msg] = subs.defs[xdef]
        SubsItem.newSubsItem(this, this._subs.sessionId, def, this._life)
      }
    } else {
      // la souscription existait : mise à jour
      const defsBefore : Set<string> = new Set()
      for (const def in subs.defs) defsBefore.add(def)
      const defsAfter : Set<string> = new Set()
      for (const def in this._subs.defs) defsAfter.add(def)
      for (const def of defsBefore) {
      // Suppression des items qui ne sont plus dans la nouvelle souscription
        if (!defsAfter.has(def)) {
          const pk = Crypt.shaS(this._subs.sessionId + '/' + def)
          this.db.deleteRow('SubsItem', pk)
        }
      }
      // Maj de la souscription
      subs._status = DocStatus.UPD
      subs.defs = this._subs.defs
      subs.maxLife = this._life
      // Set de ses items
      for (const def of defsAfter) {
        const src = { sessionId: this._subs.sessionId, def }
        if (!defsBefore.has(def)) {
          // nouvel item : création
          this.cache.newDoc('SubsItem', src)
        } else {
          // item existant : update pour changer le maxLife
          const item = await this.cache.getDoc('SubsItem', src) as SubsItem
          if (item.maxLife < this._lifeMin) {
            item.maxLife = this._life
            item._status = DocStatus.UPD
          }
        }
      }
    }
  }

  phase3 : null

}
Operation.register('UpdateSubscription', () => { return new UpdateSubscription()})

/* AdjustSubscription corrige la sousciption d'une session *************************
Ajoute ou enlève des defs { def1: 'm1', def2: '', def3: false }
- longLife : true si vie longue
*/
class AdjustSubscription extends Operation {
  constructor () { super() }

  _sessionId : string
  _defs : Object
  _life : number

  init () {
    super.init()
    this._sessionId = this.stringValue('sessionId', true)
    this._defs = this.objectValue('defs', true)
    const longLife = this.boolValue('longLife', false)
    this._life = Math.floor(this.now / 1440000) + (longLife ? this.SUBSLONGMAXLIFE : this.SUBSSHORTMAXLIFE)
  }

  async phase2 () {
    const subs = await this.cache.getDoc('Subs', { sessionId: this._sessionId}) as Subs
    if (!subs) 
      throw new AppExc(1025, 'Unknown session', this, [this._sessionId])
    for (const def in this._defs) {
      const src = { sessionId: this._sessionId, def, maxLife: this._life }
      const v = this._defs[def]
      if (v === false) {
        delete subs.defs[def]
        await this.cache.getDoc('SubsItem', src) as SubsItem
        this.cache.delDoc('SubsItem', Crypt.shaS(this._sessionId + '/' + def))
      } else if (typeof v === 'string') {
        subs.defs[def] = v
        let subsItem = await this.cache.getDoc('SubsItem', src) as SubsItem
        if (!subsItem) {
          subsItem = this.cache.newDoc('SubsItem', src) as SubsItem
          subsItem._status = DocStatus.NEW
        } else { 
          subsItem.def = def
          subsItem['maxLife'] = this._life
          subsItem._status = DocStatus.UPD
        }
      }
      subs._status = DocStatus.UPD
      subs.maxLife = this._life
    }
  }

  phase3 : null

}
Operation.register('AdjustSubscription', () => { return new AdjustSubscription()})

/* Sync : synchronise les abonnements cités *************************
- defs: { def1: t1, def2: t2 ... }
Retourne pour chaque 'def' les documents/rowQ nouveaux depuis t.
Si t est 0, retourne les documents sans filtre de version.
Retour: { def0: [data], def1: data, def2: [data[], pkv] ... }
- data: Uint8Array
- pkv: object donnant pour chaque pk sa version la plus récente ayant quiité la collection
*/
class Sync extends Operation {
  constructor () { super() }

  _defs : Object

  init () {
    super.init()
    this._defs = this.objectValue('defs', true)
  }

  async phase2 () {
    for (const def in this._defs) {
      const v = this._defs[def]
      const item = def.split('/')
      // 0: subs classe 1: subs document 2:subs coll
      const type = item.length - 1
      switch (type) {
        case 0 : { await this.sync0(def, v, item[0]); break }
        case 1 : { await this.sync1(def, v, item[0], item[1]); break }
        case 0 : { await this.sync2(def, v, item[0], item[1], item[2]); break }
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
    if (!dt || !dt.hasColls) {
      this.addRes(def, {})
      return
    }
    const x = dt.colls.get(colName)
    if (!x) {
      this.addRes(def, {})
      return
    }
    const [datas, lpkv] = await this.db.getColl(clazz, colName, col, x.list, v)
    const pkv = {} // version la plus récente pour chaque pk
    for(const [pk, v] of lpkv) {
      const vx = pkv[pk]
      if (vx === undefined || v > vx) pkv[pk] = v
    }
    this.addRes(def, [datas, pkv])
  }

  phase3 : null

}
Operation.register('Sync', () => { return new Sync()})
