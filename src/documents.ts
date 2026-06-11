import { Document, DocStatus } from '../src-fw/document'
import {  Case, CaseObj, $Credential, $Cred } from '../src-fw/documents'
import { OperationWC } from '../src-fw/index'
import { keyFromB64 } from '../src-fw/b64'
import { config, Registry } from '../src-fw/config'
import { AuthRecord, Operation } from '../src-fw/operation'

export function loadingDA () {
  console.log('app documents loading: ', Registry.sizeD())
}

class Hdr extends Document {
  static release = 0
  static mutateCl (data: object, options?: Object) : [Object, boolean] {
    return [data, false]
  }

}
Registry.registerD(Hdr)

class Case_admin extends Case {
  constructor (obj: CaseObj) { super(obj) }
  async checkSponsor (op: Operation) : Promise<boolean> {
    return op.authRecord.isAdmin
  }
}
Registry.registerD(Case_admin)

class Case_crauteur extends Case {
  constructor (obj: CaseObj) { super(obj) }
  async checkSponsor (op: Operation) : Promise<boolean> {
    const ar = op.authRecord
    const c = ar.getCred('Topic', 'crauteur', true)
    return c ? true : false
  }
}
Registry.registerD(Case_crauteur)

class Case_joinauteur extends Case {
  constructor (obj: CaseObj) { super(obj) }

  async checkSponsor (op: Operation) : Promise<boolean> {
    const ar = op.authRecord
    let c = ar.getCred('Topic', 'crauteur', true)
    if (c) return true
    const doc = await op.db.oneRowByAlias('Auteur', 'nom', this.subject)
    if (!doc) return false
    c = ar.getCred('Auteur', this.subject, true)
    if (!c) return false
    return c.more.join === true
  }
}
Registry.registerD(Case_joinauteur)

class Auteur extends Document {
  static release = 0
  nom: string

  static mutateCl (data: object, options?: Object) : [Object, boolean] {
    return [data, false]
  }

  compile () { return this }

}
Registry.registerD(Auteur)
