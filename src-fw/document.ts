import { Operation } from './operation'
import { DocType } from './doctypes'
import { config } from './config'

export enum DocChange { NONE, UPD, NEW, DEL }

export type DocData = {
  _status?: DocChange,
  release?: number, // numéro de release de la structure
  clazz: string, // classe
  org?: string, // code de l'organisation
  v?: number, // version
  z?: number, // jour de zombi
}

export class Document {
  static release = 0

  static mutate (data: DocData, options?: Object) : [DocData, boolean] {
    const fn = config.documentClasses['MUTATE']
    return fn(data, options)
  }

  static newDoc (clazz: string, release?: number) : Document {
    const cl = config.documentClasses[clazz]
    if (!cl) return null
    const doc = new cl()
    doc._clazz = clazz
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
    const cl = config.documentClasses[this._clazz]
    return cl ? cl.release : 0
  }

  _change?: DocChange
  _clazz: string
  _org: string
  v: number
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
    return DocType.get(this._clazz)
  }

}
