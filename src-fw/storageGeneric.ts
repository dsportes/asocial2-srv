import { encode, decode } from '@msgpack/msgpack'

/* Classe abstraite : implémentée par filesystem, s3, googlecloud */
export class StorageGeneric { // Classe abstraite

  public credentials: Object
  public srvUrl: string

  constructor (credentials: Object) {
    this.credentials = credentials
  }

  encode3 (id1: string, id2: string, id3: string) : string {
    const b = Buffer.from(encode([id1, id2, id3])).toString('base64')
    return b.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  }

  decode3 (b64: string) : any { // [id1, id2, id3]
    const x = Buffer.from(b64, 'base64')
    return decode(x)
  }

  storageUrlGenerique (id1: string, id2: string, id3: string) {
    return this.srvUrl ? this.srvUrl + '/file/' + this.encode3(id1, id2, id3) : ''
  }
}
