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

  async getSafePR (sh0: Uint8Array, sh1: Uint8Array)
    : Promise<[status: number, safe: Safe, byP: boolean]> { 
    let byP = true
    const s0 = Util.u8ToB64(sh0, true)
    const hhp1 = Crypt.shaS(sh1)
    let safe: Safe = (await this.db.getSafe(s0, IDP0R0.P0)) as Safe
    if (!safe) {
      byP = false
      safe = (await this.db.getSafe(s0, IDP0R0.R0)) as Safe
      if (!safe) return [1, null, false]
    }
    if (safe.hhp1 !== hhp1) return [2, null, false]
    return [0, safe, byP]
  }
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
    if (ret !== 0) await Util.sleep(3000)
    this.setRes('status', ret)
  }
}
SafeOperation.register('$CreateSafe', () => { return new $CreateSafe()})

/* Mise à jour des codes d'accès d'un Safe
*/
class $UpdCodesSafe extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> { 
    const safeNew = this.args['safe']
    const safe: Safe = (await this.db.getSafe(safeNew.id)) as Safe
    if (!safe) {
      this.setRes('status', 1)
      await Util.sleep(3000)
      return
    }
    safe.pseudo = safeNew.pseudo
    safe.hp0 = safeNew.hp0
    safe.hr0 = safeNew.hr0
    safe.hhp1 = safeNew.hhp1
    safe.hhr1 = safeNew.hhr1
    safe.Ka = safeNew.Ka
    safe.Kr = safeNew.Kr
    const ret = await this.db.updPRSafe(safe)
    this.setRes('status', ret)
    if (ret !== 0) await Util.sleep(3000)
    else this.setRes('safe', safe)
  }
}
SafeOperation.register('$UpdCodesSafe', () => { return new $UpdCodesSafe()})


/* Ouverture d'un Safe
*/
class $OpenSafeByPR extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> {
    const [status, safe, byP] = await this.getSafePR(this.args['sh0'], this.args['sh1'])
    this.setRes('status', status)
    this.setRes('safe', safe)
    this.setRes('byP', byP)
    if (status !== 0) await Util.sleep(3000)
  }
}
SafeOperation.register('$OpenSafeByPR', () => { return new $OpenSafeByPR()})
