import { Document, DocStatus } from '../src-fw/document'
import {  OrgA, PropertyA, Case, CaseObj, Credential, Cred } from '../src-fw/documents'
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

class Org extends OrgA {
  static release = 0

  static mutateCl (data: object, options?: Object) : [Object, boolean] {
    return [data, false]
  }

  compile () { return this }

}
Registry.registerD(Org)

class Property extends PropertyA {
  static release = 0

  static mutateCl (data: object, options?: Object) : [Object, boolean] {
    return [data, false]
  }

  compile () { return this }

}
Registry.registerD(Property)

  /* 
type InvitValOM = { // arguments de validation d'un Credential Org.manager
  pubV: string // clé publique de vérification du credential
  name: string // nom / pseudo facultatif pour information à stocker en cond
}

type InvValAuteur = {
  nom: string // nom d'auteur
  pemvA: string // pemV pour le credential d'accès à l'auteur
  pemcA: string // pemV pour le credential d'accès à l'auteur
  pemvS: string // pemV pour le credential Sponsor (s'il y a lieu)
  credIdA: string
  credIdS: string
}

  async validate_orgManager (op: OperationWC, args: InvitValOM) : Promise<number> {
    // Checking de etc et args
    if (!this.etc['credId']) return 1
    if (!args.pubV) return 2
    
    // Enregistrement du credential
    const obj = {
      credId: this.etc['credId'],
      role: 'Org.manager',
      docId: '',
      pubv: args.pubV,
      limit: 0,
      cond: { name: this.etc['name'] || '???'}
    }
    op.cache.newDoc('Credential', obj)
    return 0
  }
    */

  /* Validation d'un document 'Auteur' 
    - docId: depuis etc
    - nom: depuis args
  - d'un Credential sur cet auteur avec un pemv passé en args
  - optionnellement d'un Credential de Sponsor sur 'Auteur' avec un pemv passé en args

    nom: string // nom d'auteur
    pemvA: string // pemV pour le credential d'accès à l'auteur
    pemvS: string // pemV pour le credential Sponsor (s'il y a lieu)
    credIdA: string
    credIdS: string
  
  async validate_auteur (op: OperationWC, args: InvValAuteur) : Promise<number> {

    if (this.etc.newA === 1) {
      // Credential d'accès à Auteur
      const cred: Cred = {
        credId: args.credIdA,
        pubv: keyFromB64(args.pemvA),
        pubc: keyFromB64(args.pemcA),
        limit: 0,
        opaque: null,
        more: { p: 'A', name: args.nom || '?' }
      }

      // Création de Auteur sauf si existait déjà (retry)
      const a = await op.cache.getDoc('Auteur', { autid: this.etc.docId })
      if (!a) op.cache.newDoc('Auteur', { 
          autid: this.etc.docId, 
          nom: args.nom,
          creds: { }
        })
      else a._status = DocStatus.UPD
      a.creds[args.credIdA] = cred
    }
    /*
    if (this.etc.option > 1) {
      const docId = 'Auteur' + (this.etc.option === 2 ? '' : ('/' + this.etc.categ))
      const cs = new Credential()
      cs.credId = args.credIdS
      cs.role = 'Sponsor.'
      cs.docId = docId
      cs.pubv = args.pemvS
      cs.limit = 0
      cs.cond = { p: 'A', name: args.nom || '?' }
      const c = await op.cache.getDoc('Credential', cs) as Credential
      if (!c) 
        op.cache.newDoc('Credential', cs) 
    }
    */

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
