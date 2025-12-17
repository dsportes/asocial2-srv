import { Operation } from './operation'
import { AppExc } from './index'
import { config } from './config'
import { IDP0R0 } from './iDbGeneric'
import { Crypt } from './crypt'
import { Util } from './util'
// import { encode, decode } from '@msgpack/msgpack'

/* Appel direct d'une opération: 
  const result = await SafeOperation.doOp(opName, args)
*/
export class SafeOperation extends Operation {
  static factories = new Map<string, Function>()

  static register (opName: string, factory: Function) {
    SafeOperation.factories.set(opName, factory)
  }

  static async doOp (opName: string, args: Object) : Promise<Object> {
    const f = SafeOperation.factories.get(opName)
    if (!f) throw new AppExc(1002, 'unknown operation', null, [opName])
    const op = f()
    op.opName = opName
    op.args = args
    op.result = { }
    try {
      await config.directoryDB.getConnexion(op)
      await op.doTheJob()
      await op.db.disconnect()
      return op.result
    } catch (e) {
      await op.db.disconnect()
      throw(e)
    }
  }

  constructor () { super() }

  async doTheJob () : Promise<void> {  }
}

export type Safe = {
  id: string // identifiant.
  pseudo: Uint8Array // pseudo / trigramme crypté par la clé K du _safe_.
  hp0: string // index unique, `SH(p0)`.
  hr0: string // index unique, `SH(r0)`.
  hhp1: string // SHA de `SH(p1)`.
  hhr1: string // SHA de `SH(r1)`.
  hhk: string // SHA de `SH(K)`.
  Ka: Uint8Array // clé `K` du safe cryptée par `SH(p0, p1)`.
  Kr: Uint8Array //  clé `K` du safe cryptée par `SH(r0, r1)`.
  devices: Object
  creds: Object
  profiles: Object
}

/* Creation d'un nouveau Safe
*/
class $CreateSafe extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> { 
    const safe = this.args['safe']
    const ret = await this.db.newSafe(safe)
    this.setRes('status', ret)
  }
}
SafeOperation.register('$CreateSafe', () => { return new $CreateSafe()})

/* Ouverture d'un Safe
*/
class $OpenSafeByP0 extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> { 
    const sh0 = this.args['sh0']
    const hhp1 = Crypt.shaS(this.args['sh1'])
    const safe: Safe = (await this.db.getSafe(Util.u8ToB64(sh0, true), IDP0R0.P0)) as Safe
    if (!safe) this.setRes('status', 1)
    else if (safe.hhp1 !== hhp1) this.setRes('status', 2)
    else {
      this.setRes('status', 0)
      this.setRes('safe', safe)
    }
  }
}
SafeOperation.register('$OpenSafeByP0', () => { return new $OpenSafeByP0()})
