import { AppExc, BaseConfig } from './index'
import { DbGeneric } from './dbConnector'
import { StGeneric } from './stConnector'
import { Util } from './util'

export class Operation {
  private static factories = new Map<string, Function>()

  public static config: BaseConfig

  static nbOf () { 
    return Operation.factories.size 
  }

  static fake () { return new Operation(true) }

  static new (opName: string) {
    const f = Operation.factories.get(opName)
    return f ? f() : null
  }

  static register (opName: string, factory: Function) {
    Operation.factories.set(opName, factory)
  }

  public fake: boolean

  public opName: string
  public org: string
  public result: any
  public args: any
  public params: any
  public now: number
  public today: number
  public db: DbGeneric
  public storage: StGeneric

  constructor (fake?: boolean) { this.fake = fake || false }

  get config (): BaseConfig { return Operation.config }

  init () {
  }

  async run (): Promise<void> {
  }

  type (par: string, req: boolean) : [boolean, any, string] { // absent, value, type
    if (par === undefined) throw new AppExc(8001, 'unknown argument', null, ['?'])
    const v = this.args[par]
    if (v === undefined) {
      if (req) throw new AppExc(3001, 'argument absent', null, [par])
      return [false, null, '']
    }
    return [true, v, typeof v]
  }

  invalid (par: string) { throw new AppExc(3001, 'invalid argument', this, [par])}

  stringValue (par: string, req: boolean, minlg?: number, maxlg?: number) : string {
    const [present, value, type] = this.type(par, req)
    if (!present && !req) return ''
    if (present && type !== 'string'
      || (minlg !== undefined && value.length < minlg) 
      || (maxlg !== undefined && value.length > maxlg)) {
        throw new AppExc(1010, 'invalid argument', this, [par])
      }
    return value
  }

  intValue (par: string, req: boolean, min?: number, max?: number) : number {
    const [present, value, type] = this.type(par, req)
    if (!present && !req) return 0
    if (type !== 'number' || !Number.isInteger(value)
      || (min !== undefined && value < min) 
      || (max !== undefined && value > max)) {
        throw new AppExc(1010, 'invalid argument', this, [par])
      }
    return value
  }

  boolValue (par: string, req: boolean) : boolean {
    const [present, value, type] = this.type(par, req)
    if (!present && !req) return false
    if (type !== 'boolean')
      throw new AppExc(1010, 'invalid argument', this, [par])
    return value
  }

  orgValue (req: boolean) : string {
    return this.stringValue('org', req, 4, 16)
  }

}

// import { initializeApp } from 'firebase-admin/app'
// const app = initializeApp()

// var admin = require("firebase-admin");

/*
import admin from 'firebase-admin'
import { getMessaging } from 'firebase/messaging'

const serviceAccount = Operation.config.keys['adminSDK-service-account']
// var serviceAccount = require("path/to/serviceAccountKey.json");

const app = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
})
const messaging = getMessaging(app)
*/