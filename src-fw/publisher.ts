import webpush from 'web-push'
import { Log } from './log'
import { Util } from './util'
import { Operation, Cache, ImpactedSub } from './operation'
import { SubsItem } from './documents'

import { encode, decode } from '@msgpack/msgpack'

/*
const vapidKeys = webpush.generateVAPIDKeys()
console.log(vapidKeys.publicKey, vapidKeys.privateKey)
*/

type notif = {
  sub: webpush.PushSubscription
  title: string
  url: string
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

  buildMessage (notif: notif) : Object {
    /* UN message par session:
    Pas envoyé à la session en cours qui recevra l'info
    en retour d'opération */
    const lines : string[] = []
    const defs : string[] = []
    for(const [def, s] of notif.defs) {
      if (s) lines.push(s)
      defs.push(def)
    }
    /* buf : objet "message" sérialisé en base64
    const message = {
      org: 'demo'
      title: 'myApp - demo', 
      body: 'Chat reçu',
      url: 'http...'
      defs: [a/v/c c/d/e ...]
    }
    */
    return {
      org: this.op.org,
      now: this.op.now,
      title: notif.title,
      url: notif.url,
      body: lines.join('\n'),
      defs: defs.join(' ')
    }
  }

  getSessionNotifs () : Object {
    const notif = this.toNotif.get(this.sessionId)
    if (!notif) return null
    const message = this.buildMessage(notif)
    return Util.objToB64(message)
  }

  /*
  ImpactedSub:
    clazz: string // du document
    pk: string // du document 
    colls: Map<string, Set<string>> // key: nom collection, value: set des valeurs impactées 
  */
  async publish (op: Operation, is: ImpactedSub) {
    // Souscriptions à la collection des documents
    await this.doSids(SubsItem.def0(is.clazz))

    // Souscriptions au document
    await this.doSids(SubsItem.def1(is.clazz, is.pk))

    // Souscriptions aux sous-collections
    for(const [colName, values] of is.colls) {
      for (const val of values) 
        await this.doSids(SubsItem.def2(is.clazz, colName, val))
    }
  }

  async doSids (def: string) : Promise<void> {
    const sids = await SubsItem.getSessionIds(this.op, def)
    if (sids.length) for(const sid of sids) await this.setDef(sid, def)
  }

  // Inscription d'une def à publier par sessionId
  async setDef (sessionId: string, def: string) {
    let tn = this.toNotif.get(sessionId)
    if (!tn) {
      const rowSubs = await Cache.getRow(this.op, 'Subs', { sessionId }, 2)
      if (!rowSubs) return
      const data = decode(rowSubs.row.data) as notif
      tn = {
        url: data.url,
        title: data.title,
        sub: JSON.parse(data['subJSON']) as webpush.PushSubscription,
        defs: new Map()
      }
      const x = data['defs'][def] // [def, msg]
      if (!x) return
      tn.defs[def] = x[1] || ''
      this.toNotif.set(sessionId, tn)
    }
  }

  async sendNotifications() {
    for(const [sessionId, notif] of this.toNotif) {
      if (sessionId !== this.sessionId)
      try {
        const message = this.buildMessage(notif)
        const buf = Util.objToB64(message)
        await webpush.sendNotification(notif.sub, buf, { TTL: 0 })
      } catch (error) {
        Log.error('sendNotification: ' + error.toString())
      }
    }
  }

}
