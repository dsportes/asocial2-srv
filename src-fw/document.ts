import { Operation } from './operation'
import { DocType } from './doctypes'
import { config } from './config'

export enum DocStatus { NONE, UPD, NEW, DEL }

export class Document {
  _clazz: string
  _org: string
  _status?: DocStatus
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

  static newDoc (clazz: string, org: string, status: DocStatus, initVals: Object) : Document {
    const cl = config.documentClasses[clazz]
    if (!cl) return null
    const doc = new cl()
    doc._clazz = clazz
    doc._org = org
    doc._status = status
    doc.release = cl.release
    doc.v = 0
    let data = initVals
    if (status === DocStatus.NONE && cl.mutateCl) {
      const [d, m] = cl.mutate(initVals)
      if (m) data = d
    }
    for (const [key, value] of Object.entries(data)) this[key] = value
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

  get docType () : DocType {
    return DocType.get(this._clazz)
  }

  compile () { return this }
}
