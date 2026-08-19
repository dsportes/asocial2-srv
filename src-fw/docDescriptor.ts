import { Crypt } from '../src-fw/crypt'
import { AppExc } from '../src-fw/log'

// Liste ordonnnée de noms de propriétés identifiantes
export type props = string[]

export type Descriptor = {
  name: string
  pk?: props
  nohash?: boolean
  enum?: string[]
  extenum?: string
  subClassBy?: string
  // Pour les services seulement
  sync?: boolean
  embedCreds?: boolean // les credentials sont embarqués dans la propriété creds
  virtual?: boolean
}

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

export type collection = {
  key: props,
  mutable: boolean,
  list?: boolean,
  class: string
}

export class DocDescriptor {
  static regvar = /^[a-z][a-zA-Z0-9]*$/
  static isVarName (n: string) { return DocDescriptor.regvar.test(n)}
  static regdoc = /^[A-Z$][a-zA-Z_$0-9]*$/
  static isDocName (n: string) { return DocDescriptor.regdoc.test(n)}

  static services: Set<string> = new Set()
  static all: Map<string, DocDescriptor> = new Map()

  static size () { return DocDescriptor.all.size}

  static declareService (svc: string) : string {
    DocDescriptor.services.add(svc)
    return svc
  }

  /* clazz de la forme SVC@docCl_sub : 
  - sub est ignoré si présent
  */
  static get(clazz: string, noex?: boolean) { 
    let i = clazz.indexOf('_')
    const cl = i === -1 ? clazz : clazz.substring(0, i)
    const dd = this.all.get(cl)
    if (!dd) 
      throw new AppExc(103, 'not_configured_doc_class', 'DocDescriptor.get', [cl])
    return dd
  }

  svc: string
  name: string
  pk?: string[]
  nohash?: boolean
  enum?: string[]
  extenum?: string = ''
  subClassBy?: string = ''

  // Pour les services seulement
  sync?: boolean
  embedCreds?: boolean // les credentials sont embarqués dans la propriété creds
  virtual?: boolean

  colls : Map<string, collection> | null = null
  indexes: Map<string, idx> | null = null

  get fullName () { return this.svc + '$' + this.name }

  get hasColls () { return this.colls ? true : false }

  get hasIndexes () { return this.indexes ? true : false }

  /* Retourne la valeur du pk d'une "source" ayant les propriétés citées dans pk */
  pkValue (src?: Object, nohash?: boolean) : string {
    if (!this.pk || !this.pk.length || !src) return '1'
    let p = src['pk']
    if (p) return p
    const x = []
    if (src) this.pk.forEach(pr => { x.push(src[pr] || '') })
    p = x.join('/')
    return nohash || this.nohash ? p : Crypt.shaS(p)
  }

  isTestable (idxName: string) : boolean {
    const idx = this.indexes.get(idxName)
    return idx && idx.testable
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
    const key0 = i.key ? i.key[0] : name
    const v0 = src[key0]
    switch (i.type) {
      case propType.STRING : { return v0 || '' }
      case propType.INTEGER : { return v0 || 0 }
      case propType.FLOAT : { return v0 || 0 }
      case propType.HASH : {
        const x = []
        if (i.key) i.key.forEach(p => { x.push(src[p] || '') })
        else x.push(src[name] || '')
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

  checkProps (clName: string, props: props) {
    const ps = new Set()
    for (const p of props) {
      if (!DocDescriptor.isVarName(p)) 
        throw new AppExc(3, 'property_name_syntax', 'docDescriptor', [clName + '.' + p])
      if (ps.has(p)) 
        throw new AppExc(3, 'property_name_duplicated', 'docDescriptor', [clName + '.' + p])
      ps.add(p)
    }
  }

  constructor (svc: string, 
    arg: Descriptor,
    colls?: Map<string, collection> | null,
    indexes?: Map<string, idx> | null) {

    if (!DocDescriptor.services.has(svc))
      throw new AppExc(3, 'not_configured_service', 'docDescriptor', [svc])
    this.svc = svc
    if (!DocDescriptor.isDocName(arg.name)) 
      throw new AppExc(3, 'document_name_syntax', 'docDescriptor', [arg.name])
    const fn = this.svc + '$' + arg.name
    if (DocDescriptor.all.get(fn))
      throw new AppExc(3, 'document_name_duplicated', 'docDescriptor', [fn])
    this.name = arg.name
    if (arg.pk) {
      this.checkProps(this.name, arg.pk)
      this.pk = arg.pk 
    }
    this.nohash = arg.nohash || false
    this.enum = arg.enum
    this.extenum = arg.extenum
    if (arg.subClassBy && !DocDescriptor.isVarName(arg.subClassBy)) 
      throw new AppExc(3, 'property_name_syntax', 'DocDescriptor', [this.name + '.' + arg.subClassBy])
    this.subClassBy = arg.subClassBy

    this.sync = arg.sync || false
    this.embedCreds = arg.embedCreds || false
    this.virtual = arg.virtual || false

    if (colls && colls.size) {
      for(const [nc, coll] of colls) {
        if (!DocDescriptor.isVarName(nc))
          throw new AppExc(3, 'property_name_syntax', 'DocDescriptor', [this.name + '.' + nc])
        this.checkProps(this.name, coll.key)
        if (!coll.mutable) coll.mutable = false
        if (!coll.list) coll.list = false
      }
      this.colls = colls
    }

    if (indexes && indexes.size) {
      for(const [nc, idx] of indexes) {
        if (!DocDescriptor.isVarName(nc))
          throw new AppExc(3, 'property_name_syntax', 'DocDescriptor', [this.name + '.' + nc])
        if (!idx.global) idx.global = false
      }
      this.indexes = indexes
    }

    DocDescriptor.all.set(fn, this)
  }
}

export class FormType {
  static all = new Map<string, FormType>()
  // classes référencées avec /1 et $
  static refClasses1 : Set<string> = new Set()
  static refClasses$ : Set<string> = new Set()

  static size () { return DocDescriptor.all.size}
  static get (svc: string, type: string) { 
    return this.all.get(svc + '$' + type)}

  svc: string
  type: string
  categ: string
  key: string
  creds: string[]

  constructor (svc: string, type: string, categ: string, key: string, creds: string[]) {
    if (!DocDescriptor.services.has(svc))
      throw new AppExc(3, 'EX3_not_configured_service', 'FormType', [svc])
    this.svc = svc
    this.type = type
    this.categ = categ
    this.key = key
    this.creds = creds
    FormType.all.set(svc + '$' + this.type, this)
    for(const c of creds) {
      if (c !== 'A') {
        const cl = c.substring(0, c.indexOf('/'))
        if (c.endsWith('/1')) FormType.refClasses1.add(cl)
        else FormType.refClasses$.add(cl)
      }
    }
  }
}
