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

static isClear (a: Uint8Array) : boolean {
 return a && a.length > 3 && a[0] === 36 && a[1] === 33 && a[2] === 36 && a[3] === 33
}

}
