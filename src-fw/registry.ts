import { AppExc } from './log'
import { $Document } from './document'
import { DocDescriptor } from './docDescriptor'

export const subCl = (clazz: string) => {
  const i = clazz.indexOf('_')
  return i === -1 ? '' : clazz.substring(i + 1)
}

export const medCl = (clazz: string) => {
  let i = clazz.indexOf('_')
  const d = i === -1 ? clazz : clazz.substring(0, i)
  i = d.indexOf('$')
  return i === -1 ? d : d.substring(i + 1)
}

export const topCl = (svc: string, docCl: string) : string => {
  const i = docCl.indexOf('_')
  const d = i === -1 ? docCl : docCl.substring(0, i)
  return d.indexOf('$') === -1 ? svc + '$' + d : d
}

export class Registry {
  static classes : Map<string, Function> = new Map()
  static managers : Set<string> = new Set()

  static allClasses () : string[] { return Array.from(Registry.classes.keys()) }

  static regOp = new Map()
  static sizeOp () { return Registry.regOp.size }

  static register (clazz: Function) { 
    const topcl = topCl('', clazz.name)
    // const subCl = i === -1 ? '' : clazz.name.substring(i + 1)
    const i = clazz.name.indexOf('$')
    const svc = topcl.substring(0, i)
    const docCl = topcl.substring(i + 1)
    if (!svc || !docCl)
      throw new AppExc(103, 'invalid_class_name', null, [clazz.name])
    clazz['_docDescriptor'] = DocDescriptor.get(topcl)
    if (clazz['manager']) 
      Registry.managers.add(clazz.name)
    this.classes.set(clazz.name, clazz)
  }

  // Retourne le constructor de la SOUS-CLASSE de docCl selon la valeur de son data
  static getClass (svc: string, docCl: string, data: Object, nohash?: boolean ) : Function {
    const topcl = topCl(svc, docCl)
    const subClassBy = DocDescriptor.get(topcl).subClassBy
    const cln = topCl(svc, docCl) + (subClassBy ? '_' + data[subClassBy] : '')
    const cl = Registry.classes.get(cln)
    if (!cl) {
      const trace = new Error("Captured for inspection")
      throw new AppExc(103, 'not_configured_doc_class', Registry.getClass, [cln], trace.stack)
    }
    return cl
  }

  // Construit un document de la SOUS-CLASSE de docCl selon la valeur de son data
  static newD (svc: string, docCl: string, data: Object ) : $Document {
    const cl = Registry.getClass(svc, docCl, data)
    // @ts-expect-error
    const d = new cl() as $Document
    return d
  }

  static registerOp (cl: Function) { 
    Registry.regOp.set(cl.name, cl)
  }
  
  static newOp (name: string) {
    const cl = Registry.regOp.get(name)
    return cl ? new cl() : null
  }

  /* 
  // Retourne le constructor de la classe MAJEURE (sans sous classe)
  static getCl (svc: string, docCl: string) : Function {
    const cl = Registry.classes.get(topCl(svc, docCl))
    if (!cl) 
      throw new AppExc(103, 'not_configured_doc_class', null, [topCl(svc, docCl)])
    return cl
  }
  // Retourne la pk de la SOUS-CLASSE de docCl selon la valeur de son data
  static getPk (svc: string, docCl: string, data: Object, nohash?: boolean) : string {
    const dd = DocDescriptor.get(topCl(svc, docCl))
    return dd.pkValue(data, nohash)
  }
  */
}
