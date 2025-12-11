import { Operation } from './operation'
import { AppExc } from './index'
import { config } from './config'
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
      await op.disconnect()
      return op.result
    } catch (e) {
      await op.disconnect()
      throw(e)
    }
  }

  constructor () { super() }

  async doTheJob () : Promise<void> {  }
}

/* Creation d'un nouveau Safe
*/
class $CreateSafe extends SafeOperation {
  constructor () { super() }

  async doTheJob () : Promise<void> { 

  }
}
SafeOperation.register('$CreateSafe', () => { return new $CreateSafe()})
