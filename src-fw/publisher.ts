import webpush from 'web-push'
import { Log } from './log'
import { Util } from './util'
import { Crypt } from './crypt'
import { Operation, Cache, ImpactedSub } from './operation'
import { SubsItem } from './documents'

import { encode, decode } from '@msgpack/msgpack'

/*
const vapidKeys = webpush.generateVAPIDKeys()
console.log(vapidKeys.publicKey, vapidKeys.privateKey)
*/

type notif = {
  sub: webpush.PushSubscription
  defs: Map<string, string> // key: hdef, value: msg ou ''
}

export class Publisher {

  toNotif: Map<string, notif>
  op: Operation
  sessionNotifs: string[]
  sessionId: string

  constructor (op: Operation) {
    this.toNotif = new Map()
    this.op = op
    this.sessionNotifs = []
    this.sessionId = op.sessionId
  }

  getSessionNotifs () : Object{
    const sntf = this.toNotif.get(this.sessionId)
    if (!sntf) return null
    const m = {}
    for (const [msg, hdef] of sntf.defs) m[hdef] = msg || false
    return m
  }

  /*
  ImpactedSub:
    org: string
    clazz: string
    pk: string // du document 
    colls: Map<string, Set<string>> // key: nom collection, value: set des valeurs impactées 
  */
  async publish (is: ImpactedSub) {
    // Souscriptions à la collection des documents
    let hdef = SubsItem.hdef0(is.org, is.clazz)
    await this.doSids(hdef)

    // Souscriptions au document
    hdef = SubsItem.hdef1(is.org, is.clazz, is.pk)
    await this.doSids(hdef)

    // Souscriptions aux sous-collections
    for(const [coll, values] of is.colls) {
      for (const value of values) {
        hdef = SubsItem.hdef2(is.org, is.clazz, coll, value)
        await this.doSids(hdef)
      }
    }
  }

  async doSids (hdef: string) : Promise<void> {
    const sids = await SubsItem.getSessionIds(this.op, hdef)
    if (sids.length) for(const sid of sids) await this.setHdef(sid, hdef)
  }

  // Inscription d'une def à publier par sessionId
  async setHdef (sessionId: string, hdef: string) {
    let tn = this.toNotif.get(sessionId)
    if (!tn) {
      const rowSubs = await Cache.getRow(this.op, '', 'Subs', { sessionId }, 2)
      if (!rowSubs) return
      const data = decode(rowSubs.row.data)
      tn = {
        sub: JSON.parse(data['subJSON']) as webpush.PushSubscription,
        defs: new Map()
      }
      const x = data['defs'][hdef] // [def, msg]
      if (!x) return
      tn.defs[hdef] = x[1] || ''
      this.toNotif.set(sessionId, tn)
    }
  }

  async sendNotifications() {
    for(const [sessionId, notif] of this.toNotif) {
      if (sessionId !== this.sessionId)
        try {
          const b = Util.objToB64('toto')
          await webpush.sendNotification(notif.sub, b, { TTL: 0 })
        } catch (error) {
          Log.error('sendNotification: ' + error.toString())
        }
    }
  }

  async phase3 (_sub, _appurl, _notifme) {
    const message = {
      notification: {
        title: 'Hello',
        body: 'Depuis serveur'
      },
      data: { 
        url: _appurl || '',
        notifme: ''
      }
    }
    if (_notifme) message.data.notifme = 'Y'
    try {
      const b = Util.objToB64(message)
      await webpush.sendNotification(_sub, b, { TTL: 0 })
      Log.info('Successfully sent message: ' + JSON.stringify(message))
    } catch (e) {
      Log.error('TOKEN NOT REGISTERED :' + e)
    }
  }

}
