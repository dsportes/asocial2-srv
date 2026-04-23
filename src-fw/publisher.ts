import webpush from 'web-push'
import { Log } from './log'
import { Util } from './util'
import { keyToB64 } from './b64'
import { Operation, Cache, ImpactedSub } from './operation'
import { SubsItem, subscription } from './documents'

import { encode, decode } from '@msgpack/msgpack'

/*
const vapidKeys = webpush.generateVAPIDKeys()
console.log(vapidKeys.publicKey, vapidKeys.privateKey)
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
  allDefs: Object 
  /* { def1:msg1, def2:'' ... } cache TOUTES les defs souscrites 
  par la sessionId alors que defs ne comporte QUE celles à notifier.
  */
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
  sessionNotifs: string[]
  sessionId: string

  constructor (op: Operation) {
    this.toNotif = new Map()
    this.op = op
    this.sessionNotifs = []
    this.sessionId = op.sessionId
  }

  buildMessage (notif: notif) : Object {
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
    /* buf : objet "message" sérialisé en base64
    const message = {
      org: 'demo'
      title: 'myApp - demo', 
      body: 'Chat reçu',
      url: 'http...'
      defs: 'a/v/c c/d/e ...' - définitions séparées par un espace
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
    return Publisher.objToB64(message)
  }

  /* ImpactedSub : contient la liste des documents créés / mis à jour / supprimés d'une opération
  afin que le publisher rechercher les souscriptions correspondantes à notifier.
  Voir manageRowQ() ci-dessus.
  Map : 
  - key: clazz/pk - identifiant du document
  - value: ImpactedSub { clazz, pk, colls }
    - colls:  Map: 
      - key: nom collection (colName) 
      - value: colValues 
  publish est invoqué par l'opération pour chaque ImpactedSub.
  */
  async publish (op: Operation, is: ImpactedSub) {
    // Souscriptions à la collection des documents
    await this.doSids(SubsItem.def0(is.clazz))

    // Souscriptions au document
    await this.doSids(SubsItem.def1(is.clazz, is.pk))

    // Souscriptions aux sous-collections
    for(const [colName, values] of is.colls) {
      for (const colValue of values) 
        await this.doSids(SubsItem.def2(is.clazz, colName, colValue))
    }
  }

  /* Récupère toutes les sessions ayant souscrit à cette définition.
  Pour chacune, créé / complète la liste des souscriptions à notifier:
  */
  async doSids (def: string) : Promise<void> {
    const sessionIds = await SubsItem.getSessionIds(this.op, def)
    if (sessionIds.length) for(const sessionId of sessionIds) {
      let tn: notif = this.toNotif.get(sessionId)
      if (!tn) {
        const rowSubs = await Cache.getRow(this.op, 'Subs', { sessionId }, 2)
        if (!rowSubs) return
        const subs: subscription = decode(rowSubs.row.data) as subscription
        const msg = subs.defs[def] // msg ou ''
        if (msg === undefined) return // cette session n'a pas (encore) de souscription à notifier
        tn = {
          url: subs.url,
          title: subs.title,
          sub: JSON.parse(subs.subJSON) as webpush.PushSubscription,
          defs: {}, // les defs de la souscription à notifier
          allDefs: subs.defs // TOUTES les defs de la souscription, à notifier OU NON
        }
        tn.defs[def] = msg
        this.toNotif.set(sessionId, tn)
      } else { // La session a déjà une notif amorcée: elle est complétée (ou non)
        const msg = tn.allDefs[def] // msg ou ''
        if (msg !== undefined) tn.defs[def] = msg
      }
    }
  }

  async sendNotifications() {
    for(const [sessionId, notif] of this.toNotif) {
      if (sessionId !== this.sessionId)
      try {
        const message = this.buildMessage(notif)
        const buf = Publisher.objToB64(message)
        await webpush.sendNotification(notif.sub, buf, { TTL: 0 })
      } catch (error) {
        Log.error('sendNotification: ' + error.toString())
      }
    }
  }

}
