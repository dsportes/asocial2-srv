import { AppExc } from './exception'
import { config } from '../src-app/app'
import { Operation } from './operation'

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
