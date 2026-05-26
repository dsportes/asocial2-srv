import { Case, CaseObj } from '../src-fw/documents'
import { AuthRecord, Operation } from '../src-fw/operation'

class Case_admin extends Case {
  constructor (obj: CaseObj) { super(obj) }
  checkSponsor (op: Operation) : boolean {
    return op.authRecord.isAdmin
  }
}

class Case_crauteur extends Case {
  constructor (obj: CaseObj) { super(obj) }
  checkSponsor (op: Operation) : boolean {
    const ar = op.authRecord
    const c = ar.getCred('Topic', 'crauteur', true)
    return c ? true : false
  }
}

class Case_joinauteur extends Case {
  constructor (obj: CaseObj) { super(obj) }

  checkSponsor (op: Operation) : boolean {
    const ar = op.authRecord
    let c = ar.getCred('Topic', 'crauteur', true)
    if (c) return true
    c = ar.getCred('Topic', 'joinauteur', true)
    if (!c) return false
    const setAuts = new Set(c.more.auteurs)
    return setAuts.has(this.subject)
  }
}

export function newCase (obj: CaseObj) {
  switch (obj.topicId) {
    case 'admin' : return new Case_admin(obj)
    case 'crauteur' : return new Case_crauteur(obj)
    case 'joinauteur' : return new Case_joinauteur(obj)
  }
  return new Case(obj)
}