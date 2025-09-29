import { AppExc } from './index'
import { Operation } from './operation'
import { DocType } from './doctypes'
import { encode, decode } from '@msgpack/msgpack'
import { Crypt } from './crypt'
import { IDbGeneric } from './iDbGeneric'

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

  async getConnexion (op: Operation, org?: string, cryptKey?: string) {
    const cnx = this.factory(this, op, cryptKey) as IDbGeneric
    cnx.org = org || op.org 
    await cnx.connect()
    op.db = cnx
    return cnx
  }
}

export class DbConnexion {
  public connector: DbConnector
  public op: Operation
  public key: Buffer
  public org: string
  public transaction: any

  constructor (connector: DbConnector, op: Operation, cryptKey?: string) {
    this.connector = connector
    this.key = !cryptKey ? this.connector.key : Buffer.from(cryptKey, 'base64')
    this.op = op
  }

}
