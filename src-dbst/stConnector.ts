import { AppExc, Operation, Util } from '../src-fw/index'
import { encode, decode } from '@msgpack/msgpack'

export interface StGeneric {
  decode3 (b64: string) : any

  ping () : Promise<[number, string]> 
  getUrl (id1: string, id2: string, id3: string): string
  putUrl (id1: string, id2: string, id3: string): string
  getFile (id1: string, id2: string, id3:string) : Promise<Buffer>
  putFile (id1: string, id2: string, id3:string, data: Buffer) : Promise<void>
  delFiles (id1: string, id2: string, lidf: string[]) : Promise<void>
  delId (id1: string, id2: string) : Promise<void>
  delOrg (id1: string) : Promise<void>
  listFiles (id1: string, id2: string) : Promise<string[]>
  listIds (id1: string) : Promise<string[]>
}

export class StConnector { // Classe abstraite
  static cache = new Map<string, StConnector>()

  static getStorage (code: string, site: string): StGeneric {
    const c = StConnector.cache.get(code)
    if (!c) throw new AppExc(1024, 'Storage connector not found', null, [code])
    let siteKey = null
    if (c.cryptIds) {
      const k = Operation.config.keys['sites'][site]
      if (!k) throw new AppExc(1024, 'keys.site not found', null, [site])
      siteKey = Buffer.from(k, 'base64')
    }
    return c.factory(c, siteKey)
  }

  public code: string
  public bucket: string
  public cryptIds: boolean
  public credentials: any
  public srvKey: Buffer
  public srvUrl: string
  public factory: Function

  constructor (code: string, bucket: string, cryptIds: boolean, credentials: string) {
    this.code = code
    this.bucket = bucket
    this.cryptIds = cryptIds
    const cred = Operation.config.keys[credentials]
    if (!cred)
      throw new AppExc(1023, 'keys credentials not found', null, [code])
    this.credentials = cred
    this.srvKey = Buffer.from(Operation.config.SRVKEY, 'base64')
    StConnector.cache.set(code, this)
  }
}

export class StorageGeneric {
  public siteKey: Buffer
  private options: StConnector

  constructor (options: StConnector, siteKey: Buffer) {
    this.options = options
    this.siteKey = siteKey
  }

  cryptId (id: string) {
    return this.siteKey ? Util.cryptId(this.siteKey, id) : id
  }

  decryptId (id: string) {
    return this.siteKey ? Util.decryptId(this.siteKey, id) : id
  }

  encode3 (id1: string, id2: string, id3: string) : string {
    const b = Buffer.from(encode([id1, id2, id3]))
    const x = Util.crypt(this.options.srvKey, b).toString('base64')
    const y = x.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
    return y
  }

  decode3 (b64: string) : any { // [id1, id2, id3]
    const x = Util.decrypt(this.options.srvKey, Buffer.from(b64, 'base64'))
    return decode(x)
  }

  storageUrlGenerique (id1: string, id2: string, id3: string) {
    return this.options.srvUrl ? this.options.srvUrl + '/file/' + this.encode3(id1, id2, id3) : ''
  }
}

