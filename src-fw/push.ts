import webpush from 'web-push'
import { Log } from './log'
import { Util } from './util'
import { Crypt } from './crypt'

//import { encode, decode } from '@msgpack/msgpack'

/*
const vapidKeys = webpush.generateVAPIDKeys()
console.log(vapidKeys.publicKey, vapidKeys.privateKey)
*/

export class WebPush {
  // cle: sessionId, valeur: subJSON
  private static subs = new Map<string, webpush.PushSubscription>()

  public static setSubscription(sessionId: string, subJSON: string) {
    const sub = JSON.parse(subJSON) as webpush.PushSubscription
    // const sessionId = Crypt.shaS(sub.endpoint)
    WebPush.subs.set(sessionId, sub)
  }

  public static deleteSubscription(sessionId: string) {
    WebPush.subs.delete(sessionId)
  }

  static async sendNotification (sessionId: string, payload: any) { // trlog est un objet { vcpt, vesp, vadq, lag }
  try {
    const sub = WebPush.subs.get(sessionId)
    const b = Util.objToB64(payload)
    await webpush.sendNotification(sub, b, { TTL: 0 })
  } catch (error) {
    Log.error('sendNotification: ' + error.toString())
  }
}

}