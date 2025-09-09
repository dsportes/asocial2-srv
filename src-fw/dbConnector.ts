import { AppExc } from './index'
import { Operation } from './operation'
import { DocPattern } from './document'
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

  async getConnexion (op: Operation, cryptKey?: string) {
    const cnx = this.factory(this, op, cryptKey) as IDbGeneric
    await cnx.connect()
    op.db = cnx
    return cnx
  }
}

export class DbConnexion {
  public connector: DbConnector
  public op: Operation
  public key: Buffer
  public transaction: any

  constructor (connector: DbConnector, op: Operation, cryptKey?: string) {
    this.connector = connector
    this.key = !cryptKey ? this.connector.key : Buffer.from(cryptKey, 'base64')
    this.op = op
  }

  // Retourne le sha16 d'un array de strings
  h16 (k : string[]) : string { return Crypt.sha16(encode(k)) }

  /* Valeur de la clé ou de l'index 'pname' : k0, k1 ... i0, i1 ... dans le 'data'
  selon la liste des propriétés composant cette clé / index et son type
  */
  kiFromPattern (pname: string, data: DocPattern) {
    /*
    if (pname === 'k0') {
      if (data.clazz === 'Hdr') return '1'
      if (data.clazz === 'Org') return data.org
    }
    const dt = DocType.get(data.clazz)
    const idx = parseInt(pname.charAt(1))
    const isK = pname.charAt(0) === 'k'
    if (isK) {
      const x : any[] = []
      if (idx < dt.keys.length)
        dt.keys[idx].forEach(p => { x.push(data[p] || '') })
      return this.h16(x)
    }
    if (idx < dt.keys.length) {
      const [np, type, b] = dt.indexes[idx]
      const val = data[np]
      return type === idxType.HASH ? this.h16(val) : val
    }
      */
    return ''
  }

  idFromPattern (data: DocPattern) : string[]{
    /*
    if (data.clazz === 'Hdr') return ['hdr']
    if (data.clazz === 'Org') return ['Org', data.org]
    const dt = DocType.get(data.clazz)
    const x : string[] = ['data.clazz', data.org]
    dt.keys[0].forEach(p => { x.push(data[p] || '') })
    return x
    */
    return []
  }

  _dtRow (data: Object) : [DocType, Object] {
    const cl = data['clazz']
    const dt = DocType.get(cl)
    const v = data['v']
    const z = data['z']
    const row : Object = { clazz: cl }
    if (v) row['v'] = v
    if (z) row['z'] = v
    return [dt, row]
  }

  // Construit un "row" pour DB depuis un "data" de document
  dataToRow (data: Object) {
    const [dt, row] =  this._dtRow (data)

    /*
    // propriétés k0, k1 ...
    for(let i = 0; i < dt.keys.length; i++)
      row['k' + i] = this.kiFromPattern('k' + i, data as DocPattern)

    // propriétés i0, i1 ...
    for(let i = 0; i < dt.indexes.length; i++)
      row['i' + i] = this.kiFromPattern('i' + i, data as DocPattern)
    */
    // data 'complet'
    row['data'] = Crypt.syncCrypt(this.key, encode(data))

    return row
  }

  // Construit un "row" pour DB depuis un "data" ZOMBI de document
  // { clazz, v, z, k0, data }
  dataToZombiRow (data: Object) {
    const [dt, row] =  this._dtRow (data)

    // Propriété k0
    row['k0'] = this.kiFromPattern('k0', data as DocPattern)

    // data 'réduit' aux pPropriétés de k0 
    const d = {}
    // dt.keys[0].forEach(p => { d[p] = data[p] })
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
