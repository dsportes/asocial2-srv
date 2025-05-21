import webpush from 'web-push'
import { Log } from './index'
import { Util } from './util'
import { encode, decode } from '@msgpack/msgpack'

/*
const vapidKeys = webpush.generateVAPIDKeys()
console.log(vapidKeys.publicKey, vapidKeys.privateKey)
*/

export class WebPush {
  private static subs = new Map<string, webpush.PushSubscription>()

  public static setSubscription(subJSON: string) {
    const sub = JSON.parse(subJSON) as webpush.PushSubscription
    const hash = Util.shortHash(sub.endpoint)
    WebPush.subs.set(hash, sub)
  }

  static async sendNotification (subHash: string, payload: any) { // trlog est un objet { vcpt, vesp, vadq, lag }
  try {
    const sub = WebPush.subs.get(subHash)
    const b = Util.objToB64(payload)
    await webpush.sendNotification(sub, b, { TTL: 0 })
  } catch (error) {
    Log.error('sendNotification: ' + error.toString())
  }
}

}