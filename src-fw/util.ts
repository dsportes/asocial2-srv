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
  return new Uint8Array(Buffer.from(x.replace(/-/g, '+').replace(/_/g, '/'), 'base64'))
}

static b64ToObj (b64: string) : any {
  const bin = Util.b64ToU8(b64)
  return decode(bin)
}

static clone (obj: any) : any {
  return Util.b64ToObj(Util.objToB64(obj))
}

static quarter (d: Date) : number {
  const y = d.getUTCFullYear() % 2000
  const q = Math.floor(d.getUTCMonth() / 4)
  return (y * 4) + q
}

static currentMonth () : number {
  const d = new Date()
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  return (y * 100) + m
}

static equ8(a: Uint8Array, b: Uint8Array) : boolean {
  if (!a && !b) return true
  if (!a && b) return false
  if (a && !b) return false
  if (a.length !== b.length) return false
  for(let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

}
