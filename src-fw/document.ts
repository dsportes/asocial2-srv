import { Operation } from './operation'

export class Document {
  static release = 0

  static newDoc (clazz: string) : Document {
    const cl = Operation.config.documentClasses[clazz]
    if (!cl) return null
    const doc = new cl()
    doc.clazz = clazz
  }

  static releaseOf (clazz: string) : number {
    const cl = Operation.config.documentClasses[clazz]
    return cl ? cl.release : 0
  }

  clazz: string
  v: number
  z: number
  rel: number

  get islastRelease () : boolean {
    return this.rel === Document.releaseOf(this.clazz)
  }

}
