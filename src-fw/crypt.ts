import { Util } from './util'
// @ts-ignore
import { encode, decode } from '@msgpack/msgpack'
import crypto from 'crypto'
import { vector } from './vector'
import { Operation } from './operation'

const padding = 'abcdefghijklmnopqrstuvwzyzABCDEF'
const encoder = new TextEncoder()
const decoder = new TextDecoder()

const p2 = [1, 0, 0, 0, 0, 0]; for (let i = 1; i < 6; i++) p2[i] = p2[i - 1] * 256

/* 
AES-GCM
Problème de comptabilité entre subtle.crypt et crypto.createCipheriv
- subtle.crypt : met un authTag dans les 16 derniers bytes du buffer.
- crypto.createCipheriv : ne les met pas et les délivre à part.
Dans le second cas on le rajoute dans le buffer pour être utilisable par subtle.decrypt.
Il n'y a pas d'option standard, inclusion ou non les implémentations semblent partagées.

Réduire la taille du authTag: théoriquement possible avec quelques tailles possibles 
mais certaines implémentations forcent 128bits. De facto on n'échappe pas à ces 16 octets.
Réduire fictivement la taille de iv de 12 bytes, par exemple à 6 répétés 2 fois.
Mais ça augmente le risque d'utiliser le même iv pour le même texte à crypter ce
qui est considérer comme une faiblesse.

cryptId et decryptId
Le résultat crypté est le même pour une même valeur à l'entrée.
On est tenté de l'utiliser pour crypter une ID clé d'accès à un contenu (en général persistent).
Mais ça impose d'avoir un iv dérivé d'un hash de l'ID: le résultat crypté 
est fragilisé par la présence en clair de quelques bytes du hash ce qui facilite
la vie d'un hacker.
L'utilisation de "vector" est discutable pour calculer le iv. Ca complique la 
vie d'un hacker qui ne l'a pas. Est-ce déterminant ?
Plus généralement c'est l'usage de cryptId qui est à considérer:
- si c'est juste pour qu'une clé d'accès à des données ne fasse pas apparaître
l'ID en clair mais qu'on n'utilise pas la valeur cryptée por retrouver l'ID d'origine,
un hash fait mieux l'affaire.
- dans quels cas aurait-on besoin de réobtenir l'ID d'origine depuis son cryptgae
ET l'obligation d'avoir le même cryptage pour une même clé ?
"vector.ts" est généré (une fois par serveur) par genVector.ts

Cryptage asymétrique
L'obtention d'une paire de clés publique / privée par ECDH aboutit toujours à 
générer une clé AES-GCM de 256bits, qui elle va gérer le contenu réel et non limité en taille.
- les clés sont plus courtes qu'en RSA (surtout la clé publique).
- la clé publique ne peut être exportée qu'en JWK ce qui malheureusement en fait un texte long.
- on ne peut pas crypter directement un contenu court, qui en RSA fait toujours au moins
256 bytes (ce qui n'est pas si court). En revanche, la clé publique est courte et
on peut crypter des contenus courts en AES pour moins de 256 bytes.
*/
export class Crypt {
  /*
  cipher ne met PAS le authTag dans le buffer encodé
  MAIS le délivre à part.
  Il est explicitement ajouté à la fin du buffer pour 
  être compatible avec subtle.decrypt qui l'attend là (par défaut et sans choix)
  */
  static crypt (key: Buffer, buf: Buffer) {
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 })
    const b1 = cipher.update(buf)
    const b2 = cipher.final()
    const authTag = cipher.getAuthTag()
    // console.log('crypt authTag  ', authTag)
    return Buffer.concat([iv, b1, b2, authTag])
  }
  
  /*
  Le authTag se trouve dans les 16 derniers bytes.
  On l'extrait et on decipher le texte SANS le authTag
  MAIS en lui donnant explicitement par setAuthTag
  */
  static decrypt (key: Buffer, buf: Buffer) {
    const iv = buf.subarray(0, 12)
    const enc = buf.subarray(12, buf.byteLength - 16)
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    const authTag = buf.subarray(buf.byteLength - 16)
    // console.log('decrypt authTag ', Buffer.from(authTag).toString('hex'))
    decipher.setAuthTag(authTag)
    const b1 = decipher.update(Buffer.from(enc))
    const b2 = decipher.final()
    return Buffer.concat([b1, b2])
  }

  static alg = { name: 'ECDH', namedCurve: 'P-521' }

  /* 
  Le authTag est généré sans laisser le choix 
  ET placé d'office DANS les 16 derniers bytes de enc
  */
  static async crypterSrv (cle: Uint8Array, buf: Uint8Array) : Promise<Uint8Array> {
    try {
      const iv = crypto.randomBytes(12)
      const key = await crypto.subtle.importKey('raw', cle, 'AES-GCM', false, ['encrypt'])
      const enc = Buffer.from(await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, tagLength: 128 }, key, buf))
      const x = Buffer.concat([iv, enc])
      // const authTag = buf.subarray(buf.byteLength - 16)
      // console.log('crypterSrv authTag ', Buffer.from(authTag).toString('hex'))
      return x
    } catch (e) {
      return null
    }
  }

  /*
  On peut retrouver le authTag mis par l'encryption dans les 16 derniers bytes.
  */
  static async decrypterSrv (cle: Uint8Array, buf: Uint8Array) : Promise<Uint8Array> {
    try {
      const key = await crypto.subtle.importKey('raw', cle, 'AES-GCM', false, ['decrypt'])
      const iv = buf.subarray(0, 12)
      const enc = buf.subarray(12)
      // const authTag = Buffer.from(buf.subarray(buf.byteLength - 16))
      // console.log('decrypterSrv authTag ', Buffer.from(authTag).toString('hex'))
      return new Uint8Array(await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv, tagLength: 128 }, key, enc))
    } catch (e) {
      return null
    }
  }

  /* Obtention d'une couple de clés publique / privée:
  - la clé publique est courte.
  - la clé privée est longue (encodée en binaire depuis un JWT.)
  */
  static async getKeyPair () : Promise<Uint8Array[]> {
    const p = await crypto.subtle.generateKey(Crypt.alg, true, ['deriveKey'])
    return [
      new Uint8Array(await crypto.subtle.exportKey('raw', p.publicKey)),
      new Uint8Array(encode(await crypto.subtle.exportKey('jwk', p.privateKey)))
    ]
  }

  /* Obtention de la clé AES-GCM 256 depuis un couple publique (Emilie), privée (Julie).
  Pour un couple donné, retourne toujours la même clé AES.
  Pour le couple inversé (publique(Julie), privée (Emilie)), 
  retourne aussi la même clé AES (c'est le but !).
  */
  static async getAESKey (pubKey: Uint8Array, myPrivKey: Uint8Array): Promise<Uint8Array> {
    const pub = await crypto.subtle.importKey('raw', pubKey, Crypt.alg, true, [])
    const priv = await crypto.subtle.importKey('jwk', decode(myPrivKey), Crypt.alg, true, ['deriveKey'])
    const k = await crypto.subtle.deriveKey(
      { name: 'ECDH', public: pub }, priv, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
    )
    return new Uint8Array(await crypto.subtle.exportKey('raw', k))
  }

  /* Hash PBKFD2 d'une "pass phrase" en deux morceaux (équivelent à login / password).
  Le "login" sert à générer le salt qui est utilisé pour hasher l'ensemble s1 + s2.
  Deux versins: une async universelle et une sync seulement sous node.
  */
  static async strongHash (s1: string, s2: string) : Promise<string> {
    const x = s1.length >= padding.length ? s1 : s1 + padding.substring(0, padding.length - s1.length)
    const y = s2.length >= padding.length ? s2 : s2 + padding.substring(0, padding.length - s2.length)
    const h1 = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(x)))
    const salt = h1.subarray(0, 16)
    const p = await crypto.subtle.importKey('raw', encoder.encode(x + '@@@' + y), 'PBKDF2', false, ['deriveKey'])
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt : salt, iterations: 20000, hash: 'SHA-256' },
      p,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    )
    const res = new Uint8Array(await crypto.subtle.exportKey('raw', key))
    return Util.u8ToB64(res, true)
  }

  /* Version sync avec node */
  static syncStrongHash (s1: string, s2: string) : string {
    const x = s1.length >= padding.length ? s1 : s1 + padding.substring(0, padding.length - s1.length)
    const y = s2.length >= padding.length ? s2 : s2 + padding.substring(0, padding.length - s2.length)
    const h1 = crypto.createHash('sha256').update(encoder.encode(x)).digest()
    // const h1 = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(x)))
    const salt = h1.subarray(0, 16)
    const k = crypto.pbkdf2Sync(Buffer.from(x + '@@@' + y, 'utf-8'), salt, 20000, 32, 'sha256')
    return Util.u8ToB64(k, true)
  }

  static cryptId (key: Buffer, id: string) : string {
    const buf = encoder.encode(id)
    const h1 = crypto.createHash('sha256').update(buf).digest()
    const vx = h1.subarray(13, 16)
    const v = []
    for (let i = 0; i < 3; i++) v[i] = vector.subarray(vx[i], vx[i] + 4)
    const iv = Buffer.concat(v)
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 })
    const b1 = cipher.update(buf)
    const b2 = cipher.final()
    const authTag = cipher.getAuthTag()
    // console.log('crypt authTag  ', authTag)
    const res = Buffer.concat([iv, b1, b2, authTag])
    return Util.u8ToB64(res, true)
  }

  static decryptId (key: Buffer, id64: string) : string {
    const buf = Buffer.from(Util.b64ToU8(id64))
    const iv = buf.subarray(0, 12)
    const enc = buf.subarray(12, buf.byteLength - 16)
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    const authTag = buf.subarray(buf.byteLength - 16)
    // console.log('decrypt authTag ', Buffer.from(authTag).toString('hex'))
    decipher.setAuthTag(authTag)
    const b1 = decipher.update(Buffer.from(enc))
    const b2 = decipher.final()
    const x = Buffer.concat([b1, b2])
    return x.toString('utf8')
  }

  static sha32 (x: any) {
    return crypto.createHash('sha256').update(Buffer.from(x)).digest().toString('base64url')
  }

  static sha12 (x: any) {
    return crypto.createHash('sha256').update(Buffer.from(x)).digest().subarray(3, 15).toString('base64url')
  }

  static shaInt (x: any) {
    const u8 = new Uint8Array(crypto.createHash('sha256').update(Buffer.from(x)).digest())
    let r = 0; for (let i = 3, j = 0; j < 6; i++, j++) r += (p2[j] * u8[i])
    return r
  }
}

export async function testSH () {
  console.log(await Crypt.strongHash('pierre', 'legrand'))
  console.log( Crypt.syncStrongHash('pierre', 'legrand'))
  const key = Buffer.from(Util.b64ToU8(Operation.config.SRVKEY))
  const c1 = Crypt.cryptId(key, 'iddetoto')
  console.log('crypted id: ', c1)
  const id = Crypt.decryptId(key, c1)
  console.log('decrypted id: ', id)

  const c2 = Crypt.cryptId(key, 'iddetoto')
  console.log('crypted id: ', c2)
  const id2 = Crypt.decryptId(key, c2)
  console.log('decrypted id: ', id2)

  const x = 'toto est tres tres beau'
  console.log(Crypt.sha32(x))
  console.log(Crypt.sha12(x))
  console.log(Crypt.shaInt(x))
}

export async function testECDH () {
  // Dans app
  const appPair = await Crypt.getKeyPair()
  const appPub = appPair[0]
  console.log(Util.u8ToB64(appPub), Util.u8ToB64(appPair[1]))

  // Dans srv
  const srvPair = await Crypt.getKeyPair()
  const srvPub = srvPair[0]
  console.log(Util.u8ToB64(srvPub), Util.u8ToB64(srvPair[1]))

  const aesSrv = await Crypt.getAESKey(appPub, srvPair[1])
  console.log('aesSrv: ', Util.u8ToB64(aesSrv))
  const aesSrv2 = await Crypt.getAESKey(appPub, srvPair[1])
  console.log('aesSrv again: ', Util.u8ToB64(aesSrv2))
  const x1 = await Crypt.crypterSrv(aesSrv, encoder.encode('toto est tres beau'))
  const x1b = Crypt.crypt(Buffer.from(aesSrv), Buffer.from(encoder.encode('toto est tres beau')))

  // Dans app
  const aesApp = await Crypt.getAESKey(srvPub, appPair[1])
  console.log('aesApp: ', Util.u8ToB64(aesApp))
  const x3 = await Crypt.decrypterSrv(aesApp, x1)
  console.log('x3:', decoder.decode(x3))
  const x4 = Crypt.decrypt(Buffer.from(aesApp), Buffer.from(x1b))
  console.log('x4:', decoder.decode(x4))
  const x5 = Crypt.decrypt(Buffer.from(aesApp), Buffer.from(x1))
  console.log('x5: ', decoder.decode(x5))
  const x6 = await Crypt.decrypterSrv(aesApp, Buffer.from(x1b))
  console.log('x6: ', decoder.decode(x6))
}
