import { AppExc } from './exception'
import { config } from '../src-app/app'
import { Operation } from './operation'

export const dbProviders = new Map<string, DbProvider>()

export class DbProvider {
  public code: string
  public site: string
  public type: string
  public key: Buffer
  public crypt: boolean
  public credentials: any
  public fnConnexion: Function

  constructor (code: string, credKey: string, getConnexion: Function) {
    this.code = code
    this.credentials = config.keys[credKey]
    this.site = config.site
    const s = config.keys['sites'][this.site]
    this.key = Buffer.from(s.k, 'base64')
    this.crypt = s.dbcrypt
    this.fnConnexion = getConnexion
    dbProviders.set(code, this)
  }

}

export class Connexion {
  public site: string
  public op: Operation
  public key: Buffer
  public crypt: boolean
  public credentials: any

  constructor (provider: DbProvider, op: Operation, site?: string) {
    if (site && site !== provider.site) {
      const s = config.keys['sites'][site]
      this.site = site
      this.key = Buffer.from(s.k, 'base64')
      this.crypt = s.dbcrypt
    } else {
      this.site = provider.site
      this.key = provider.key
      this.crypt = provider.crypt
      this.credentials = provider.credentials
    }
    this.op = op
  }
}

export async function getConnexion (op: Operation, code?: string, site?: string) {
  const provider = dbProviders.get(code || config.database)
  const fn = provider.fnConnexion
  await fn(provider, op, site)
}