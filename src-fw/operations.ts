import { Operation, Cache } from './operation'
import { AppExc } from './index'
import { Util } from './util'
import { Log } from './log'
import { Crypt } from './crypt'
import { config } from './config'
import { Subs, subscription, SubsItem } from './documents'
import { DocStatus } from './document'

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

  init () {
    super.init()
    this._subs = this.objectValue('subs', true) as subscription
  }

  async phase2 () {
    await SubsItem.deleteSessionId(this, this._subs.sessionId)
    const subs = Subs.newSubs(this, this._subs) as Subs
    for (const hdef in subs.defs) {
      const [def, msg] = subs.defs[hdef]
      SubsItem.newSubsItem(this, this._subs.sessionId, def)
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
    const pk = Crypt.shaS(this._sessionId)
    this.db.deleteRow('', 'Subs', pk)
  }

  phase3 : null

}
Operation.register('DeleteSubscription', () => { return new DeleteSubscription()})

/* UpdateSubscription met à jour la souscription de sessionId ********************************
et la créé si elle ne l'était pas.
Ses items antérieurs non repris dans l'actuelle sont supprimés.
Les items déjà existants sont réinscrits si leur maxLife est trop courte
*/
class UpdateSubscription extends Operation {
  constructor () { super() }

  _subs :  subscription

  init () {
    super.init()
    this._subs = this.objectValue('subs', true) as subscription
  }

  async phase2 () {
    let subs = await this.cache.getDoc('', 'Subs', { sessionId: this._subs.sessionId}) as Subs
    if (!subs) {
      await SubsItem.deleteSessionId(this, this._subs.sessionId)
      subs = Subs.newSubs(this, this._subs) as Subs
      for (const hdef in subs.defs) {
        const [def, msg] = subs.defs[hdef]
        SubsItem.newSubsItem(this, this._subs.sessionId, def)
      }
    } else {
      // la souscription existait : mise à jour
      const maxLifeMin = Math.floor(this.now / 1440000) + config.SUBSMAXLIFEINMINUTES[1]
      const defsBefore : Set<string> = new Set()
      for (const hdef in subs.defs) defsBefore.add(hdef)
      const defsAfter : Set<string> = new Set()
      for (const hdef in this._subs.defs) defsAfter.add(hdef)
      for (const hdef of defsBefore) {
      // Suppression des items qui ne sont plus dans la nouvelle souscription
        if (!defsAfter.has(hdef)) {
          const pk = Crypt.shaS(this._subs.sessionId + '/' + hdef)
          this.db.deleteRow('', 'SubsItem', pk)
        }
      }
      // Maj de la souscription
      subs._status = DocStatus.UPD
      subs.defs = this._subs.defs
      // Set de ses items
      for (const hdef of defsAfter) {
        const src = { sessionId: this._subs.sessionId, hdef }
        if (!defsBefore.has(hdef)) {
          // nouvel item : création
          this.cache.newDoc('', 'SubsItem', src)
        } else {
          // item existant : update pour changer le maxLife
          const item = await this.cache.getDoc('', 'SubsItem', src) as SubsItem
          if (item.maxLife < maxLifeMin) {
            item.maxLife = this.SUBSMAXLIFE
            item._status = DocStatus.UPD
          }
        }
      }

    }
  }

  phase3 : null

}
Operation.register('UpdateSubscription', () => { return new UpdateSubscription()})
