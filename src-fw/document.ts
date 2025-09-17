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
  _clazz: string
  _change?: DocChange
  _org: string
  v: number
  release: number // numéro de release de la structure de l'objet

  /* Mute un data en fonction de sa release et d'éventuelles options
  Met à jour, supprime ajoute les prpropriétés requises dans la
  dernière version en fonction de sa release actuell.
  Retourne couple du data (ancien ou celui muté) 
  et de l'indicateur de mutation (false si inchangé)
  */
  static mutate (clazz: string, data: any, options?: Object) : [any, boolean] {
    const cl = config.documentClasses[clazz]
    if (!cl) return [data, false]
    const f = cl.mutateCl
    return f ? f(data, options) : [data, false]
  }

  static newDoc (clazz: string, org: string) : Document {
    const cl = config.documentClasses[clazz]
    if (!cl) return null
    const doc = new cl()
    doc._clazz = clazz
    doc._org = org
    doc.release = cl.release
    doc.v = 0
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
