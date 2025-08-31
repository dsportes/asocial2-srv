
// Liste ordonnnée de noms de propriétés identifiantes
export type props = string[]

/* Type d'index :
HASH : string, base64 du sha16(string[])
INTEGER : int 32 bits
LIST: string[]
*/
export enum idxType { HASH, STRING, INTEGER, FLOAT, LIST }

/* Index d'un document : 
- nom de sa proprité
- type d'index
- true si l'index est global (trans organisation)
*/
export type idx = [ string, idxType, boolean ]

const regvar = /^[a-z][a-zA-Z0-9]*$/
export function isVarName (n: string) { return regvar.test(n)}
const regdoc = /^[A-Z][a-zA-Z_$0-9]*$/
export function isDocName (n: string) { return regdoc.test(n)}
const regth = /^\$[A-Z][a-zA-Z_$0-9]*$/
export function isThName (n: string) { return regth.test(n)}

/* Un type de document est défini par:
- son nom: nom de la classe qui l'implémente
- ses clés (nommées 0 à N) : chaque clé est une liste de propriétés identifiantes
  - keys[0] est la clé primaire, keys[1...] sont les clés secondaires
  - en l'absence de keys, c'est un singleton
  - les propriétés citées en clés secondaires font partie de la clé primaire
  Un index N définit une sous-collection de documents.
- ses indexes éventuels. Chaque index a pour nom celui d'UNE propriété du document.
  - son type peut être STRING, INTEGER, FLOAT
*/
export class DocType {

  nosync : boolean
  readonly name: string
  readonly keys : props[]
  readonly indexes: idx[]
  dthreads : Set<ThType> // type des "fils" auxquel le type de document est rattaché
  readonly err: string

  constructor (name: string, keys?: props[], indexes?: idx[]) {
    this.nosync = false
    this.dthreads = new Set()
    this.name = name
    this.keys = keys && keys.length ? keys : []
    this.indexes = indexes && indexes.length ? indexes : []
    const err = this.checks()
    if (err) this.err = err
  }

  get isSingleton () { return !this.keys.length }

  checks () : string {
    if (!isDocName(this.name)) return 'invalid document name: ' + this.name
    if (this.isSingleton && this.indexes.length)
      return 'singletons cannot have indexes: ' + this.name
    const ps0 = new Set()
    for (let i = 0; i < this.keys.length; i++) {
      const props = this.keys[i]
      const ps = new Set()
      for (const p of props) {
        if (!isVarName(p)) return 'invalid property name [' + p +'] in key [' + i + '] : ' + this.name
        if (ps.has(p)) return 'duplicate property name [' + p +'] in key [' + i + '] : ' + this.name
        if (i === 0) ps0.add(p)
        else {
          if (!ps0.add(p)) return 'property [' + p +'] in key [' + i + '] not in primary key : ' + this.name
          ps.add(p)
        }
      }
    }
    for (let i = 0; i < this.indexes.length; i++) {
      const [ name, varType ] = this.indexes[i]
      if (!isVarName(name)) return 'invalid index property name [' + name +'] ' + this.name
      if (ps0.has(name))
        return 'index property [' + name +'] cannot bue in primary key : ' + this.name
    }
  }
}

export class DocTypeNosync extends DocType {
  constructor (name: string, keys?: props[], indexes?: idx[]) {
    super(name, keys, indexes)
    this.nosync = true
  }
}

// Constituant d'un fil : type de document, clé de sélection d'appartenance au bag
export type docInDThread = Map<DocType, number>

/* Un type de fil est défini par:
- son nom
- la liste des noms des propriétés constructives / identifiantes
- une liste des types de credential acceptables et pour chacun la ou les proprités identifiantes
requises. Pour lire / s'abonner à un bag, l'application terminale doit
fournir dans son opération au moins un credential répondant à cette liste.
- la liste des types de documents pouvant appartenir au bag
  - pour chaque type son numéro de clé de sélection
  - pour un type singleton 0 par convention
*/
export class ThType {

  readonly name : string
  readonly key : props
  readonly docTypes : docInDThread
  readonly err : string

  constructor (name: string, key: props, docTypes: docInDThread) {
    this.name = name
    this.key = key && key.length ? key : []
    this.docTypes = docTypes
    const err = this.checks()
    if (err) this.err = err
  }

  get isSingleton () { return this.key.length === 0 }

  checks () : string {
    if (!isThName(this.name)) return 'invalid doc thread name: ' + this.name
    const pks = new Set()
    for(let i = 0; i < this.key.length; i++) {
      const p = this.key[i]
      if (!isVarName(p)) return 'invalid property name [' + p + '] in key of bag : ' + this.name
      if (pks.has(p)) return 'duplicate property name [' + p + '] in bag : ' + this.name
      pks.add(p)
    }

    const drn = new Set<DocType>()
    for (const [dt, selk] of this.docTypes) {
      if (drn.has(dt)) return 'duplicate document type [' + dt.name + '] in bag : ' + this.name
      drn.add(dt)
      if (selk === -1) {
        if (dt.isSingleton) continue
        else return 'missing selection key for type [' + dt.name + '] in bag : ' + this.name
      }
      const px = dt.keys[selk]
      if (px.length !== pks.size) return 'invalid selection key length [' + selk + '] for document type [' + dt.name + '] in bag : ' + this.name
      for (const p of px) {
        if (!pks.has(p)) return 'selection key [' + selk + '] for document type [' + dt.name + '] has property [' + p + '] not in keys of bag : ' + this.name
      }
    }
  }
}

export class DocSchema {
  private readonly docTypes : Object
  private readonly thTypes : Object
  readonly errors : string[]
  readonly docNames : Set<string>

  constructor(docTypes: Object, thTypes: Object) {
    this.docNames = new Set()
    const t = []
    for (const [k, v] of Object.entries(docTypes)) {
      if (this.docNames.has(v.name)) t.push('duplicate name [' + v.name + ']')
      if (k !== v.name) t.push('names mismatch [' + k + ' / ' + v.name + ']')
      if (v.err) t.push(v.err)
      this.docNames.add(v.name)
    }
    for (const [k, v] of Object.entries(thTypes)) { 
      if (this.docNames.has(v.name)) t.push('duplicate name [' + v.name + ']')
      if (k !== v.name)t.push('names mismatch [' + k + ' / ' + v.name + ']')
      if (v.err) t.push(v.err)
      this.docNames.add(v.name)
    }
    if (t.length === 0) {
      this.docTypes = docTypes
      this.thTypes = thTypes
    } else {
      this.errors = t
      return
    }

    for (const [k, v] of Object.entries(thTypes)) {
      for(const [dt] of v.docTypes) {
        dt.dthreads.add(v.name)
      }
    }
  }

  getDoc (name: string) : DocType {
    return this.docTypes[name]
  }

  getListProps (name: string) : number[] {
    const l = []
    const dt = this.getDoc(name)
    if (dt) {
      dt.indexes.forEach((t, i) => {
        if (t[1] === idxType.LIST) l.push(i)
      })
    }
    return l
  }

  getTh (name: string) : ThType {
    return this.thTypes[name]
  }
}

