import { AppExc, Operation, Util } from './index'
import { encode, decode } from '@msgpack/msgpack'

export class DbConnector {

  public key: Buffer
  public credentials: any
  public factory: Function

  constructor (credentials: Object, cryptKey: string) {
    if (!credentials)
      throw new AppExc(1022, 'DbConnector : credentials not found', null)
    if (!cryptKey) 
      throw new AppExc(1024, 'DbConnector : crypt key ', null)
    this.key = Buffer.from(cryptKey, 'base64')
    this.credentials = credentials
  }

  async getConnexion (op: Operation) {
    const cnx = this.factory(this)
    await cnx.connect()
    op.db = cnx
    return cnx
  }
}

export class DbProvider {
  public connector: DbConnector
  public op: Operation
  public key: Buffer

  constructor (connector: DbConnector, op: Operation) {
    this.connector = connector
    this.key = this.connector.key
    this.op = op
  }

  async ping () : Promise<[number, string]> { return [2, '???']}
}
