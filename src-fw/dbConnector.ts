import { AppExc } from './index'
import { Operation } from '../src-fw/operation'
import { DocSchema, idxType } from './doctypes'
import { encode, decode } from '@msgpack/msgpack'
import { Crypt } from './crypt'

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

  async getConnexion (op: Operation, cryptKey?: string) {
    const cnx = this.factory(this, op, cryptKey)
    await cnx.connect()
    op.db = cnx
    return cnx
  }
}

export class DbConnexion {
  public connector: DbConnector
  public op: Operation
  public key: Buffer
  public docSchema : DocSchema
  public transaction: any

  constructor (connector: DbConnector, op: Operation, cryptKey?: string) {
    this.connector = connector
    this.key = !cryptKey ? this.connector.key : Buffer.from(cryptKey, 'base64')
    this.op = op
    this.docSchema = Operation.config.docSchema
  }

  // Retourne le sha16 d'un array de strings
  h16 (k : string[]) : string { return Crypt.sha16(encode(k)) }

  k0FromData (cl: string, keys: string[], data: Object) : string {
    if (cl === 'Hdr') return '1'
    if (cl === 'Org') return data['org']
    const x = []
    if (cl === 'Task') {
      x.push(data['process'])
      data['pk'].forEach((v : string) => { x.push(v) })
    } else keys.forEach(p => { x.push(data[p]) })
    return this.h16(x)
  }

  // Construit un "row" pour DB depuis un "data" de document
  dataToRow (data: Object) {
    const row : Object = { }
    const cl = data['clazz']
    const o = cl === 'Org'
    const t = cl !== 'Task'
    
    // propriétés v z
    if (!t) {
      row['v'] = data['v']
      const z = data['z']
      if (z !== undefined) row['z'] = z
    }
    const dt = this.docSchema.getDoc(cl)
    // k0
    row['k0'] = this.k0FromData(cl, dt.keys[0], data)

    // propriétés k1 ...
    for(let i = 1; i < dt.keys.length; i++) {
      const lk = dt.keys[i]
      const x = []; lk.forEach(p => { x.push(data[p]) })
      row['k' + i] = this.h16(x)
    }

    // propriétés i0, i1 ...
    dt.indexes.forEach(([np, type, b], i) => {
      const val = data[np]
      row['i' + i] = type === idxType.HASH ? this.h16(val) : val
    })

    row['data'] = Crypt.syncCrypt(this.key, encode(data))
    return row
  }

  // Construit un "row" pour DB depuis un "data" ZOMBI de document
  dataToZombiRow (data: Object) {
    const row : Object = { }
    const cl = data['clazz']
    const t = cl !== 'Task'
    const v = data['v']
    const z = data['z']
    
    // propriétés v z
    if (!t) {
      row['v'] = v
      row['z'] = z
    }
    const dt = this.docSchema.getDoc(cl)
    // k0
    row['k0'] = this.k0FromData(cl, dt.keys[0], data)

    // Construction du data réduit : cl v z (process pk) ou (props de k0)
    const d = { clazz: cl }
    if (!t) {
      d['process'] = data['process']
      d['pk'] = data['pk']
    } else {
      d['v'] = v
      d['z'] = z
      dt.keys[0].forEach(p => { d[p] = (data[p]) })
    }

    row['data'] = Crypt.syncCrypt(this.key, encode(d))
    return row
  }

  // Retourne le "data", désérialisé depuis un "row"
  rowToDataObj (row: Object) : Object {
    const ds = Crypt.syncDecrypt(this.key, row['data'])
    return decode(ds)
  }

  // Retourne le "data", décrypté mais sérialisé depuis un "row"
  rowToDataBin (row: Object) {
    return Crypt.syncDecrypt(this.key, row['data'])
  }

  

  async ping () : Promise<[number, string]> { return [2, '???']}
}
