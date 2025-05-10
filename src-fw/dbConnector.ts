import { AppExc, Operation, Util } from './index'
import { encode, decode } from '@msgpack/msgpack'

export interface DbGeneric {
  ping () : Promise<[number, string]> 
}

export class DbConnector {
  private static cache = new Map<string, DbConnector>()

  public static get (code) { return DbConnector.cache.get(code) }

  public code: string
  public key: Buffer
  public cryptIds: boolean
  public credentials: any
  public factory: Function

  constructor (code:string, cryptIds: boolean, credentials: string) {
    if (!credentials)
      throw new AppExc(1022, 'config.dbConfigs credentials not found', null, [code])
    const cred = Operation.config.keys[credentials]
    if (!cred)
      throw new AppExc(1023, 'keys credentials not found', null, [code])
    this.credentials = cred
    this.cryptIds = cryptIds
    DbConnector.cache.set(code, this)
  }

  async getConnexion (site: string, op: Operation) {
    let key = null
    if (this.cryptIds) {
      const k = Operation.config.keys['sites'][site]
      if (!k) throw new AppExc(1024, 'keys.site not found', null, [site])
      key = Buffer.from(k, 'base64')
    }
    const cnx = this.factory(this, key)
    await cnx.connect()
    op.db = cnx
    return cnx
  }
}

export class DbProvider {
  public opts: DbConnector
  public op: Operation
  public key: Buffer

  constructor (opts: DbConnector, op: Operation, key: Buffer) {
    this.opts = opts
    this.key = key
    this.op = op
  }

  async ping () : Promise<[number, string]> { return [2, '???']}
}
