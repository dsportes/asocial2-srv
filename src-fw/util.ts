import crypto from 'crypto'

export function amj (epoch?: number) : number {
  const d = new Date(epoch || Date.now())
  return (d.getUTCFullYear() * 10000) + ((d.getUTCMonth() + 1) * 100) + d.getUTCDate()
}

export function sleep (delay: number) {
  if (delay <= 0) return
  return new Promise((resolve: Function) => { setTimeout(() => resolve(), delay) })
}

/* Retourne le couple [hostname, port] d'une URL */
export function getHP (url: string) : [string, number] {
  let i = url.indexOf('://')
  if (i !== -1) url = url.substring(i + 3)
  i = url.indexOf('/')
  if (i !== -1) url = url.substring(0, i)
  i = url.indexOf(':')
  const hn = i === -1 ? url : url.substring(0, i)
  const po = i === -1 ? 0 : parseInt(url.substring(i + 1))
  return [hn, po]
}

function getSalt () {
  const s = new Uint8Array(16)
  for (let j = 0; j < 16; j++) s[j] = j + 47
  return Buffer.from(s)
}

export function crypt (key: Buffer, buf: Buffer) { // u8: Buffer
  const cipher = crypto.createCipheriv('aes-256-cbc', key, getSalt())
  const b1 = cipher.update(buf)
  const b2 = cipher.final()
  return Buffer.concat([b1, b2])
}

export function decrypt (key: Buffer, bin: Buffer) {
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, getSalt())
  const b1 = decipher.update(bin)
  const b2 = decipher.final()
  return Buffer.concat([b1, b2])
}

export function cryptId (key: Buffer, id: string) : string {
  const x = crypt(this.key, Buffer.from(id)).toString('base64')
  return x.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

export function decryptId (key: Buffer, id64: string) : string {
  const x = decrypt(this.key, Buffer.from(id64, 'base64'))
  return x.toString('utf8')
}

export function pbkdf2(pwd: string) : Buffer {
  return crypto.pbkdf2Sync(Buffer.from(pwd, 'utf-8'), getSalt(), 10000, 32, 'sha256')
}