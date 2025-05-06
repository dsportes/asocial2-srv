import { config, AppExc, Operation, Util } from '../src-fw/index'
import { encode, decode } from '@msgpack/msgpack'

export interface DbGeneric {
  ping () : Promise<[number, string]> 
}

export class DbOptions {
  public code: string
  public site: string
  public key: Buffer
  public cfg: any // sa ligne dans config
  public credentials: any

  constructor (code:string, site:string) {
    this.cfg = config.dbOptions[code]
    if (!this.cfg)
      throw new AppExc(1020, 'config.dbOptions not found', null, [code])
    this.code = code

    if (!this.cfg.credentials)
      throw new AppExc(1022, 'config.stOptions credentials not found', null, [code])
    const cred = config.keys[this.cfg.credentials]
    if (!cred)
      throw new AppExc(1023, 'keys credentials not found', null, [code, this.cfg.credentials])
    this.credentials = cred

    const k = config.keys['sites'][site]
    if (!k)
      throw new AppExc(1021, 'keys.sites not found', null, [site])
    this.site = site
    this.key = this.cfg.cryptIds ? Buffer.from(k, 'base64') : null
  }
}

export class DbConnexion {
  public opts: DbOptions
  public op: Operation

  constructor (opts: DbOptions, op: Operation) {
    this.opts = opts
    this.op = op
  }

  get key () { return this.opts.key }
}

/****************************************************************/
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

export class StOptions {
  public code: string
  public site: string
  public key: Buffer
  public bucket: string
  public credentials: any
  public cfg: any // sa ligne dans config

  constructor (code:string, site:string) {
    this.cfg = config.stOptions[code]
    if (!this.cfg)
      throw new AppExc(1020, 'config.stOptions not found', null, [code])
    this.code = code

    if (!this.cfg.bucket)
      throw new AppExc(1020, 'config.stOptions bucket not found', null, [code])
    this.bucket = this.cfg.bucket

    if (!this.cfg.credentials)
      throw new AppExc(1022, 'config.stOptions credentials not found', null, [code])
    const cred = config.keys[this.cfg.credentials]
    if (!cred)
      throw new AppExc(1023, 'keys credentials not found', null, [this.cfg.credentials])
    this.credentials = cred

    const k = config.keys['sites'][site]
    if (!k)
      throw new AppExc(1024, 'keys.site not found', null, [site])
    this.site = site
    this.key = this.cfg.cryptIds ? Buffer.from(k, 'base64') : null
  }
}

const optionsCache = new Map<string, StOptions>()

export function getOptions (code: string, site: string) : StOptions{
  let opts = optionsCache.get(code + '/' + site)
  if (!opts) {
    opts = new StOptions(code, site)
    optionsCache.set(code + '/' + site, opts)
  }
  return opts
}

export class StorageGeneric {
  public key: Buffer
  private srvkey: Buffer
  private srvUrl: string

  constructor (options: StOptions) {
    this.key = options.key
    this.srvkey = Buffer.from(config.SRVKEY, 'base64')
    this.srvUrl = config.srvUrl || 'http://localhost:8080'
  }

  cryptId (id: string) {
    return this.key ? Util.cryptId(this.key, id) : id
  }

  decryptId (id: string) {
    return this.key ? Util.decryptId(this.key, id) : id
  }

  encode3 (id1: string, id2: string, id3: string) : string {
    const b = Buffer.from(encode([id1, id2, id3]))
    const x = Util.crypt(this.srvkey, b).toString('base64')
    const y = x.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
    return y
  }

  decode3 (b64: string) : any { // [id1, id2, id3]
    const x = Util.decrypt(this.srvkey, Buffer.from(b64, 'base64'))
    return decode(x)
  }

  storageUrlGenerique (id1: string, id2: string, id3: string) {
    return this.srvUrl + '/file/' + this.encode3(id1, id2, id3)
  }
}

