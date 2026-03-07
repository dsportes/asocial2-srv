import { encode, decode } from '@msgpack/msgpack'
import crypto from 'crypto'
// @ts-ignore
// import rsa from 'jsrsasign'
import { KJUR } from './dsportes_jsrsasign.mjs'

const padding = 'abcdefghijklmnopqrstuvwzyzABCDEF'
const encoder = new TextEncoder()
const decoder = new TextDecoder()

const p2 = [1, 0, 0, 0, 0, 0]; for (let i = 1; i < 6; i++) p2[i] = p2[i - 1] * 256

const byteToHex = [];

for (let n = 0; n <= 0xff; ++n) {
    const hexOctet = n.toString(16).padStart(2, "0")
    byteToHex.push(hexOctet)
}

export function arrayBuffertohex (arrayBuffer: Buffer) : string {
    const buff = new Uint8Array(arrayBuffer)
    const hexOctets = [] // new Array(buff.length) is even faster (preallocates necessary array size), then use hexOctets[i] instead of .push()
    for (let i = 0; i < buff.length; ++i) hexOctets.push(byteToHex[buff[i]])
    return hexOctets.join("")
}

export function hexToArrayBuffer (hex: string) : Buffer {
    const uint8array = new Uint8Array(Math.ceil(hex.length / 2))
    for (let i = 0; i < hex.length;)
        uint8array[i / 2] = Number.parseInt(hex.slice(i, i += 2), 16)
    return Buffer.from(uint8array)
}

export function u8ToHex (u8: Uint8Array) : string {
  // @ts-ignore
  return arrayBuffertohex(Buffer.from(u8))
}

function u8ToB64 (u8: Uint8Array, url?: boolean) : string {
  if (!u8) return ''
  const s = Buffer.from(u8).toString('base64')
  return !url ? s : s.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

export function toPem(key: Buffer, pub?: boolean) : string {
  const exportedAsBase64 = Buffer.from(key).toString('base64')
  return !pub ? `-----BEGIN PRIVATE KEY-----\n${exportedAsBase64}\n-----END PRIVATE KEY-----`
  : `-----BEGIN PUBLIC KEY-----\n${exportedAsBase64}\n-----END PUBLIC KEY-----`
}

export function fromPem(pem: string, pub?: boolean) : Buffer {
  // fetch the part of the PEM string between header and footer
  const pemHeader = pub ? '-----BEGIN PUBLIC KEY-----' : '-----BEGIN PRIVATE KEY-----'
  const pemFooter = pub ? '-----END PUBLIC KEY-----' : '-----END PRIVATE KEY-----'
  const pemContents = pem.substring(pemHeader.length, pem.length - pemFooter.length - 1)
  return Buffer.from(pemContents, 'base64')
}

export function keyToB64(key: Buffer) : string {
  return Buffer.from(key).toString('base64')
}

export function keyFromB64 (key: string) : Buffer{
  return Buffer.from(key, 'base64')
}

export type KeyPair = {
  pub: any,
  priv: any
}

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

Cryptage asymétrique
L'obtention d'une paire de clés publique / privée par ECDH aboutit toujours à 
générer une clé AES-GCM de 256bits, qui elle va gérer le contenu réel et non limité en taille.
- les clés sont plus courtes qu'en RSA (surtout la clé publique).
- la clé publique ne peut être exportée qu'en JWK ce qui malheureusement en fait un texte long.
- on ne peut pas crypter directement un contenu court, qui en RSA fait toujours au moins
256 bytes (ce qui n'est pas si court). En revanche, la clé publique est courte et
on peut crypter des contenus courts en AES pour moins de 256 bytes.

Sign/Verif asymétrique
L'algorithme à employer est RSASSA-PKCS1-v1_5 qui génère une paire de clés.
Pourquoi pas ECDSA (différent d'ailleurs deECDH) ? Parce que la vérification d'une signature par crypto.subtle
ne marche pas en openSSL (donc pas en PHP).
En pratique la clé privée n'est JAMAIS dans un serveur:
- la signature est toujours côté client,
- la vérification est toujours côté serveur.
*/
export class Crypt {
  /* NODE
  cipher ne met PAS le authTag dans le buffer encodé
  MAIS le délivre à part.
  Il est explicitement ajouté à la fin du buffer pour 
  être compatible avec subtle.decrypt qui l'attend là (par défaut et sans choix)
  */
  static syncCrypt (key: Uint8Array, buf: Uint8Array) {
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 })
    const b1 = cipher.update(buf)
    const b2 = cipher.final()
    const authTag = cipher.getAuthTag()
    // console.log('crypt authTag  ', authTag)
    return Buffer.concat([iv, b1, b2, authTag])
    // const bz = Crypt.syncDecrypt(key, bx)
  }
  
  /* NODE
  Le authTag se trouve dans les 16 derniers bytes.
  On l'extrait et on decipher le texte SANS le authTag
  MAIS en lui donnant explicitement par setAuthTag
  */
  static syncDecrypt (key: Uint8Array, buf: Buffer) {
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

  static algs = {
    ecdh: { name: 'ECDH', namedCurve: 'P-521' },
    ecdsa: { name: 'ECDSA', namedCurve: 'P-521' },
    ecdsasv: { name: 'ECDSA', hash: 'SHA-256' },
    rsa: { name: 'RSASSA-PKCS1-v1_5', // 'RSA-OAEP' PAS pour sign / verify
      modulusLength: 2048, 
      publicExponent: new Uint8Array([0x01, 0x00, 0x01]), 
      hash: {name: "SHA-256"} },
    rsasv: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'},
  }
  // static alg = 'rsa'
  static alg = 'ecdsa'

  /* CRYPTO.SUBTLE
  Le authTag est généré sans laisser le choix 
  ET placé d'office DANS les 16 derniers bytes de enc
  */
  static async crypt (cle: Uint8Array, buf: Uint8Array) : Promise<Uint8Array> {
    try {
      const iv = crypto.randomBytes(12)
      const key = await crypto.subtle.importKey('raw', cle, 'AES-GCM', false, ['encrypt'])
      const enc = Buffer.from(await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, tagLength: 128 }, key, buf))
      const x = Buffer.concat([iv, enc])
      // const authTag = buf.subarray(buf.byteLength - 16)
      // console.log('crypt authTag ', Buffer.from(authTag).toString('hex'))
      return x
    } catch (e) {
      return null
    }
  }

  /* CRYPTO.SUBTLE
  On peut retrouver le authTag mis par l'encryption dans les 16 derniers bytes.
  */
  static async decrypt (cle: Uint8Array, buf: Uint8Array) : Promise<Uint8Array> {
    try {
      const key = await crypto.subtle.importKey('raw', cle, 'AES-GCM', false, ['decrypt'])
      const iv = buf.subarray(0, 12)
      const enc = buf.subarray(12)
      // const authTag = Buffer.from(buf.subarray(buf.byteLength - 16))
      // console.log('decrypt authTag ', Buffer.from(authTag).toString('hex'))
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
  static async getKeyPair () : Promise<KeyPair> {
    const p = await crypto.subtle.generateKey(Crypt.algs.ecdh, true, ['deriveKey'])
    const spki = await crypto.subtle.exportKey('spki', p.publicKey)
    const pkcs8 = await crypto.subtle.exportKey('pkcs8', p.privateKey)
    return { pub: spki, priv: pkcs8 }
  }

  static async getSVKeyPair () : Promise<KeyPair> {
    const p = await crypto.subtle.generateKey(Crypt.algs[Crypt.alg], true, ['sign', 'verify'])
    const spki = await crypto.subtle.exportKey('spki', p.publicKey)
    const pkcs8 = await crypto.subtle.exportKey('pkcs8', p.privateKey)
    return { pub: spki, priv: pkcs8 }
  }

  /* Obtention de la clé AES-GCM 256 depuis un couple publique (Emilie), privée (Julie).
  Pour un couple donné, retourne toujours la même clé AES.
  Pour le couple inversé (publique(Julie), privée (Emilie)), 
  retourne aussi la même clé AES (c'est le but !).
  */
  static async getAESKey (pubKey: Buffer, myPrivKey: Buffer): Promise<Uint8Array> {
    const pub = await crypto.subtle.importKey('spki', pubKey, Crypt.algs.ecdh, true, [])
    const priv = await crypto.subtle.importKey('pkcs8', myPrivKey, Crypt.algs.ecdh, true, ['deriveKey'])
    const k = await crypto.subtle.deriveKey(
      { name: 'ECDH', public: pub }, priv, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
    )
    return new Uint8Array(await crypto.subtle.exportKey('raw', k))
  }

  static async sign (privKey: Buffer, data: Uint8Array) : Promise<Uint8Array> {
    const priv = await crypto.subtle.importKey('pkcs8', privKey, Crypt.algs[Crypt.alg], false, ['sign'])
    const sign = await crypto.subtle.sign(Crypt.algs[Crypt.alg + 'sv'], priv, data as BufferSource)
    return new Uint8Array(sign)
  }

  static signToAsn1 (sign: Uint8Array) : Uint8Array {
    const x1 = u8ToHex(sign)
    // const x2 = rsa.KJUR.crypto.ECDSA.concatSigToASN1Sig(x1)
    const x2 = KJUR.crypto.ECDSA.concatSigToASN1Sig(x1)
    return new Uint8Array(hexToArrayBuffer(x2))
  }

  static signFromAsn1 (sign: Uint8Array) : Uint8Array {
    const x1 = u8ToHex(sign)
    // const x2 = rsa.KJUR.crypto.ECDSA.asn1SigToConcatSig(x1)
    const x2 = KJUR.crypto.ECDSA.asn1SigToConcatSig(x1)
    return new Uint8Array(hexToArrayBuffer(x2))
  }

  static async verify (pubKey: Buffer, signature: Uint8Array, data: Uint8Array) : Promise<boolean> {
    const pub = await crypto.subtle.importKey('spki', pubKey, Crypt.algs[Crypt.alg], true, ['verify'])
    return await crypto.subtle.verify(Crypt.algs[Crypt.alg + 'sv'], pub, signature as BufferSource, data as BufferSource)
  }

  /* Hash PBKFD2 d'une "pass phrase" en deux morceaux (équivelent à login / password).
  Le "login" sert à générer le salt qui est utilisé pour hasher l'ensemble s1 + s2.
  Deux versins: une async universelle et une sync seulement sous node.
  */
static async strongHash (s: string | Uint8Array, pad?: boolean, bin?: boolean) 
  : Promise<string | Uint8Array> {
    let x: Uint8Array = typeof s === 'string' ? encoder.encode(s) : s as Uint8Array
    const l = 32 - x.length
    let ex: Uint8Array
    if (!pad || l <= 0) ex = x
    else {
      const p = new Uint8Array(l)
      p.fill(35, 0, l) // 35 : ASCII de #
      // ex = concat([x, p])
      ex = Buffer.concat([x, p])
    }
    // const h1 = new Uint8Array(sha256.arrayBuffer(ex))
    const h1 = new Uint8Array(await crypto.subtle.digest("SHA-256", ex as BufferSource))
    const salt = h1.subarray(0, 16)
    const p = await crypto.subtle.importKey('raw', ex as BufferSource, 'PBKDF2', false, ['deriveKey'])
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt : salt, iterations: 20000, hash: 'SHA-256' },
      p,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    )
    const res = new Uint8Array(await crypto.subtle.exportKey('raw', key))
    return bin ? res : u8ToB64(res, true)
  }
  /*
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
    return u8ToB64(res, true)
  }
  */

  /* Version sync avec node */
  static syncStrongHash (s1: string, s2: string, sep?: string) : string {
    let s = sep || ''
    if (s) {
      s = sep
      const l = (s1 ? s1.length : 0) + (s2 ? s2.length : 0)
      while (l + s.length < 40) s += sep
    }
    const x = (s1 || '') + s + (s2 || '')
    const h1 = crypto.createHash('sha256').update(Buffer.from(x, 'utf-8')).digest()
    const salt = h1.subarray(0, 16)
    const k = crypto.pbkdf2Sync(Buffer.from(x, 'utf-8'), salt, 20000, 32, 'sha256')
    return u8ToB64(k, true)
  }

  static sha (x: any) : string {
    return crypto.createHash('sha256').update(Buffer.from(x)).digest().toString('base64url')
  }

  static shaS (x: any) : string {
    return crypto.createHash('sha256').update(Buffer.from(x)).digest().subarray(3, 18).toString('base64url')
  }

  static shaInt (x: any) : number {
    const u8 = new Uint8Array(crypto.createHash('sha256').update(Buffer.from(x)).digest())
    let r = 0; for (let i = 3, j = 0; j < 6; i++, j++) r += (p2[j] * u8[i])
    return r
  }
}

export async function testSH () {
  const x = 'toto est tres tres beau'
  console.log(Crypt.sha(x))
  console.log(Crypt.shaS(x))
  console.log(Crypt.shaInt(x))

  console.log(await Crypt.strongHash(x))
  console.log(await Crypt.strongHash(encoder.encode(x)))
  console.log(await Crypt.strongHash(x, true))
  console.log(await Crypt.strongHash(encoder.encode(x), true))
  console.log(Crypt.sha(x))
  console.log(Crypt.sha(encoder.encode(x)))
  console.log(Crypt.shaS(x))
  console.log(Crypt.shaInt(x))

  /*
  const t = Date.now()
  for (let i= 0; i< 100000; i++) await Crypt.sha(x)
  const n = Date.now() - t
  console.log('sha : ', n)
  */
}

export async function testECDH () {
  const x = new TextEncoder().encode('toto est tres tres beau')
  const xx = new TextEncoder().encode('toto est tres tres beaux')

  // Dans app
  const appPair = await Crypt.getKeyPair()
  const appPub = toPem(appPair.pub, true)
  const appPriv = toPem(appPair.priv)
  console.log('ECDH: APP crypt/decrypt')
  console.log(appPub)
  console.log(appPriv)

  const appSVPair = await Crypt.getSVKeyPair()
  const appSVPub = toPem(appSVPair.pub, true)
  const appSVPriv = toPem(appSVPair.priv)
  console.log('RSA: SRV sign/verify')
  console.log(appSVPub)
  console.log(appSVPriv)
  const sign = await Crypt.sign(appSVPair.priv, x)
  const signAsn1 = Crypt.signToAsn1(sign)
  const sign2 = Crypt.signFromAsn1(signAsn1)
  const h1 = u8ToHex(sign)
  const h2 = u8ToHex(signAsn1)
  console.log('---- EC / ASN1 -------')
  console.log(h1)
  console.log(h2)
  console.log('----------------------')
  const h3 = u8ToHex(sign2)
  if (h1 === h3)
    console.log('trop cool !!!')
  else console.log('TOO BAD !!!')
  
  // Dans srv
  const verif1 = await Crypt.verify(fromPem(appSVPub, true), sign, x)
  console.log('verif1 = ', verif1)
  const verif2 = await Crypt.verify(fromPem(appSVPub, true), sign, xx)
  console.log('verif2 = ', verif2)

  const srvPair = await Crypt.getKeyPair()
  const srvPub = toPem(srvPair.pub, true)
  const srvPriv = toPem(srvPair.priv)
  console.log('ECDH: SRV crypt/decrypt')
  console.log(srvPub)
  console.log(srvPriv)

  const aesSrv = await Crypt.getAESKey(fromPem(appPub, true), srvPair.priv)
  console.log('aesSrv: ', u8ToB64(aesSrv))
  const x1 = await Crypt.crypt(aesSrv, x)

  // Dans app
  const aesApp = await Crypt.getAESKey(fromPem(srvPub, true), appPair.priv)
  console.log('aesApp: ', u8ToB64(aesApp))
  const x3 = await Crypt.decrypt(aesApp, x1)
  const x2 = decoder.decode(x3)
  console.log(x2)
}
