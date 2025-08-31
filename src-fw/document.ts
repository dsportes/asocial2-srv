import { Operation } from './operation'
import { DocType } from './doctypes'

export enum DocChange { NONE, UPD, NEW, DEL }

export type DocData = {
  _status?: DocChange,
  release?: number, // numéro de release de la structure
  clazz: string, // classe
  org?: string, // code de l'organisation
  v?: number, // version
  z?: number, // jour de zombi
}

export type DocPattern = {
  org: string,
  clazz: string
}

export class Document {
  static release = 0

  static mutate (data: DocData, options?: Object) : [DocData, boolean] {
    const fn = Operation.config.documentClasses['MUTATE']
    return fn(data, options)
  }

  static newDoc (clazz: string, release?: number) : Document {
    const cl = Operation.config.documentClasses[clazz]
    if (!cl) return null
    const doc = new cl()
    doc.clazz = clazz
    doc.release = release || cl.release
    return doc
  }

  /* Ajoute éventuellement au document les propriétés de l'objet
  passé en argument et compile le document */
  static compile (doc: Document, props?: Object) {
    if (props) for (const [key, value] of Object.entries(props)) 
      doc[key] = value
    return doc.compile()
  }

  // Numéro de release de la structure de la classe
  get classRelease() : number {
    const cl = Operation.config.documentClasses[this.clazz]
    return cl ? cl.release : 0
  }

  _status?: DocChange
  clazz: string
  v: number
  z: number
  release: number // numéro de release de la structure de l'objet

  get hasLastRelease () : boolean {
    return this.release === this.classRelease
  }

  // Ajoute au document les propriétés de l'objet passé en argument
  populate (props: Object) : Document {
    if (props) for (const [key, value] of Object.entries(props)) 
      this[key] = value
    return this
  }

  compile () { return this }

  get docType () : DocType {
    return Operation.config.docSchema.getDoc(this.clazz)
  }

  get pattern () : DocPattern {
    const dt = this.docType
    const pat = { clazz: this.clazz } as DocPattern
    if (this['org']) pat.org = this['org']
    dt.keys[0].forEach(p => { pat[p] = this[p] || '' })
    return pat
  }

}
