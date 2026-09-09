import webpush from 'web-push'
import { Log } from './log'
// import { Util } from './util'
import { keyToB64 } from './b64'
import { Operation, ImpactedSub } from './operation'
import { $Subs } from './documents'

import { encode } from '@msgpack/msgpack'

/*
const vapidKeys = webpush.generateVAPIDKeys()
Log.debug(vapidKeys.publicKey, vapidKeys.privateKey)
*/

/* Pour une sessionId, notifications à publier:
- son entête : sub, title, url
- Pour chaque def: son "message" à popper dans le browser (ou '')
*/
type notif = {
  sub: webpush.PushSubscription
  title: string
  url: string
  defs: Object // key: def, value: msg ou ''
  // { def1:msg1, def2:'' ... } liste les defs souscrites par la sessionId à notifier.
}

/* Un "publisher" est créé pour chaque opération.
Il a une entrée par sessionId devant être notifiée.
*/
export class Publisher {
  static objToB64 (obj: any) : string {
    return !obj ? '' : keyToB64(Buffer.from(encode(obj)))
  }

  toNotif: Map<string, notif> // key: sessionId value: notif (ci-dessus)
  op: Operation
  svc: string
  org: string
  sessionNotifs: string[]
  sessionId: string

  constructor (op: Operation) {
    this.toNotif = new Map()
    this.op = op
    this.svc = op.svc
    this.org = op.org
    this.sessionNotifs = []
    this.sessionId = op.sessionId
  }

  buildMessage (notif: notif, sessionId: string) : Object {
    /* Construit UN message par session 
    Le message n'est pas envoyé à la session en cours qui recevra l'info
    en retour d'opération */
    const lines : string[] = []
    const defs : string[] = []
    for(const def in notif.defs) {
      const s = notif.defs[def]
      if (s) lines.push(s)
      defs.push(def)
    }

    // async incrHeartBeatCount (svc: string, org: string, sessionId: string) : Promise<string> {
    const hbc = sessionId ? this.op.db.incrHeartBeatCount(this.svc, this.org, sessionId) : ''

    /* buf : objet "message" sérialisé en base64
    const message = {
      org: 'demo'
      title: 'myApp - demo', 
      body: 'Chat reçu',
      url: 'http...'
      defs: 'a/v/c c/d/e ...' - définitions séparées par un espace
    }
    */
    const m = {
      svc: this.op.svc,
      org: this.op.org,
      now: this.op.now,
      title: notif.title,
      url: notif.url,
      body: lines.join('\n'),
      defs: defs.join(' ')
    }
    if (hbc) m['hbc'] = hbc
    return m
  }

  getSessionNotifs () : Object {
    const notif = this.toNotif.get(this.sessionId)
    if (!notif) return null
    const message = this.buildMessage(notif, null)
    return Publisher.objToB64(message)
  }

  /* ImpactedSub : contient la liste des documents créés / mis à jour / supprimés d'une opération
  afin que le publisher rechercher les souscriptions correspondantes à notifier.
  Map : 
  - key: clazz/pk - identifiant du document
  - value: ImpactedSub { clazz, pk, colls }
    - colls:  Map: 
      - key: nom collection (colName) 
      - value: colValues 
  publish est invoqué par l'opération pour chaque ImpactedSub.
  */
  async publish (is: ImpactedSub) {
    // Souscriptions à la collection des documents
    await this.doSids($Subs.def0(is.clazz))

    // Souscriptions au document
    await this.doSids($Subs.def1(is.clazz, is.pk))

    // Souscriptions aux sous-collections
    for(const [colName, values] of is.colls) {
      for (const colValue of values) 
        await this.doSids($Subs.def2(is.clazz, colName, colValue))
    }
  }

  /* Récupère toutes les sessions ayant souscrit à cette définition.
  Pour chacune, créé / complète la liste des souscriptions à notifier:
  */
  async doSids (def: string) : Promise<void> {
    const sessionIds = await $Subs.getSessionIds(this.op, def)
    if (sessionIds.size) for(const sessionId of sessionIds) {
      const subs = await this.op.cache.getDoc(this.op.svc + '$Subs', { sessionId }) as $Subs
      if (!subs) return // cette session n'a pas de souscription
      if (subs.defs.indexOf(def) === -1) return // cette session n'a pas (encore) de souscription à notifier

      let tn: notif = this.toNotif.get(sessionId)
      if (!tn) tn = {
        url: subs.url,
        title: subs.title,
        sub: JSON.parse(subs.subJSON) as webpush.PushSubscription,
        defs: {}, // les defs de la souscription à notifier
      }
      const msg = subs.msgs[def] || ''
      tn.defs[def] = msg
      this.toNotif.set(sessionId, tn)
    }
  }

  async sendNotifications() {
    for(const [sessionId, notif] of this.toNotif) {
      if (sessionId !== this.sessionId)
      try {
        const message = this.buildMessage(notif, sessionId)
        const buf = Publisher.objToB64(message)
        await webpush.sendNotification(notif.sub, buf, { TTL: 0 })
      } catch (error) {
        Log.error('sendNotification: ' + error.toString())
      }
    }
  }

}
