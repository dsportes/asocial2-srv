import { AppExc } from './exception'

export const factories = new Map<string, Function>()

export function newOperation (opName: string) {
  const f = factories.get(opName)
  if (f) {
    const op = f()
    op.opName = opName
    return op
  } 
  return null
}

export class Operation {
  public opName: string
  public org: string
  public result: any
  public args: any
  public params: any
  public today: number

  constructor () { }

  init () {
  }

  async run (): Promise<void> {
  }

  type (par: string, req: boolean) : [boolean, any, string] { // absent, value, type
    if (par === undefined) throw new AppExc(this, 8001, 'unknown argument', ['?'])
    const v = this.args[par]
    if (v === undefined) {
      if (req) throw new AppExc(this, 3001, 'argument absent', [par])
      return [false, null, '']
    }
    return [true, v, typeof v]
  }

  invalid (par: string) { throw new AppExc(this, 3001, 'invalid argument', [par])}

  stringValue (par: string, req: boolean, minlg?: number, maxlg?: number) : string {
    const [present, value, type] = this.type(par, req)
    if (!present && !req) return ''
    if (present && type !== 'string'
      || (minlg !== undefined && value.length < minlg) 
      || (maxlg !== undefined && value.length > maxlg)) {
        throw new AppExc(this, 1010, 'invalid argument', [par])
      }
    return value
  }

  intValue (par: string, req: boolean, min?: number, max?: number) : number {
    const [present, value, type] = this.type(par, req)
    if (!present && !req) return 0
    if (type !== 'number' || !Number.isInteger(value)
      || (min !== undefined && value < min) 
      || (max !== undefined && value > max)) {
        throw new AppExc(this, 1010, 'invalid argument', [par])
      }
    return value
  }

  orgValue (req: boolean) : string {
    return this.stringValue('org', req, 4, 16)
  }

}

export async function getFile (_args) : Promise<Uint8Array<ArrayBufferLike>> {
  return null
}

export async function putFile (_args, _bytes) : Promise<void> {
}