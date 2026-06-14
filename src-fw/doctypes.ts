import { Crypt } from './crypt'

// Liste ordonnnée de noms de propriétés identifiantes
export type props = string[]

/* Type d'index :
HASH : string, base64 du shaS(string[])
STRING : string
INTEGER : int 32 bits
FLOAT : double
LIST: string[]
*/
export enum propType { STRING, INTEGER, FLOAT, LIST, HASH }

/* Usage d'un index
SIMPLE : index simple, dans une organisation
GLOBAL : index global, toutes organisations (pour les tasks)
COL : collection (notifiable / synchronisable)
IMUTCOL : collection sur une propriété constante du document 
*/
export enum idxUse { SIMPLE, GLOBAL, COL, IMUTCOL }

/* Index: 
- type d'index
- true si l'index est global (trans organisation)
- testable: si true l'existence du document par cet "alias" A LE DROIT d'être testée
*/
export type idx = {
  type: propType
  global?: boolean
  key?: props
  testable?: boolean
  nohash?: boolean
}

/* Pour une classe virtuelle la liste des pk est,
- soit absente (ni enum, ni extenum) : c'est un singleton (pk: '1')
- soit énumérée in extenso dans ce schéma: enum: [toto, titi]
- soit énumérée dans un SINGLETON de nom donné par: extenum: 'maListe'
Si le nom de la liste se termine par _, le code de l'organisation y est
ajouté (l'énumération est spécifique de l'organisation).
*/
export type docHeader = {
  name: string
  sync?: boolean
  pk?: props
  manager?: boolean // classe dont seul un aministrateur peut créer un credential
  nohash?: boolean
  embedCreds?: boolean // les credentials sont embarqués dans la propriété creds
  virtual?: boolean
  enum?: string[]
  extenum?: string
  subClassBy?: string
}

export type collection = {
  key: props,
  mutable: boolean,
  list?: boolean 
}

const regvar = /^[a-z][a-zA-Z0-9]*$/
export function isVarName (n: string) { return regvar.test(n)}
const regdoc = /^[A-Z$][a-zA-Z_$0-9]*$/
export function isDocName (n: string) { return regdoc.test(n)}

/* Un type de document est défini par:
- son header: { name, sync, pk }
- la Map de ses collections nommées { key, mutable, list }
- la Map de ses propriétés indexées nommées { type, global }
*/
export class DocType {
  static ndt = 1
  static docTypes = new Map<string, DocType>()
  static errors: string[] = []
  static managerClasses: Set<string> = new Set()

  static get (clazz: string) : DocType | null {
    return DocType.docTypes.get(clazz) || null
  }

  static isTestable (clazz: string, idx: string) {
    const dt = DocType.docTypes.get(clazz)
    if (!dt) return false
    const i = (dt.indexes && dt.indexes.get(idx)) || null
    return i && i.type === propType.STRING && i.testable
  }

  /* Retourne la valeur du pk d'une "source" src:
  - soit ayant les propriétés citées dans pk
  - soit src = { pk: 'a/b/c' }
  */
  static getPk (clazz: string, src?: Object, nohash?: boolean) : string {
    const dt = DocType.get(clazz)
    if (!dt.pk || !src) return '1'
    let p = src['pk']
    if (!p) {
      const x = []
      if (dt && src) dt.pk.forEach(p => { x.push(src[p] || '') })
      p = x.join('/')
    }
    return nohash || (dt && dt.nohash) ? p : Crypt.shaS(p)
  }

  /* Retourne la valeur du pk d'une "source" ayant les propriétés citées dans pk */
  pkValue (src?: Object, nohash?: boolean) : string {
    if (!this.pk || !this.pk.length || !src) return '1'
    const x = []
    if (src) this.pk.forEach(p => { x.push(src[p] || '') })
    const p = x.join('/')
    return nohash || this.nohash ? p : Crypt.shaS(p)
  }

  /* Retourne la valeur d'une collection name d'une "source" ayant les propriétés citées */
  getCollId (src: Object, name: string) : string[] | null {
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
      case propType.STRING : { return src[name] || '' }
      case propType.INTEGER : { return src[name] || 0 }
      case propType.FLOAT : { return src[name] || 0 }
      case propType.HASH : { 
        const x = []
        i.key.forEach(p => { x.push(src[p] || '') })
        return Crypt.shaS(x.join('/'))
      }
      case propType.LIST : {         
        const x = []
        const v = src[name] as string[]
        if (v) v.forEach(t => { if (t) x.push(i.nohash ? t : Crypt.shaS(t))})
        return x
      }
    }
  }

  /* Map: traçant les collections
    - clé: nom de la collection
    - valeur: valeur de la propriété clé de la collection dans le document 
  */
  extractColls (src: Object) : Map<string, string[]> {
    const m = new Map()
    if (!this.hasColls) return m
    for(const [colName, ] of this.colls) {
      const val = this.getCollId(src, colName)
      if (val) m.set(colName, val)
    }
    return m
  }

  readonly n: number
  readonly name: string
  readonly sync : boolean = false
  readonly pk: props = []
  readonly nohash: boolean = false
  readonly virtual: boolean = false
  readonly manager: boolean = false
  readonly subClassBy: string = ''
  readonly embedCreds: boolean = false
  readonly colls : Map<string, collection> | null = null
  readonly indexes: Map<string, idx> | null = null

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
    if (h.virtual) {
      this.virtual = true
      return
    }
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
    this.nohash = h.nohash || false
    this.embedCreds = h.embedCreds || false
    this.manager = h.manager || false
    this.subClassBy = h.subClassBy || ''
    if (this.manager)
      DocType.managerClasses.add(this.name)

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

export class FormType {
  static ndt = 1
  static formTypes = new Map<string, FormType>()
  // classes référencées avec /1 et $
  static refClasses1 : Set<string> = new Set()
  static refClasses$ : Set<string> = new Set()

  type: string
  key: string
  creds: string[]

  constructor (type: string, key: string, creds: string[]) {
    this.type = type
    this.key = key
    this.creds = creds
    FormType.formTypes.set(type, this)
    for(const c of creds) {
      const cl = c.substring(0, c.indexOf('/'))
      if (c.endsWith('/1')) FormType.refClasses1.add(cl)
      else FormType.refClasses$.add(cl)
    }
  }
}
