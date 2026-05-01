import { AppExc, AbstractOperation } from './index'
import { IDbGeneric } from './iDbGeneric'

export class DbConnector {

  public key: Buffer
  public credentials: any
  public factory: Function

  constructor (credentials: Object, cryptKey: string) {
    if (!credentials)
      throw new AppExc(110, 'DbConnector_credentials_not_found', null)
    if (!cryptKey) 
      throw new AppExc(111, 'DbConnector_missing_crypt_key', null)
    this.key = Buffer.from(cryptKey, 'base64')
    this.credentials = credentials
  }

  async getConnexion (op: AbstractOperation, org: string, cryptKey?: string) {
    const cnx = this.factory(this, op, cryptKey) as IDbGeneric
    cnx.org = org
    await cnx.connect()
    op.db = cnx
    return cnx
  }
}

export class DbConnexion {
  public connector: DbConnector
  public op: AbstractOperation
  public key: Buffer
  public org: string
  public transaction: any

  constructor (connector: DbConnector, op: AbstractOperation, cryptKey?: string) {
    this.connector = connector
    this.key = !cryptKey ? this.connector.key : Buffer.from(cryptKey, 'base64')
    this.op = op
  }

}
