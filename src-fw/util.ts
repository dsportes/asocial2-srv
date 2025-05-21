import crypto from 'crypto'
import { sha224, sha256 } from 'js-sha256'
import { encode, decode } from '@msgpack/msgpack'

export class Util {
static amj (epoch?: number) : number {
  const d = new Date(epoch || Date.now())
  return (d.getUTCFullYear() * 10000) + ((d.getUTCMonth() + 1) * 100) + d.getUTCDate()
}

static async sleep (delay: number) {
  if (delay <= 0) return
  return new Promise((resolve: Function) => { setTimeout(() => resolve(), delay) })
}

/* Retourne le couple [hostname, port] d'une URL */
static getHP (url: string) : [string, number] {
  let i = url.indexOf('://')
  if (i !== -1) url = url.substring(i + 3)
  i = url.indexOf('/')
  if (i !== -1) url = url.substring(0, i)
  i = url.indexOf(':')
  const hn = i === -1 ? url : url.substring(0, i)
  const po = i === -1 ? 0 : parseInt(url.substring(i + 1))
  return [hn, po]
}

private static buildSalt () {
  const s = new Uint8Array(16)
  for (let j = 0; j < 16; j++) s[j] = j + 47
  return Buffer.from(s)
}

private static salt = Util.buildSalt()

static getSalt() { return Util.salt }

static crypt (key: Buffer, buf: Buffer) { // u8: Buffer
  const cipher = crypto.createCipheriv('aes-256-cbc', key, Util.salt)
  const b1 = cipher.update(buf)
  const b2 = cipher.final()
  return Buffer.concat([b1, b2])
}

static decrypt (key: Buffer, bin: Buffer) {
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, Util.salt)
  const b1 = decipher.update(bin)
  const b2 = decipher.final()
  return Buffer.concat([b1, b2])
}

static cryptId (key: Buffer, id: string) : string {
  const x = Util.crypt(key, Buffer.from(id)).toString('base64')
  return x.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

static decryptId (key: Buffer, id64: string) : string {
  const x = Util.decrypt(key, Buffer.from(id64, 'base64'))
  return x.toString('utf8')
}

static pbkdf2(pwd: string) : Buffer {
  return crypto.pbkdf2Sync(Buffer.from(pwd, 'utf-8'), Util.getSalt(), 10000, 32, 'sha256')
}

static objToB64 (obj: any, url?: boolean) : string {
  if (!obj) return ''
  const u8 = new Uint8Array(encode(obj))
  return Util.u8ToB64(u8, url)
}

static u8ToB64 (u8: Uint8Array, url?: boolean) : string {
  if (!u8) return ''
  const s = Buffer.from(u8).toString('base64')
  return !url ? s : s.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

static b64ToU8 (b64: string) : Uint8Array {
  if (!b64) return null
  const diff = b64.length % 4
  let x = b64
  if (diff) {
    const pad = '===='.substring(0, 4 - diff)
    x = b64 + pad
  }
  return new Uint8Array(Buffer.from((x.replace(/-/g, '+').replace(/_/g, '/'), 'base64')))
}

static b64ToObj (b64: string) : any {
  const bin = Util.b64ToU8(b64)
  return decode(bin)
}

static clone (obj: any) : any {
  return Util.b64ToObj(Util.objToB64(obj))
}

static shortHash (s: string) { return sha224(s).substring(0, 16) }

static longHash (s: string) { return sha256(s) }

}