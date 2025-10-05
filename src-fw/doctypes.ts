import { Crypt } from './crypt'

// Liste ordonnnée de noms de propriétés identifiantes
export type props = string[]

/* Type d'index :
HASH : string, base64 du shaS(string[])
STRING : string
INTEGER : int 32 bits
FOLAT : double
LIST: string[]
*/
export enum propType { STRING, INTEGER, FLOAT, LIST, HASH }

/* Usage d'un index
SIMPLE : index simple, dans une organisation
GLOBAL : index global, toutes organisations
COL : collection (notifiable / synchronisable)
IMUTCOL : collection sur une propriété constante du document 
*/
export enum idxUse { SIMPLE, GLOBAL, COL, IMUTCOL }

/* Index: 
- type d'index
- true si l'index est global (trans organisation)
*/
export type idx = {
  type: propType,
  global?: boolean,
  key?: props
}

export type docHeader = {
  name: string,
  sync: boolean,
  pk: props
}

export type collection = {
  key: props,
  mutable: boolean,
  list?: boolean 
}

const regvar = /^[a-z][a-zA-Z0-9]*$/
export function isVarName (n: string) { return regvar.test(n)}
const regdoc = /^[A-Z][a-zA-Z_$0-9]*$/
export function isDocName (n: string) { return regdoc.test(n)}

/* Un type de document est défini par:
- son header: { name, sync, pk }
- la Map de ses collections nommées { key, mutable, list }
- la Map de ses propriétés indexées nommées { type, global }
*/
export class DocType {
  static ndt = 1
  static docTypes = new Map<string, DocType>()
  static errors = []

  static get (n: string) : DocType {
    return DocType.docTypes.get(n)
  }

  /* Retourne la valeur du pk d'une "source" ayant les propriétés citées dans pk */
  static getPk (clazz: string, src: Object, nohash?: boolean) : string {
    if (clazz === 'Org') return '1'
    const dt = DocType.get(clazz)
    const x = []
    if (dt && src) dt.pk.forEach(p => { x.push(src[p] || '') })
    const p = x.join('/')
    return nohash ? p : Crypt.shaS(p)
  }

  /* Retourne la valeur du pk d'une "source" ayant les propriétés citées dans pk */
  pkValue (src: Object, nohash?: boolean) : string {
    if (!this.pk.length) return '1'
    const x = []
    if (src) this.pk.forEach(p => { x.push(src[p] || '') })
    const p = x.join('/')
    return nohash ? p : Crypt.shaS(p)
  }

  /* Retourne la valeur d'une collection name d'une "source" ayant les propriétés citées */
  getColl (src: Object, name: string) : string[] {
    const c = this.hasColls ? this.colls.get(name) : null
    if (!c) return null
    if (c.list) {
      const x = []
      const p = src[name] as string[]
      if (p) p.forEach(v => { if (v) x.push(Crypt.shaS(v))})
      return x
    }
    const x = []
    c.key.forEach(p => { x.push(src[p] || '') })
    return [Crypt.shaS(x.join('/'))]
  }

  /* Retourne la valeur d'un idx name d'une "source" ayant les propriétés citées */
  getIdx (src: Object, name: string) : any {
    const i = this.hasIndexes ? this.indexes.get(name) : null
    if (!i) return null
    const v = src[name]
    switch (i.type) {
      case propType.STRING : { return v || '' }
      case propType.INTEGER : { return v || 0 }
      case propType.FLOAT : { return v || 0 }
      case propType.HASH : { return Crypt.shaS(v || '') }
      case propType.LIST : {         
        const x = []
        if (v as string[]) (v as string[]).forEach(t => { if (t) x.push(Crypt.shaS(t))})
        return x
      }
    }
  }

  extractColls (src: Object) : Object {
    const t = {}
    if (this.hasColls) this.colls.forEach((v, k) => {
      const x = this.getColl(src, k)
      if (x) t[k] = x
    })
    return t
  }

  readonly n: number
  readonly name: string
  readonly sync : boolean
  readonly pk: props
  readonly colls : Map<string, collection>
  readonly indexes: Map<string, idx>

  err: string

  er (s: string, d? : string) {
    this.err = this.n + ' - ' + s + (d ? ' [' + d + ']' : '')
    DocType.errors.push(this.err)
  }

  isProps (props: props) : boolean {
    const ps = new Set()
    for (const p of props) {
      if (!isVarName(p)) { this.er('invalid property name', p); return false }
      if (ps.has(p)) { this.er('duplicate property name', p); return false }
    }
    return true
  }

  constructor (
    h: docHeader, 
    colls: Map<string, collection>, 
    indexes: Map<string, idx>) {

    this.n = DocType.ndt++
    this.err = ''
    this.name = '#' + this.n

    if (h) {
      if (isDocName(h.name)) this.name = h.name
      else this.er('invalid document name', h.name)
    } else this.er('Document header missing')
    if (!this.err) {
      if (DocType.docTypes.has(this.name)) { this.er('duplicate DocType', this.name); return this }
      DocType.docTypes.set(this.name, this)
    } else return this
    if (!h.pk || !h.pk.length) this.pk = []
    else {
      if (!this.isProps(h.pk)) return this
      this.pk = h.pk
    }
    this.sync = h.sync || false

    if (colls && colls.size) {
      for(const [nc, coll] of colls) {
        if (!isVarName(nc)) { this.er('invalid property name', nc); return this }
        if (!this.isProps(coll.key)) return this
        if (!coll.mutable) coll.mutable = false
        if (!coll.list) coll.list = false
      }
      this.colls = colls
    }

    if (indexes && indexes.size) {
      for(const [nc, idx] of indexes) {
        if (!isVarName(nc)) { this.er('invalid property name', nc); return this }
        if (!idx.global) idx.global = false
      }
      this.indexes = indexes
    }
  }

  get hasColls () { return this.colls ? true : false }

  get hasIndexes () { return this.indexes ? true : false }

}

