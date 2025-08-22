import { AppExc, Operation, Util } from './index'
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

  async getConnexion (op: Operation) {
    const cnx = this.factory(this)
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

  constructor (connector: DbConnector, op: Operation) {
    this.connector = connector
    this.key = this.connector.key
    this.op = op
    this.docSchema = Operation.config.docSchema
  }

  // Retourne le sha16 d'un array de strings
  h16 (k : string[]) : string { return Crypt.sha16(encode(k)) }

  // Construit un "row" pour DB depuis un "data" de document
  dataToRow (data: Object) {
    const row : Object = { }
    const cl = data['_class']
    const o = cl === 'Org'
    const t = cl !== 'Task'
    
    // propriétés v z
    if (!t) {
      row['v'] = data['_v']
      const z = data['_v']
      if (z !== undefined) row['z'] = z
    }
    const dt = this.docSchema.getDoc(cl)

    // propriétés k0, k1 ...
    if (cl !== 'Hdr') {
      row['k0'] = '1'
    } else {
      dt.keys.forEach((k, i) => {
        if (i === 0 && (o || t)) {
          if (o) row['k0'] = data['_org']
          else {
            const x = [data['process']]
            data['pk'].forEach((v : string) => { x.push(v) })
            row['k0'] = this.h16(x)
          }
        } else {
          const x = []; k.forEach(p => { x.push(data[p]) })
          row['k' + i] = this.h16(x)
        }
      })
    }

    // propriétés i0, i1 ...
    dt.indexes.forEach(([np, type, b], i) => {
      let val = data[np]
      if (type === idxType.HASH) val = this.h16(val)
      row['i' + i] = val
    })

    row['data'] = Crypt.syncCrypt(this.key, encode(data))
    return row
  }

  // Retourne le "data", désérialisé ou non, depuis un "row"
  rowToData (row: Object, deser: boolean) {
    const ds = Crypt.syncDecrypt(this.key, row['data'])
    return deser ? ds : decode(ds)
  }

  async ping () : Promise<[number, string]> { return [2, '???']}
}
