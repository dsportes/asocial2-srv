import { env } from 'process'

import { AppExc } from './exception'
import { config } from '../src-app/app'
import { Operation } from './operation'
import { cryptId, decryptId } from './util'

export class StOptions {
  public code: string
  public site: string
  public key: Buffer
  public bucket: string
  public credentials: any
  public url: string
  public cfg: any // sa ligne dans config
  constructor (code:string, site:string) {
    this.cfg = config.stOptions[code]
    if (!this.cfg)
      throw new AppExc(1020, 'config.stOptions not found', null, [code])
    this.code = code

    if (!this.cfg.bucket)
      throw new AppExc(1020, 'config.stOptions bucket not found', null, [code])
    this.bucket = this.cfg.bucket

    if (code.startsWith('fs') && !this.cfg.url)
      throw new AppExc(1021, 'config.stOptions url not found', null, [code])
    this.url = this.cfg.url

    if (!this.cfg.credentials)
      throw new AppExc(1022, 'config.stOptions credentials not found', null, [code])
    const cred = config.keys['this.cfg.credentials']
    if (!cred)
      throw new AppExc(1023, 'credentials not found', null, [this.cfg.credentials])
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

export class StConnexion {
  public opts: StOptions
  public op: Operation

  constructor (opts: StOptions, op: Operation) {
    this.opts = opts
    this.op = op
  }

  get key () { return this.opts.key }
}

export class stConnexionGeneric {
  public key: Buffer
  public srvkey: Buffer
  constructor (options: StOptions) {
    this.key = options.key
    this.srvkey = Buffer.from(env.SRVKEY)
  }

  cryptId (id: string) {
    return this.key ? cryptId(this.key, id) : id
  }

  decryptId (id: string) {
    return this.key ? decryptId(this.key, id) : id
  }
}

